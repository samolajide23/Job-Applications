"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import type { NewRowInput } from "@/components/entry-dialogs";
import { Skeleton } from "@/components/ui/skeleton";
import { zonedLocalToIso } from "@/lib/dates";
import {
  idleSourceStatuses,
  searchingSourceStatuses,
  statusesFromDiscover,
  type SourceStatus,
} from "@/lib/sources";
import { computeStats } from "@/lib/stats";
import type { Application, QueueRules } from "@/lib/types";

const TrackerView = dynamic(
  () => import("@/components/tracker-view").then((module) => module.TrackerView),
  { loading: () => <PanelSkeleton /> },
);
const FindJobsView = dynamic(
  () => import("@/components/find-jobs-view").then((module) => module.FindJobsView),
  { loading: () => <PanelSkeleton /> },
);
const QueueView = dynamic(
  () => import("@/components/queue-view").then((module) => module.QueueView),
  { loading: () => <PanelSkeleton /> },
);

type Tab = "tracker" | "find" | "queue";

type Payload = {
  applications: Application[];
  rules: QueueRules;
};

export function Dashboard({ initialRules }: { initialRules: QueueRules }) {
  const [tab, setTab] = useState<Tab>("tracker");
  const [applications, setApplications] = useState<Application[] | null>(null);
  const [rules, setRules] = useState(initialRules);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [sourceStatuses, setSourceStatuses] = useState<SourceStatus[]>(() => idleSourceStatuses());

  const load = useCallback(async () => {
    setError("");
    const response = await fetch("/api/applications", { cache: "no-store" });
    const body = (await response.json()) as Payload & { error?: string };
    if (!response.ok) throw new Error(body.error ?? "Could not load applications.");
    setApplications(body.applications);
    setRules(body.rules);
  }, []);

  useEffect(() => {
    void load().catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : "Could not load applications.");
      setApplications([]);
    });
  }, [load]);

  async function handlePatch(id: string, patch: Record<string, unknown>) {
    if (!applications) return;
    const previous = applications;
    setApplications((current) =>
      (current ?? []).map((application) =>
        application.id === id
          ? {
              ...application,
              ...patch,
              status: (patch.status as Application["status"]) ?? application.status,
            }
          : application,
      ),
    );
    const response = await fetch(`/api/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const body = (await response.json()) as { application?: Application; error?: string };
    const saved = body.application;
    if (!response.ok || !saved) {
      setApplications(previous);
      setError(body.error ?? "Could not save that change.");
      return;
    }
    setApplications((current) =>
      (current ?? []).map((application) => (application.id === id ? saved : application)),
    );
    setError("");
  }

  async function handleCreate(input: NewRowInput) {
    const timestamp = zonedLocalToIso(input.timestamp);
    if (!timestamp) throw new Error("Enter a valid date and time.");
    const score = input.score.trim() === "" ? undefined : Number(input.score);
    if (score !== undefined && (!Number.isInteger(score) || score < 0 || score > 100)) {
      throw new Error("Score must be a whole number from 0 to 100.");
    }
    const response = await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company: input.company,
        title: input.title,
        url: input.url,
        source: input.source,
        status: input.status,
        timestamp,
        location: input.location || null,
        notes: input.notes || null,
        score,
        origin: "manual",
      }),
    });
    const body = (await response.json()) as { application?: Application; error?: string };
    const saved = body.application;
    if (!response.ok || !saved) throw new Error(body.error ?? "Could not save that role.");
    setApplications((current) => {
      const list = current ?? [];
      const rest = list.filter(
        (application) => application.id !== saved.id && application.url !== saved.url,
      );
      return [saved, ...rest];
    });
    setNotice(`Saved ${input.company}.`);
  }

  async function handleImport(csv: string) {
    const response = await fetch("/api/applications/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv }),
    });
    const body = (await response.json()) as {
      error?: string;
      imported?: number;
      created?: number;
      updated?: number;
      errors?: { row: number; message: string }[];
    };
    if (!response.ok) throw new Error(body.error ?? "Import failed.");
    await load();
    const problem = body.errors?.[0]
      ? ` First issue on row ${body.errors[0].row}: ${body.errors[0].message}`
      : "";
    return `Imported ${body.imported ?? 0} (${body.created ?? 0} new, ${body.updated ?? 0} updated).${problem}`;
  }

  async function handleBulk(ids: string[], status: "queued" | "dismissed" | "discovered") {
    const response = await fetch("/api/applications/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, status }),
    });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(body.error ?? "Could not update those roles.");
      return;
    }
    try {
      await load();
      setNotice(`Updated ${ids.length} roles.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not refresh the list.");
    }
  }

  async function handleDiscover() {
    setDiscovering(true);
    setError("");
    setSourceStatuses((current) => searchingSourceStatuses(current));
    try {
      const response = await fetch("/api/discover", { method: "POST" });
      const body = (await response.json()) as {
        error?: string;
        pulled?: number;
        applicable?: number;
        added?: number;
        alreadyTracked?: number;
        autoQueued?: number;
        promoted?: number;
        senior?: number;
        noKeyword?: number;
        ineligible?: number;
        notSoftware?: number;
        tooOld?: number;
        sources?: { source: string; fetched: number; error: string | null; ms?: number }[];
      };
      if (!response.ok) throw new Error(body.error ?? "Discovery failed.");
      setSourceStatuses(statusesFromDiscover(body.sources ?? []));
      await load();
      const dropped =
        (body.senior ?? 0) +
        (body.noKeyword ?? 0) +
        (body.ineligible ?? 0) +
        (body.notSoftware ?? 0) +
        (body.tooOld ?? 0);
      setNotice(
        `Pulled ${body.pulled ?? 0} → kept ${body.applicable ?? 0} applicable (${body.autoQueued ?? 0} auto-queued, ${body.added ?? 0} new). Auto-dropped ${dropped}.`,
      );
      setTab("find");
    } catch (caught) {
      setSourceStatuses(idleSourceStatuses());
      setError(caught instanceof Error ? caught.message : "Discovery failed.");
    } finally {
      setDiscovering(false);
    }
  }

  const queued = (applications ?? []).filter((application) => application.status === "queued").length;
  const stats = applications ? computeStats(applications) : null;
  const loading = applications === null;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 px-4 py-5 sm:px-6">
      <header>
        <p className="text-xs tracking-[0.16em] text-primary uppercase">Samuel Olajide</p>
        <h1 className="text-2xl font-semibold tracking-tight">Job applications</h1>
        <p className="text-sm text-muted-foreground">
          Dundalk, Ireland · Europe/London · find jobs, queue, then apply
        </p>
      </header>
      <div role="tablist" aria-label="Dashboard sections" className="flex w-fit gap-1 rounded-xl bg-muted/70 p-1">
        <TabButton id="tracker" current={tab} onSelect={setTab} label="Tracker" />
        <TabButton id="find" current={tab} onSelect={setTab} label="Find jobs" />
        <TabButton id="queue" current={tab} onSelect={setTab} label="Queue" count={loading ? undefined : queued} />
      </div>
      {error ? (
        <p className="rounded-lg bg-destructive/15 px-3 py-2 text-sm text-red-100" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      {loading || !stats ? (
        <PanelSkeleton />
      ) : tab === "tracker" ? (
        <TrackerView
          applications={applications}
          stats={stats}
          onPatch={handlePatch}
          onCreate={handleCreate}
          onImport={handleImport}
        />
      ) : tab === "find" ? (
        <FindJobsView
          applications={applications}
          rules={rules}
          sourceStatuses={sourceStatuses}
          onPatch={handlePatch}
          onBulk={handleBulk}
          onDiscover={handleDiscover}
          discovering={discovering}
        />
      ) : (
        <QueueView applications={applications} onPatch={handlePatch} />
      )}
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading applications">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-10 w-full max-w-md rounded-lg" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

function TabButton({
  id,
  current,
  label,
  count,
  onSelect,
}: {
  id: Tab;
  current: Tab;
  label: string;
  count?: number;
  onSelect: (tab: Tab) => void;
}) {
  const selected = current === id;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={() => onSelect(id)}
      className={`rounded-lg px-3 py-1.5 text-sm ${selected ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
    >
      {label}
      {typeof count === "number" ? (
        <span className="ml-1.5 font-mono text-xs tabular-nums">{count}</span>
      ) : null}
    </button>
  );
}
