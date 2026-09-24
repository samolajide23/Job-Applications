"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { CandidateView } from "@/components/candidate-view";
import type { NewRowInput } from "@/components/entry-dialogs";
import { QueueView } from "@/components/queue-view";
import { TrackerView } from "@/components/tracker-view";
import { Button } from "@/components/ui/button";
import { zonedLocalToIso } from "@/lib/dates";
import { computeStats } from "@/lib/stats";
import type { Application, QueueRules } from "@/lib/types";

type Tab = "tracker" | "candidates" | "queue";

type Payload = {
  applications: Application[];
  rules: QueueRules;
};

export function Dashboard({ initialApplications, initialRules }: { initialApplications: Application[]; initialRules: QueueRules }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("tracker");
  const [applications, setApplications] = useState(initialApplications);
  const [rules, setRules] = useState(initialRules);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [discovering, setDiscovering] = useState(false);

  const load = useCallback(async () => {
    setError("");
    const response = await fetch("/api/applications", { cache: "no-store" });
    if (response.status === 401) {
      router.push("/login");
      return;
    }
    const body = (await response.json()) as Payload & { error?: string };
    if (!response.ok) throw new Error(body.error ?? "Could not load applications.");
    setApplications(body.applications);
    setRules(body.rules);
  }, [router]);

  async function handlePatch(id: string, patch: Record<string, unknown>) {
    const previous = applications;
    setApplications((current) =>
      current.map((application) =>
        application.id === id ? { ...application, ...patch, status: (patch.status as Application["status"]) ?? application.status } : application,
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
    setApplications((current) => current.map((application) => (application.id === id ? saved : application)));
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
        origin: input.status === "applied" ? "manual" : "manual",
      }),
    });
    const body = (await response.json()) as { application?: Application; error?: string };
    const saved = body.application;
    if (!response.ok || !saved) throw new Error(body.error ?? "Could not save that role.");
    setApplications((current) => {
      const rest = current.filter((application) => application.id !== saved.id && application.url !== saved.url);
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
    const problem = body.errors?.[0] ? ` First issue on row ${body.errors[0].row}: ${body.errors[0].message}` : "";
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
    try {
      const response = await fetch("/api/discover", { method: "POST" });
      const body = (await response.json()) as {
        error?: string;
        added?: number;
        alreadyTracked?: number;
        autoQueued?: number;
        promoted?: number;
        ineligible?: number;
        sources?: { source: string; fetched: number; error: string | null }[];
      };
      if (!response.ok) throw new Error(body.error ?? "Discovery failed.");
      await load();
      const problems = (body.sources ?? [])
        .filter((source) => source.error)
        .map((source) => `${source.source}: ${source.error}`)
        .join(" ");
      setNotice(
        `Added ${body.added ?? 0} roles (${body.autoQueued ?? 0} auto-queued, ${body.alreadyTracked ?? 0} already tracked, ${body.ineligible ?? 0} ineligible skipped). ${problems}`.trim(),
      );
      setTab("candidates");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Discovery failed.");
    } finally {
      setDiscovering(false);
    }
  }

  async function handleSaveRules(next: QueueRules) {
    const response = await fetch("/api/rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    const body = (await response.json()) as { rules?: QueueRules; error?: string };
    if (!response.ok || !body.rules) {
      setError(body.error ?? "Could not save rules.");
      return;
    }
    setRules(body.rules);
    try {
      await load();
    } catch {
      /* list refresh is best-effort after a successful save */
    }
    setNotice(
      next.autoQueue
        ? "Auto-queue is on. Matching discovered roles were moved to the apply queue."
        : "Queue rules saved.",
    );
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const queued = applications.filter((application) => application.status === "queued").length;
  const stats = computeStats(applications);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 px-4 py-5 sm:px-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs tracking-[0.16em] text-primary uppercase">Samuel Olajide</p>
          <h1 className="text-2xl font-semibold tracking-tight">Job applications</h1>
          <p className="text-sm text-muted-foreground">Dundalk, Ireland · Europe/London · discover, queue, then apply</p>
        </div>
        <Button type="button" variant="ghost" onClick={() => void handleLogout()}>
          Log out
        </Button>
      </header>
      <div role="tablist" aria-label="Dashboard sections" className="flex w-fit gap-1 rounded-xl bg-muted/70 p-1">
        <TabButton id="tracker" current={tab} onSelect={setTab} label="Tracker" />
        <TabButton id="candidates" current={tab} onSelect={setTab} label="Candidates" />
        <TabButton id="queue" current={tab} onSelect={setTab} label="Queue" count={queued} />
      </div>
      {error ? (
        <p className="rounded-lg bg-destructive/15 px-3 py-2 text-sm text-red-100" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      {tab === "tracker" ? (
        <TrackerView
          applications={applications}
          stats={stats}
          onPatch={handlePatch}
          onCreate={handleCreate}
          onImport={handleImport}
        />
      ) : tab === "candidates" ? (
        <CandidateView
          applications={applications}
          rules={rules}
          onPatch={handlePatch}
          onBulk={handleBulk}
          onCreate={handleCreate}
          onDiscover={handleDiscover}
          onSaveRules={handleSaveRules}
          discovering={discovering}
        />
      ) : (
        <QueueView applications={applications} onPatch={handlePatch} />
      )}
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
