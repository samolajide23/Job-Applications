import { ASHBY_BOARD_TOKENS } from "@/lib/ats-boards";
import type { DiscoveredJob } from "@/lib/discover";
import { isSoftwareRole } from "@/lib/discover";
import { looksObviouslyUsOnly } from "@/lib/greenhouse";

export { ASHBY_BOARD_TOKENS };

const USER_AGENT = "SamuelOlajideJobDashboard/1.0 (Ireland; job discovery for personal apply queue)";
const LIST_CONCURRENCY = 10;

type AshbySecondary = {
  location?: string;
  address?: { postalAddress?: { addressCountry?: string; addressLocality?: string; addressRegion?: string } };
};

type AshbyJob = {
  id?: string;
  title?: string;
  department?: string;
  team?: string;
  location?: string;
  secondaryLocations?: AshbySecondary[] | null;
  publishedAt?: string;
  isListed?: boolean;
  isRemote?: boolean | null;
  workplaceType?: string | null;
  jobUrl?: string;
  applyUrl?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
  compensation?: { summary?: string; compensationTiers?: unknown } | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function postedIso(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function companyFromToken(token: string): string {
  const special: Record<string, string> = {
    "1password": "1Password",
    n8n: "n8n",
    "blp-digital": "BLP Digital",
    mazedesign: "Maze",
  };
  if (special[token]) return special[token];
  return token.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

async function fetchJson(url: string, timeoutMs = 20_000): Promise<unknown> {
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

async function mapPool<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current]);
    }
  });
  await Promise.all(runners);
  return results;
}

function locationText(job: AshbyJob): string {
  const parts = [
    asString(job.location),
    asString(job.workplaceType),
    job.isRemote ? "Remote" : "",
    ...(job.secondaryLocations ?? []).flatMap((entry) => {
      const postal = entry.address?.postalAddress;
      return [
        asString(entry.location),
        asString(postal?.addressLocality),
        asString(postal?.addressRegion),
        asString(postal?.addressCountry),
      ];
    }),
  ].filter(Boolean);
  return [...new Set(parts)].join(" · ");
}

function salaryText(job: AshbyJob): string | null {
  const summary = asString(job.compensation?.summary);
  return summary || null;
}

export function mapAshbyJob(value: unknown, boardToken: string): DiscoveredJob | null {
  const record = asRecord(value);
  if (!record) return null;
  const job = record as unknown as AshbyJob;
  if (job.isListed === false) return null;
  const title = asString(job.title);
  const url = asString(job.jobUrl) || asString(job.applyUrl);
  if (!title || !url) return null;
  const description = asString(job.descriptionPlain) || asString(job.descriptionHtml);
  const location = locationText(job) || null;
  const department = asString(job.department);
  const team = asString(job.team);
  return {
    url,
    company: companyFromToken(boardToken),
    title,
    source: "Ashby",
    location,
    description,
    tags: [department, team, "Ashby", boardToken].filter(Boolean),
    postedAt: postedIso(job.publishedAt),
    salaryText: salaryText(job),
    level: null,
  };
}

async function listBoardJobs(token: string): Promise<{ token: string; jobs: AshbyJob[]; error: string | null }> {
  try {
    const payload = await fetchJson(
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}?includeCompensation=true`,
    );
    const record = asRecord(payload);
    const jobs = Array.isArray(record?.jobs) ? (record.jobs as AshbyJob[]) : [];
    return { token, jobs, error: null };
  } catch (error) {
    return {
      token,
      jobs: [],
      error: error instanceof Error ? error.message : "Request failed",
    };
  }
}

export type AshbyPullResult = {
  jobs: DiscoveredJob[];
  boards: number;
  listed: number;
  errors: string[];
};

export async function pullAshby(): Promise<AshbyPullResult> {
  const listed = await mapPool([...ASHBY_BOARD_TOKENS], LIST_CONCURRENCY, listBoardJobs);
  const errors = listed.filter((board) => board.error).map((board) => `${board.token}: ${board.error}`);

  const jobs: DiscoveredJob[] = [];
  const seen = new Set<string>();
  for (const board of listed) {
    for (const job of board.jobs) {
      const title = asString(job.title);
      if (!title || !isSoftwareRole(title)) continue;
      const location = locationText(job);
      const description = asString(job.descriptionPlain) || asString(job.descriptionHtml);
      if (looksObviouslyUsOnly(location, description)) continue;
      const mapped = mapAshbyJob(job, board.token);
      if (!mapped || seen.has(mapped.url)) continue;
      seen.add(mapped.url);
      jobs.push(mapped);
    }
  }

  jobs.sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""));

  return {
    jobs,
    boards: ASHBY_BOARD_TOKENS.length,
    listed: listed.reduce((sum, board) => sum + board.jobs.length, 0),
    errors,
  };
}
