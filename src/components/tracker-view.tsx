"use client";

import { useMemo, useState } from "react";
import { AddDialog, ImportDialog, type NewRowInput } from "@/components/entry-dialogs";
import { KpiGrid } from "@/components/kpi-grid";
import { StatusSelect } from "@/components/status-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatLondonDay } from "@/lib/dates";
import { STATUS_LABELS, isTrackerStatus, type Status } from "@/lib/statuses";
import type { Application, Stats } from "@/lib/types";

const PAGE_SIZE = 60;

type Bucket = "all" | "waiting" | "moving" | "offers" | "closed" | "stuck";

const BUCKETS: { id: Bucket; label: string; statuses: Status[] | null }[] = [
  { id: "all", label: "All", statuses: null },
  { id: "waiting", label: "Waiting", statuses: ["applied", "no_response"] },
  {
    id: "moving",
    label: "Moving",
    statuses: ["assessment", "recruiter_contacted", "interview", "final_interview"],
  },
  { id: "offers", label: "Offers", statuses: ["offer"] },
  { id: "closed", label: "Closed", statuses: ["rejected", "withdrawn"] },
  { id: "stuck", label: "Stuck", statuses: ["blocked", "needs_input", "skipped"] },
];

export function TrackerView({
  applications,
  stats,
  onPatch,
  onCreate,
  onImport,
}: {
  applications: Application[];
  stats: Stats;
  onPatch: (id: string, patch: Record<string, unknown>) => Promise<void>;
  onCreate: (input: NewRowInput) => Promise<void>;
  onImport: (csv: string) => Promise<string>;
}) {
  const tracked = applications.filter((application) => isTrackerStatus(application.status));
  const [query, setQuery] = useState("");
  const [bucket, setBucket] = useState<Bucket>("all");
  const [newestFirst, setNewestFirst] = useState(true);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const bucketCounts = useMemo(() => {
    const counts: Record<Bucket, number> = {
      all: tracked.length,
      waiting: 0,
      moving: 0,
      offers: 0,
      closed: 0,
      stuck: 0,
    };
    for (const application of tracked) {
      for (const item of BUCKETS) {
        if (item.statuses?.includes(application.status)) counts[item.id] += 1;
      }
    }
    return counts;
  }, [tracked]);

  const visible = tracked
    .filter((application) => {
      const selected = BUCKETS.find((item) => item.id === bucket);
      if (selected?.statuses && !selected.statuses.includes(application.status)) return false;
      if (!query.trim()) return true;
      const haystack =
        `${application.company} ${application.title} ${application.source} ${application.notes ?? ""} ${application.location ?? ""}`.toLowerCase();
      return haystack.includes(query.trim().toLowerCase());
    })
    .sort((a, b) => {
      const left = a.appliedAt ?? a.updatedAt;
      const right = b.appliedAt ?? b.updatedAt;
      return newestFirst ? right.localeCompare(left) : left.localeCompare(right);
    });

  const monthTotal = stats.last30Days.reduce((sum, day) => sum + day.count, 0);
  const paged = visible.slice(0, limit);
  const remaining = visible.length - paged.length;

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Tracker</h2>
          <p className="text-sm text-muted-foreground">
            Roles you already applied to — update status when something changes.
          </p>
        </div>
        <div className="flex gap-2">
          <ImportDialog onImport={onImport} />
          <AddDialog defaultStatus="applied" onCreate={onCreate} />
        </div>
      </div>

      <KpiGrid stats={stats} />

      <p className="text-xs text-muted-foreground">
        {monthTotal} applications logged in the last 30 days · {tracked.length} total on this page
      </p>

      <div className="flex flex-col gap-3">
        <div
          role="tablist"
          aria-label="Filter by progress"
          className="flex flex-wrap gap-1.5"
        >
          {BUCKETS.map((item) => {
            const selected = bucket === item.id;
            const count = bucketCounts[item.id];
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => {
                  setBucket(item.id);
                  setLimit(PAGE_SIZE);
                }}
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  selected
                    ? "bg-foreground text-background"
                    : "bg-muted/70 text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
                <span className="ml-1.5 font-mono text-xs tabular-nums opacity-80">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(PAGE_SIZE);
            }}
            placeholder="Search company or role"
            aria-label="Search applications"
            className="sm:max-w-sm"
          />
          <button
            type="button"
            onClick={() => setNewestFirst((value) => !value)}
            className="h-8 w-fit rounded-lg border border-input px-2.5 text-sm dark:bg-input/30"
          >
            {newestFirst ? "Newest first" : "Oldest first"}
          </button>
          <p className="text-xs text-muted-foreground sm:ml-auto">
            Showing {Math.min(limit, visible.length)}
            {visible.length !== tracked.length ? ` of ${visible.length}` : ` of ${tracked.length}`}
          </p>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl px-4 py-10 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">
          {tracked.length === 0
            ? "Nothing here yet. Apply from the Queue, or add a role manually."
            : "No applications in this view. Try another filter or clear search."}
        </p>
      ) : (
        <>
          <ul className="hidden divide-y divide-border/70 rounded-xl ring-1 ring-foreground/10 md:block">
            {paged.map((application) => (
              <li
                key={application.id}
                className="grid grid-cols-[minmax(0,1.6fr)_10rem_7rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{application.company}</p>
                  <p className="truncate text-sm text-muted-foreground">{application.title}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {application.source}
                    {application.location ? ` · ${application.location}` : ""}
                  </p>
                </div>
                <StatusSelect
                  value={application.status}
                  trackerOnly
                  label={`Status for ${application.company} ${application.title}`}
                  onChange={(next) => void onPatch(application.id, { status: next })}
                />
                <p className="font-mono text-xs text-muted-foreground">
                  {application.appliedAt ? formatLondonDay(application.appliedAt) : "—"}
                </p>
                <InlineValue
                  key={`${application.id}-notes-${application.notes ?? ""}`}
                  label={`Notes for ${application.company}`}
                  value={application.notes ?? ""}
                  placeholder="Add a note"
                  onSave={(value) => onPatch(application.id, { notes: value || null })}
                />
                <a
                  href={application.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-primary underline-offset-4 hover:underline"
                >
                  Open
                </a>
              </li>
            ))}
          </ul>

          <ul className="grid gap-3 md:hidden">
            {paged.map((application) => (
              <li key={application.id} className="rounded-xl p-3 ring-1 ring-foreground/10">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{application.company}</p>
                    <p className="text-sm text-muted-foreground">{application.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {STATUS_LABELS[application.status]}
                      {" · "}
                      {application.appliedAt ? formatLondonDay(application.appliedAt) : "No date"}
                      {" · "}
                      {application.source}
                    </p>
                  </div>
                  <a
                    href={application.url}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-sm text-primary"
                  >
                    Open
                  </a>
                </div>
                <div className="mt-3">
                  <StatusSelect
                    value={application.status}
                    trackerOnly
                    label={`Status for ${application.company} ${application.title}`}
                    onChange={(next) => void onPatch(application.id, { status: next })}
                  />
                </div>
                <div className="mt-2">
                  <InlineValue
                    key={`${application.id}-notes-mobile-${application.notes ?? ""}`}
                    label={`Notes for ${application.company}`}
                    value={application.notes ?? ""}
                    placeholder="Add a note"
                    onSave={(value) => onPatch(application.id, { notes: value || null })}
                  />
                </div>
              </li>
            ))}
          </ul>
          {remaining > 0 ? (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLimit((current) => current + PAGE_SIZE)}
              >
                Show more ({remaining} left)
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function InlineValue({
  label,
  value,
  placeholder,
  onSave,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onSave: (value: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      aria-label={label}
      value={draft}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== value) void onSave(draft);
      }}
      className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
    />
  );
}
