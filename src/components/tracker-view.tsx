"use client";

import { useMemo, useState } from "react";
import { ActivityChart, SourceBars } from "@/components/activity-chart";
import { AddDialog, ImportDialog, type NewRowInput } from "@/components/entry-dialogs";
import { KpiGrid } from "@/components/kpi-grid";
import { StatusSelect } from "@/components/status-select";
import { Input } from "@/components/ui/input";
import { formatLondonDateTime } from "@/lib/dates";
import { STATUS_LABELS, TRACKER_STATUSES, isTrackerStatus, type Status } from "@/lib/statuses";
import type { Application, Stats } from "@/lib/types";

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
  const [status, setStatus] = useState<Status | "all">("all");
  const [source, setSource] = useState("all");
  const [company, setCompany] = useState("");
  const [newestFirst, setNewestFirst] = useState(true);
  const sources = useMemo(
    () => [...new Set(tracked.map((application) => application.source))].sort(),
    [tracked],
  );
  const visible = tracked
    .filter((application) => {
      const haystack = `${application.company} ${application.title} ${application.source} ${application.notes ?? ""} ${application.url} ${application.location ?? ""}`.toLowerCase();
      if (query && !haystack.includes(query.trim().toLowerCase())) return false;
      if (status !== "all" && application.status !== status) return false;
      if (source !== "all" && application.source !== source) return false;
      if (company && !application.company.toLowerCase().includes(company.trim().toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      const left = a.appliedAt ?? a.updatedAt;
      const right = b.appliedAt ?? b.updatedAt;
      return newestFirst ? right.localeCompare(left) : left.localeCompare(right);
    });

  return (
    <div className="grid gap-4">
      <KpiGrid stats={stats} />
      <div className="grid gap-3 lg:grid-cols-[1.4fr_0.8fr]">
        <ActivityChart days={stats.last30Days} />
        <SourceBars sources={stats.bySource} />
      </div>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search company, title, notes, URL"
          aria-label="Search applications"
          className="lg:max-w-sm"
        />
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(event) => setStatus(event.target.value as Status | "all")}
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
        >
          <option value="all">All statuses</option>
          {TRACKER_STATUSES.map((item) => (
            <option key={item} value={item}>
              {STATUS_LABELS[item]}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by source"
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
        <Input
          value={company}
          onChange={(event) => setCompany(event.target.value)}
          placeholder="Company"
          aria-label="Filter by company"
          className="lg:max-w-40"
        />
        <ButtonSort newestFirst={newestFirst} onToggle={() => setNewestFirst((value) => !value)} />
        <div className="flex gap-2 lg:ml-auto">
          <ImportDialog onImport={onImport} />
          <AddDialog defaultStatus="applied" onCreate={onCreate} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Showing {visible.length} of {tracked.length}. Response rate is rejected, interview, final
        interview, offer, and recruiter replies divided by submitted applications.
      </p>
      {visible.length === 0 ? (
        <p className="rounded-xl bg-card/80 px-4 py-8 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">
          No applications match these filters.
        </p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl ring-1 ring-foreground/10 md:block">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  {["Date", "Company", "Title", "Source", "Status", "Score", "Location", "Link", "Notes"].map(
                    (heading) => (
                      <th key={heading} className="px-3 py-2 font-medium">
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {visible.map((application) => (
                  <tr key={application.id} className="border-t border-border/70 align-top">
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">
                      {application.appliedAt ? formatLondonDateTime(application.appliedAt) : "—"}
                    </td>
                    <td className="px-3 py-2 font-medium">{application.company}</td>
                    <td className="max-w-xs px-3 py-2">{application.title}</td>
                    <td className="px-3 py-2">{application.source}</td>
                    <td className="px-3 py-2">
                      <StatusSelect
                        value={application.status}
                        label={`Status for ${application.company} ${application.title}`}
                        onChange={(next) => void onPatch(application.id, { status: next })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <InlineValue
                        key={`${application.id}-score-${application.score ?? ""}`}
                        label={`Score for ${application.company}`}
                        value={application.score?.toString() ?? ""}
                        width="w-16"
                        onSave={(value) => onPatch(application.id, { score: value === "" ? null : Number(value) })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <InlineValue
                        key={`${application.id}-location-${application.location ?? ""}`}
                        label={`Location for ${application.company}`}
                        value={application.location ?? ""}
                        width="w-32"
                        onSave={(value) => onPatch(application.id, { location: value || null })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <a
                        href={application.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        Open
                      </a>
                    </td>
                    <td className="px-3 py-2">
                      <InlineValue
                        key={`${application.id}-notes-${application.notes ?? ""}`}
                        label={`Notes for ${application.company}`}
                        value={application.notes ?? ""}
                        width="w-48"
                        onSave={(value) => onPatch(application.id, { notes: value || null })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="grid gap-3 md:hidden">
            {visible.map((application) => (
              <li key={application.id} className="rounded-xl bg-card/80 p-3 ring-1 ring-foreground/10">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{application.company}</p>
                    <p className="text-sm text-muted-foreground">{application.title}</p>
                  </div>
                  <a href={application.url} target="_blank" rel="noreferrer" className="text-sm text-primary">
                    Open
                  </a>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {application.appliedAt ? formatLondonDateTime(application.appliedAt) : "No date"} ·{" "}
                  {application.source}
                </p>
                <div className="mt-2">
                  <StatusSelect
                    value={application.status}
                    label={`Status for ${application.company} ${application.title}`}
                    onChange={(next) => void onPatch(application.id, { status: next })}
                  />
                </div>
                <div className="mt-2">
                  <InlineValue
                    key={`${application.id}-notes-mobile-${application.notes ?? ""}`}
                    label={`Notes for ${application.company}`}
                    value={application.notes ?? ""}
                    width="w-full"
                    onSave={(value) => onPatch(application.id, { notes: value || null })}
                  />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function ButtonSort({ newestFirst, onToggle }: { newestFirst: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="h-8 rounded-lg border border-input px-2.5 text-sm dark:bg-input/30"
    >
      Date {newestFirst ? "newest" : "oldest"}
    </button>
  );
}

function InlineValue({
  label,
  value,
  width,
  onSave,
}: {
  label: string;
  value: string;
  width: string;
  onSave: (value: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      aria-label={label}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== value) void onSave(draft);
      }}
      className={`h-8 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30 ${width}`}
    />
  );
}
