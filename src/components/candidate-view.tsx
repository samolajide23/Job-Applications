"use client";

import { useMemo, useState } from "react";
import { AddDialog, type NewRowInput } from "@/components/entry-dialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAge } from "@/lib/dates";
import { matchesKeywords, roleIsSenior, withinPostedWindow } from "@/lib/filters";
import { KEYWORD_PRESETS, type Application, type QueueRules } from "@/lib/types";

export function CandidateView({
  applications,
  rules,
  onPatch,
  onBulk,
  onCreate,
  onDiscover,
  onSaveRules,
  discovering,
}: {
  applications: Application[];
  rules: QueueRules;
  onPatch: (id: string, patch: Record<string, unknown>) => Promise<void>;
  onBulk: (ids: string[], status: "queued" | "dismissed" | "discovered") => Promise<void>;
  onCreate: (input: NewRowInput) => Promise<void>;
  onDiscover: () => Promise<void>;
  onSaveRules: (rules: QueueRules) => Promise<void>;
  discovering: boolean;
}) {
  const candidates = applications.filter((application) =>
    ["discovered", "dismissed", "queued"].includes(application.status),
  );
  const [keywords, setKeywords] = useState<string[]>(rules.keywords);
  const [hideSenior, setHideSenior] = useState(rules.excludeSenior);
  const [eligibleOnly, setEligibleOnly] = useState(rules.eligibleOnly);
  const [source, setSource] = useState("all");
  const [days, setDays] = useState(rules.postedWithinDays);
  const [company, setCompany] = useState("");
  const [minScoreOnly, setMinScoreOnly] = useState(false);
  const [minScore, setMinScore] = useState(rules.minScore);
  const [autoQueue, setAutoQueue] = useState(rules.autoQueue);

  const sources = useMemo(
    () => [...new Set(candidates.map((application) => application.source))].sort(),
    [candidates],
  );
  const visible = candidates
    .filter((application) => {
      if (hideSenior && roleIsSenior(application)) return false;
      if (eligibleOnly && application.scoreBreakdown?.eligible === "ineligible") {
        return false;
      }
      if (!matchesKeywords(application, keywords)) return false;
      if (source !== "all" && application.source !== source) return false;
      if (!withinPostedWindow(application, days)) return false;
      if (company && !application.company.toLowerCase().includes(company.trim().toLowerCase())) return false;
      if (minScoreOnly && application.score !== null && application.score < minScore) return false;
      return true;
    })
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const queueable = visible.filter((application) => application.status === "discovered");
  const filterStats = useMemo(() => {
    let senior = 0;
    let location = 0;
    let keyword = 0;
    let score = 0;
    let window = 0;
    for (const application of candidates) {
      if (hideSenior && roleIsSenior(application)) {
        senior += 1;
        continue;
      }
      if (eligibleOnly && application.scoreBreakdown?.eligible === "ineligible") {
        location += 1;
        continue;
      }
      if (!matchesKeywords(application, keywords)) {
        keyword += 1;
        continue;
      }
      if (!withinPostedWindow(application, days)) {
        window += 1;
        continue;
      }
      if (minScoreOnly && application.score !== null && application.score < minScore) {
        score += 1;
      }
    }
    return { senior, location, keyword, score, window };
  }, [candidates, hideSenior, eligibleOnly, keywords, days, minScoreOnly, minScore]);

  function handleRelaxFilters() {
    setHideSenior(false);
    setEligibleOnly(false);
    setMinScoreOnly(false);
    setKeywords([]);
    setSource("all");
    setCompany("");
  }

  function toggleKeyword(keyword: string) {
    setKeywords((current) =>
      current.some((item) => item.toLowerCase() === keyword.toLowerCase())
        ? current.filter((item) => item.toLowerCase() !== keyword.toLowerCase())
        : [...current, keyword],
    );
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
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-medium">Candidates</h2>
          <p className="text-sm text-muted-foreground">
            Pulled from Hiring Cafe, Greenhouse, Jobicy, Remotive, and Remote OK. Score is rules-only —
            missing evidence stays at zero. Auto-queue sends new matches (≥ score, not senior, eligible)
            into the apply queue.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void onDiscover()} disabled={discovering}>
            {discovering ? "Pulling…" : "Pull new roles"}
          </Button>
          <AddDialog defaultStatus="discovered" onCreate={onCreate} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {KEYWORD_PRESETS.map((keyword) => {
          const active = keywords.some((item) => item.toLowerCase() === keyword.toLowerCase());
          return (
            <button
              key={keyword}
              type="button"
              aria-pressed={active}
              onClick={() => toggleKeyword(keyword)}
              className={`rounded-full px-3 py-1 text-xs ring-1 ring-foreground/15 ${active ? "bg-primary text-primary-foreground" : "bg-card/70"}`}
            >
              {keyword}
            </button>
          );
        })}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Toggle label="Hide senior titles" checked={hideSenior} onChange={setHideSenior} />
        <Toggle label="Hide blocked geos (keep unknown)" checked={eligibleOnly} onChange={setEligibleOnly} />
        <Toggle label={`Score ${minScore}+ only`} checked={minScoreOnly} onChange={setMinScoreOnly} />
        <Toggle label="Auto-queue new matches" checked={autoQueue} onChange={setAutoQueue} />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="grid gap-1 text-xs text-muted-foreground">
          Posted within
          <Input
            type="number"
            min={1}
            max={90}
            value={days}
            aria-label="Posted within days"
            onChange={(event) => setDays(Number(event.target.value))}
            className="w-28"
          />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Minimum score
          <Input
            type="number"
            min={0}
            max={100}
            value={minScore}
            aria-label="Minimum score"
            onChange={(event) => setMinScore(Number(event.target.value))}
            className="w-28"
          />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Source
          <select
            aria-label="Candidate source"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
          >
            <option value="all">All sources</option>
            {sources.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="grid flex-1 gap-1 text-xs text-muted-foreground">
          Company
          <Input
            value={company}
            aria-label="Filter candidates by company"
            onChange={(event) => setCompany(event.target.value)}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => void handleSaveRules()}>
          Save as queue rules
        </Button>
        <Button
          type="button"
          disabled={queueable.length === 0}
          onClick={() => void onBulk(queueable.map((application) => application.id), "queued")}
        >
          Queue {queueable.length} visible
        </Button>
        <p className="text-xs text-muted-foreground">
          {visible.length} shown · {candidates.length} stored candidates
          {candidates.length > visible.length
            ? ` · hidden: ${filterStats.senior} senior, ${filterStats.location} location, ${filterStats.keyword} keywords, ${filterStats.score} score, ${filterStats.window} age`
            : ""}
        </p>
      </div>
      {candidates.length === 0 ? (
        <p className="rounded-xl bg-card/80 px-4 py-8 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">
          No discovered roles yet. Click <span className="text-foreground">Pull new roles</span> to fetch
          Greenhouse, Jobicy, Remotive, and Remote OK. Hiring Cafe only works from networks that can open
          hiringcafe.com.
        </p>
      ) : visible.length === 0 ? (
        <div className="rounded-xl bg-card/80 px-4 py-8 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">
          <p>
            {candidates.length} roles are stored, but none match the current filters
            ({filterStats.senior} senior, {filterStats.location} blocked location,{" "}
            {filterStats.keyword} keyword misses, {filterStats.score} below score {minScore},{" "}
            {filterStats.window} outside {days} days).
          </p>
          <Button type="button" variant="outline" className="mt-4" onClick={handleRelaxFilters}>
            Show all stored candidates
          </Button>
        </div>
      ) : (
        <ul className="grid gap-3">
          {visible.map((application) => (
            <li key={application.id} className="rounded-xl bg-card/80 p-4 ring-1 ring-foreground/10">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className={`font-mono text-lg tabular-nums ${scoreClass(application.score)}`}>
                      {application.score ?? "—"}
                    </span>
                    <h3 className="font-medium">{application.title}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {application.company} · {application.source}
                    {application.location ? ` · ${application.location}` : ""}
                    {application.postedAt ? ` · ${formatAge(application.postedAt)}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
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
                    className="inline-flex h-7 items-center rounded-lg px-2.5 text-sm text-primary"
                  >
                    Open
                  </a>
                </div>
              </div>
              {application.scoreBreakdown ? (
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {application.scoreBreakdown.reasons.slice(0, 4).join(" ")}
                </p>
              ) : null}
              {application.excerpt ? (
                <p className="mt-2 line-clamp-3 text-sm text-foreground/80">{application.excerpt}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Listings from Jobicy, Remotive, and Remote OK. Apply links stay on the original board or ATS.
      </p>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg bg-card/70 px-3 py-2 text-sm ring-1 ring-foreground/10">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function scoreClass(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 60) return "text-emerald-300";
  if (score >= 40) return "text-amber-200";
  return "text-muted-foreground";
}
