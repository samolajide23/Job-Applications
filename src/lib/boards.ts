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
};

const USER_AGENT = "SamuelOlajideJobDashboard/1.0 (Ireland; job discovery for personal apply queue)";

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<unknown>;
}

function jobsFrom(value: unknown, key: string): unknown[] {
  if (Array.isArray(value)) return value;
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
          queries: ["AI engineer", "LLM", "Python engineer", "full stack", "backend engineer"],
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
      source: "Jobicy",
      run: async () => {
        const queries = [
          "https://jobicy.com/api/v2/remote-jobs?count=50&geo=europe&industry=engineering",
          "https://jobicy.com/api/v2/remote-jobs?count=20&geo=ireland&industry=engineering",
        ];
        const pages = await Promise.all(queries.map((url) => fetchJson(url)));
        return pages.flatMap((page) => jobsFrom(page, "jobs").map(mapJobicyJob).filter((job) => job !== null));
      },
    },
    {
      source: "Remotive",
      run: async () => {
        const payload = await fetchJson("https://remotive.com/api/remote-jobs?category=software-dev");
        return jobsFrom(payload, "jobs").map(mapRemotiveJob).filter((job) => job !== null);
      },
    },
    {
      source: "RemoteOK",
      run: async () => {
        const payload = await fetchJson("https://remoteok.com/api");
        return (Array.isArray(payload) ? payload : [])
          .map(mapRemoteOkJob)
          .filter((job) => job !== null);
      },
    },
  ];

  return Promise.all(
    tasks.map(async (task) => {
      try {
        const jobs = await task.run();
        return { source: task.source, fetched: jobs.length, jobs, error: null };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Request failed";
        return { source: task.source, fetched: 0, jobs: [], error: message };
      }
    }),
  );
}
