import { pullAshby } from "@/lib/ashby";
import {
  mapJobicyJob,
  mapRemoteOkJob,
  mapRemotiveJob,
  type DiscoveredJob,
} from "@/lib/discover";
import { pullGreenhouse } from "@/lib/greenhouse";
import { pullHiringCafe } from "@/lib/hiring-cafe";

export type BoardResult = {
  source: string;
  fetched: number;
  jobs: DiscoveredJob[];
  error: string | null;
  ms: number;
};

const USER_AGENT = "SamuelOlajideJobDashboard/1.0 (Ireland; job discovery for personal apply queue)";

/** Remotive's free feed is small; keep software-adjacent categories only. */
const REMOTIVE_KEEP =
  /\b(software|development|data|devops|artificial intelligence|qa|product)\b/i;

async function fetchJson(url: string, timeoutMs = 12_000): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<unknown>;
}

function jobsFrom(value: unknown, key: string): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value !== "object") return [];
  if (value && typeof value === "object" && key in value) {
    const nested = (value as Record<string, unknown>)[key];
    return Array.isArray(nested) ? nested : [];
  }
  return [];
}

export async function pullBoards(options?: { postedWithinDays?: number }): Promise<BoardResult[]> {
  const days = options?.postedWithinDays && options.postedWithinDays > 0 ? options.postedWithinDays : 14;
  const tasks: { source: string; run: () => Promise<DiscoveredJob[]> }[] = [
    {
      source: "HiringCafe",
      run: async () =>
        pullHiringCafe({
          days,
          // One strong query after the CF probe; extra queries only run if the probe succeeds.
          queries: ["Python AI engineer full stack"],
        }),
    },
    {
      source: "Greenhouse",
      run: async () => {
        const result = await pullGreenhouse({ postedWithinDays: days });
        if (result.errors.length > 0 && result.jobs.length === 0) {
          throw new Error(result.errors.slice(0, 3).join("; "));
        }
        return result.jobs;
      },
    },
    {
      source: "Ashby",
      run: async () => {
        const result = await pullAshby();
        if (result.errors.length > 0 && result.jobs.length === 0) {
          throw new Error(result.errors.slice(0, 3).join("; "));
        }
        return result.jobs;
      },
    },
    {
      source: "Jobicy",
      run: async () => {
        const queries = [
          "https://jobicy.com/api/v2/remote-jobs?count=50&geo=europe&industry=engineering",
          "https://jobicy.com/api/v2/remote-jobs?count=50&geo=ireland&industry=engineering",
          "https://jobicy.com/api/v2/remote-jobs?count=50&tag=python",
          "https://jobicy.com/api/v2/remote-jobs?count=50&tag=typescript",
          "https://jobicy.com/api/v2/remote-jobs?count=50&tag=react",
        ];
        const pages = await Promise.all(queries.map((url) => fetchJson(url)));
        const byUrl = new Map<string, DiscoveredJob>();
        for (const page of pages) {
          for (const job of jobsFrom(page, "jobs").map(mapJobicyJob)) {
            if (job) byUrl.set(job.url, job);
          }
        }
        return [...byUrl.values()];
      },
    },
    {
      source: "Remotive",
      run: async () => {
        // One feed request — Remotive's public API is already a short recent list.
        const payload = await fetchJson("https://remotive.com/api/remote-jobs");
        const byUrl = new Map<string, DiscoveredJob>();
        for (const raw of jobsFrom(payload, "jobs")) {
          const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
          const category = typeof record?.category === "string" ? record.category : "";
          if (category && !REMOTIVE_KEEP.test(category)) continue;
          const job = mapRemotiveJob(raw);
          if (job) byUrl.set(job.url, job);
        }
        return [...byUrl.values()];
      },
    },
    {
      source: "RemoteOK",
      run: async () => {
        const payload = await fetchJson("https://remoteok.com/api", 15_000);
        return (Array.isArray(payload) ? payload : [])
          .map(mapRemoteOkJob)
          .filter((job) => job !== null);
      },
    },
  ];

  return Promise.all(
    tasks.map(async (task) => {
      const started = Date.now();
      try {
        const jobs = await task.run();
        return { source: task.source, fetched: jobs.length, jobs, error: null, ms: Date.now() - started };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Request failed";
        return { source: task.source, fetched: 0, jobs: [], error: message, ms: Date.now() - started };
      }
    }),
  );
}
