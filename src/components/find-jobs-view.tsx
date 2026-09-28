"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAge } from "@/lib/dates";
import { matchesKeywords, roleIsSenior, withinPostedWindow } from "@/lib/filters";
import type { SourceStatus } from "@/lib/sources";
import type { Application, QueueRules } from "@/lib/types";

export function FindJobsView({
  applications,
  rules,
  sourceStatuses,
  onPatch,
  onBulk,
  onDiscover,
  discovering,
}: {
  applications: Application[];
  rules: QueueRules;
  sourceStatuses: SourceStatus[];
  onPatch: (id: string, patch: Record<string, unknown>) => Promise<void>;
  onBulk: (ids: string[], status: "queued" | "dismissed" | "discovered") => Promise<void>;
  onDiscover: () => Promise<void>;
  discovering: boolean;
}) {
  const [query, setQuery] = useState("");

  // Only roles still waiting for a decision. Queued ones live on Queue only.
  const roles = applications
    .filter((application) => application.status === "discovered")
    .filter((application) => {
      if (rules.excludeSenior && roleIsSenior(application)) return false;
      if (rules.eligibleOnly && application.scoreBreakdown?.eligible === "ineligible") return false;
      if (!matchesKeywords(application, rules.keywords)) return false;
      if (!withinPostedWindow(application, rules.postedWithinDays)) return false;
      return true;
    })
    .filter((application) => {
      if (!query.trim()) return true;
      const haystack = `${application.company} ${application.title} ${application.location ?? ""}`.toLowerCase();
      return haystack.includes(query.trim().toLowerCase());
    })
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">Find jobs</h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            Tuned to your CV (Lead SE, 5+ years, Ireland): Python/TS/React/Node, AWS/K8s, applied AI.
            Staff/Principal/Director+ and blocked geos are dropped. Score {rules.minScore}+ auto-queues.
          </p>
        </div>
        <Button type="button" onClick={() => void onDiscover()} disabled={discovering} className="shrink-0">
          {discovering ? "Searching…" : "Search boards"}
        </Button>
      </div>

      <SourceStrip sources={sourceStatuses} discovering={discovering} />

      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search company or title"
        aria-label="Search jobs"
        className="max-w-md"
      />

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-foreground/10 pb-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{roles.length}</span> to review
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={roles.length === 0}
          onClick={() => void onBulk(roles.map((application) => application.id), "queued")}
        >
          Queue all ({roles.length})
        </Button>
      </div>

      {roles.length === 0 ? (
        <div className="grid place-items-center gap-3 py-14 text-center">
          <div>
            <p className="font-medium">{query.trim() ? "Nothing matches that search" : "No applicable jobs yet"}</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {query.trim()
                ? "Clear the search box to see every applicable role."
                : "Search the boards — we auto-drop Staff/Principal+, blocked locations, and off-stack roles."}
            </p>
          </div>
          {query.trim() ? (
            <Button type="button" variant="outline" onClick={() => setQuery("")}>
              Clear search
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => void onDiscover()} disabled={discovering}>
              {discovering ? "Searching…" : "Search boards"}
            </Button>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-foreground/10">
          {roles.map((application) => (
            <li key={application.id} className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <span className={`font-mono text-sm tabular-nums ${scoreClass(application.score)}`}>
                    {application.score ?? "—"}
                  </span>
                  <h3 className="text-base font-medium leading-snug">{application.title}</h3>
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
                  onClick={() => void onPatch(application.id, { status: "queued" })}
                >
                  Queue
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

function SourceStrip({ sources, discovering }: { sources: SourceStatus[]; discovering: boolean }) {
  return (
    <div className="overflow-x-auto">
      <ul
        aria-label="Job sources"
        className="flex min-w-max items-stretch gap-0 divide-x divide-foreground/10 border-y border-foreground/10"
      >
        {sources.map((source) => {
          const tone = healthTone(source.health);
          const detail = sourceDetail(source, discovering);
          return (
            <li
              key={source.id}
              title={source.error ?? detail}
              className="flex min-w-[8.5rem] items-center gap-2.5 px-4 py-3 first:pl-0 last:pr-0"
            >
              <span
                aria-hidden
                className={`h-2 w-2 shrink-0 rounded-full ${tone.dot} ${source.health === "searching" ? "animate-pulse" : ""}`}
              />
              <div className="min-w-0">
                <p className={`text-sm font-medium leading-none ${tone.label}`}>{source.label}</p>
                <p className="mt-1 text-[11px] leading-none text-muted-foreground">{detail}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function healthTone(health: SourceStatus["health"]): { dot: string; label: string } {
  switch (health) {
    case "ok":
      return { dot: "bg-emerald-400", label: "text-foreground" };
    case "empty":
      return { dot: "bg-amber-300", label: "text-foreground" };
    case "down":
      return { dot: "bg-rose-400", label: "text-rose-100/90" };
    case "searching":
      return { dot: "bg-primary", label: "text-foreground" };
    default:
      return { dot: "bg-foreground/25", label: "text-muted-foreground" };
  }
}

function sourceDetail(source: SourceStatus, discovering: boolean): string {
  if (discovering || source.health === "searching") return "Searching…";
  if (source.health === "idle") return "Not searched yet";
  if (source.health === "down") return "Unavailable";
  if (source.health === "empty") return "0 jobs";
  return `${source.fetched} jobs`;
}

function scoreClass(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 60) return "text-emerald-700 dark:text-emerald-300";
  if (score >= 40) return "text-amber-700 dark:text-amber-200";
  return "text-muted-foreground";
}
