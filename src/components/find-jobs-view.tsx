"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAge } from "@/lib/dates";
import { matchesKeywords, roleIsSenior, withinPostedWindow } from "@/lib/filters";
import type { Application, QueueRules } from "@/lib/types";

export function FindJobsView({
  applications,
  rules,
  onPatch,
  onBulk,
  onDiscover,
  discovering,
}: {
  applications: Application[];
  rules: QueueRules;
  onPatch: (id: string, patch: Record<string, unknown>) => Promise<void>;
  onBulk: (ids: string[], status: "queued" | "dismissed" | "discovered") => Promise<void>;
  onDiscover: () => Promise<void>;
  discovering: boolean;
}) {
  const [query, setQuery] = useState("");

  // Auto filters are fixed (same rules used on pull). No toggles — only a search box.
  const roles = applications
    .filter((application) => ["discovered", "queued"].includes(application.status))
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

  const needsReview = roles.filter((application) => application.status === "discovered");
  const queuedHere = roles.filter((application) => application.status === "queued");

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">Find jobs</h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            Boards return hundreds of listings. We keep junior/mid software roles that match your stack
            and aren&apos;t geo-blocked. Score {rules.minScore}+ goes to Queue automatically — everything
            here is already filtered.
          </p>
        </div>
        <Button type="button" onClick={() => void onDiscover()} disabled={discovering} className="shrink-0">
          {discovering ? "Searching…" : "Search boards"}
        </Button>
      </div>

      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search company or title"
        aria-label="Search jobs"
        className="max-w-md"
      />

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-foreground/10 pb-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{needsReview.length}</span> to review
          {queuedHere.length > 0 ? (
            <>
              {" "}
              · <span className="font-medium text-foreground">{queuedHere.length}</span> already queued
            </>
          ) : null}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={needsReview.length === 0}
          onClick={() => void onBulk(needsReview.map((application) => application.id), "queued")}
        >
          Queue all ({needsReview.length})
        </Button>
      </div>

      {roles.length === 0 ? (
        <div className="grid place-items-center gap-3 py-14 text-center">
          <div>
            <p className="font-medium">{query.trim() ? "Nothing matches that search" : "No applicable jobs yet"}</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {query.trim()
                ? "Clear the search box to see every applicable role."
                : "Search the boards — we auto-drop senior, blocked-location, and off-stack roles."}
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

function scoreClass(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 60) return "text-emerald-700 dark:text-emerald-300";
  if (score >= 40) return "text-amber-700 dark:text-amber-200";
  return "text-muted-foreground";
}
