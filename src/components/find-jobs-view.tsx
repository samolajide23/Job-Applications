"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAge } from "@/lib/dates";
import { matchesKeywords, roleIsSenior, withinPostedWindow } from "@/lib/filters";
import { KEYWORD_PRESETS, type Application, type QueueRules } from "@/lib/types";

export function FindJobsView({
  applications,
  rules,
  onPatch,
  onBulk,
  onDiscover,
  onSaveRules,
  discovering,
}: {
  applications: Application[];
  rules: QueueRules;
  onPatch: (id: string, patch: Record<string, unknown>) => Promise<void>;
  onBulk: (ids: string[], status: "queued" | "dismissed" | "discovered") => Promise<void>;
  onDiscover: () => Promise<void>;
  onSaveRules: (rules: QueueRules) => Promise<void>;
  discovering: boolean;
}) {
  const roles = applications.filter((application) =>
    ["discovered", "queued"].includes(application.status),
  );
  const [keywords, setKeywords] = useState<string[]>(rules.keywords);
  const [hideSenior, setHideSenior] = useState(rules.excludeSenior);
  const [eligibleOnly, setEligibleOnly] = useState(rules.eligibleOnly);
  const [source, setSource] = useState("all");
  const [days, setDays] = useState(rules.postedWithinDays);
  const [query, setQuery] = useState("");
  const [minScoreOnly, setMinScoreOnly] = useState(false);
  const [minScore, setMinScore] = useState(rules.minScore);
  const [autoQueue, setAutoQueue] = useState(rules.autoQueue);
  const [showFilters, setShowFilters] = useState(false);

  const sources = useMemo(
    () => [...new Set(roles.map((application) => application.source))].sort(),
    [roles],
  );

  const visible = roles
    .filter((application) => {
      if (hideSenior && roleIsSenior(application)) return false;
      if (eligibleOnly && application.scoreBreakdown?.eligible === "ineligible") return false;
      if (!matchesKeywords(application, keywords)) return false;
      if (source !== "all" && application.source !== source) return false;
      if (!withinPostedWindow(application, days)) return false;
      if (minScoreOnly && application.score !== null && application.score < minScore) return false;
      if (query.trim()) {
        const haystack = `${application.company} ${application.title} ${application.location ?? ""}`.toLowerCase();
        if (!haystack.includes(query.trim().toLowerCase())) return false;
      }
      return true;
    })
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  const queueable = visible.filter((application) => application.status === "discovered");

  function toggleKeyword(keyword: string) {
    setKeywords((current) =>
      current.some((item) => item.toLowerCase() === keyword.toLowerCase())
        ? current.filter((item) => item.toLowerCase() !== keyword.toLowerCase())
        : [...current, keyword],
    );
  }

  function handleClearFilters() {
    setHideSenior(false);
    setEligibleOnly(false);
    setMinScoreOnly(false);
    setKeywords([]);
    setSource("all");
    setQuery("");
  }

  async function handleSaveRules() {
    await onSaveRules({
      autoQueue,
      minScore,
      excludeSenior: hideSenior,
      eligibleOnly,
      keywords,
      postedWithinDays: days,
    });
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">Find jobs</h2>
          <p className="text-sm text-muted-foreground">
            Fresh roles from the boards. Queue the ones worth applying to.
          </p>
        </div>
        <Button type="button" onClick={() => void onDiscover()} disabled={discovering} className="shrink-0">
          {discovering ? "Searching…" : "Search boards"}
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter by company, title, or location"
          aria-label="Filter jobs"
          className="max-w-md"
        />
        <div className="flex flex-wrap gap-1.5">
          {KEYWORD_PRESETS.map((keyword) => {
            const active = keywords.some((item) => item.toLowerCase() === keyword.toLowerCase());
            return (
              <button
                key={keyword}
                type="button"
                aria-pressed={active}
                onClick={() => toggleKeyword(keyword)}
                className={`rounded-md px-2.5 py-1 text-xs ${
                  active
                    ? "bg-foreground text-background"
                    : "bg-muted/80 text-muted-foreground hover:text-foreground"
                }`}
              >
                {keyword}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <label className="inline-flex items-center gap-2 text-muted-foreground">
            <input
              type="checkbox"
              checked={hideSenior}
              onChange={(event) => setHideSenior(event.target.checked)}
            />
            Hide senior
          </label>
          <label className="inline-flex items-center gap-2 text-muted-foreground">
            <input
              type="checkbox"
              checked={eligibleOnly}
              onChange={(event) => setEligibleOnly(event.target.checked)}
            />
            Hide blocked locations
          </label>
          <button
            type="button"
            className="text-xs text-primary underline-offset-2 hover:underline"
            onClick={() => setShowFilters((open) => !open)}
            aria-expanded={showFilters}
          >
            {showFilters ? "Hide more filters" : "More filters"}
          </button>
        </div>
        {showFilters ? (
          <div className="grid gap-3 rounded-xl bg-muted/40 p-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1 text-xs text-muted-foreground">
              Posted within (days)
              <Input
                type="number"
                min={1}
                max={90}
                value={days}
                aria-label="Posted within days"
                onChange={(event) => setDays(Number(event.target.value))}
              />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Min score
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={minScoreOnly}
                  aria-label="Require minimum score"
                  onChange={(event) => setMinScoreOnly(event.target.checked)}
                />
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={minScore}
                  aria-label="Minimum score"
                  onChange={(event) => setMinScore(Number(event.target.value))}
                />
              </div>
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Source
              <select
                aria-label="Job source"
                value={source}
                onChange={(event) => setSource(event.target.value)}
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
              >
                <option value="all">All sources</option>
                {sources.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-flex items-end gap-2 pb-1 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={autoQueue}
                onChange={(event) => setAutoQueue(event.target.checked)}
              />
              Auto-queue matches
            </label>
            <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
              <Button type="button" variant="outline" size="sm" onClick={() => void handleSaveRules()}>
                Save as defaults
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={handleClearFilters}>
                Clear filters
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-foreground/10 pb-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{visible.length}</span> roles
          {visible.length !== roles.length ? ` · ${roles.length} total` : ""}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={queueable.length === 0}
          onClick={() => void onBulk(queueable.map((application) => application.id), "queued")}
        >
          Queue all shown ({queueable.length})
        </Button>
      </div>

      {roles.length === 0 ? (
        <EmptyState
          title="No jobs yet"
          body="Search the boards to pull Greenhouse, Jobicy, Remotive, and Remote OK roles."
          actionLabel={discovering ? "Searching…" : "Search boards"}
          onAction={() => void onDiscover()}
          disabled={discovering}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title="Nothing matches"
          body="Try clearing keywords or turning off Hide senior / Hide blocked locations."
          actionLabel="Clear filters"
          onAction={handleClearFilters}
        />
      ) : (
        <ul className="divide-y divide-foreground/10">
          {visible.map((application) => (
            <li key={application.id} className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <span className={`font-mono text-sm tabular-nums ${scoreClass(application.score)}`}>
                    {application.score ?? "—"}
                  </span>
                  <h3 className="text-base font-medium leading-snug">{application.title}</h3>
                  {application.status === "queued" ? (
                    <span className="text-xs text-muted-foreground">In queue</span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {application.company}
                  {application.location ? ` · ${application.location}` : ""}
                  {` · ${application.source}`}
                  {application.postedAt ? ` · ${formatAge(application.postedAt)}` : ""}
                </p>
                {application.scoreBreakdown?.reasons[0] ? (
                  <p className="mt-1.5 line-clamp-1 text-xs text-muted-foreground">
                    {application.scoreBreakdown.reasons[0]}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <Button
                  type="button"
                  size="sm"
                  disabled={application.status === "queued"}
                  onClick={() => void onPatch(application.id, { status: "queued" })}
                >
                  {application.status === "queued" ? "Queued" : "Queue"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void onPatch(application.id, { status: "dismissed" })}
                >
                  Pass
                </Button>
                <a
                  href={application.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center px-2 text-sm text-primary underline-offset-2 hover:underline"
                >
                  Open
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
  disabled,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid place-items-center gap-3 py-14 text-center">
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
      </div>
      <Button type="button" variant="outline" onClick={onAction} disabled={disabled}>
        {actionLabel}
      </Button>
    </div>
  );
}

function scoreClass(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 60) return "text-emerald-700 dark:text-emerald-300";
  if (score >= 40) return "text-amber-700 dark:text-amber-200";
  return "text-muted-foreground";
}
