export type JobSourceId =
  | "HiringCafe"
  | "Greenhouse"
  | "Ashby"
  | "Lever"
  | "LinkedIn"
  | "Jobicy"
  | "Remotive"
  | "RemoteOK";

export type SourceHealth = "idle" | "searching" | "ok" | "empty" | "down";

export type SourceStatus = {
  id: JobSourceId;
  label: string;
  fetched: number;
  error: string | null;
  ms: number | null;
  health: SourceHealth;
};

export const JOB_SOURCES: { id: JobSourceId; label: string }[] = [
  { id: "HiringCafe", label: "Hiring Cafe" },
  { id: "Greenhouse", label: "Greenhouse" },
  { id: "Ashby", label: "Ashby" },
  { id: "Lever", label: "Lever" },
  { id: "LinkedIn", label: "LinkedIn" },
  { id: "Jobicy", label: "Jobicy" },
  { id: "Remotive", label: "Remotive" },
  { id: "RemoteOK", label: "Remote OK" },
];

export function idleSourceStatuses(): SourceStatus[] {
  return JOB_SOURCES.map((source) => ({
    ...source,
    fetched: 0,
    error: null,
    ms: null,
    health: "idle",
  }));
}

export function searchingSourceStatuses(previous: SourceStatus[] = idleSourceStatuses()): SourceStatus[] {
  return JOB_SOURCES.map((source) => {
    const prior = previous.find((item) => item.id === source.id);
    return {
      ...source,
      fetched: prior?.fetched ?? 0,
      error: prior?.error ?? null,
      ms: prior?.ms ?? null,
      health: "searching" as const,
    };
  });
}

export function statusesFromDiscover(
  sources: { source: string; fetched: number; error: string | null; ms?: number }[],
): SourceStatus[] {
  return JOB_SOURCES.map((source) => {
    const row = sources.find((item) => item.source === source.id);
    if (!row) {
      return { ...source, fetched: 0, error: null, ms: null, health: "idle" as const };
    }
    const health: SourceHealth = row.error ? "down" : row.fetched > 0 ? "ok" : "empty";
    return {
      ...source,
      fetched: row.fetched,
      error: row.error,
      ms: typeof row.ms === "number" ? row.ms : null,
      health,
    };
  });
}
