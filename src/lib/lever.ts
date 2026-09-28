import { LEVER_BOARD_TOKENS } from "@/lib/ats-boards";
import type { DiscoveredJob } from "@/lib/discover";
import { isSoftwareRole } from "@/lib/discover";
import { looksObviouslyUsOnly } from "@/lib/greenhouse";

export { LEVER_BOARD_TOKENS };

const USER_AGENT = "SamuelOlajideJobDashboard/1.0 (Ireland; job discovery for personal apply queue)";
const LIST_CONCURRENCY = 8;

type LeverCategories = {
  commitment?: string;
  department?: string;
  location?: string;
  team?: string;
  allLocations?: string[] | null;
};

type LeverJob = {
  id?: string;
  text?: string;
  categories?: LeverCategories | null;
  country?: string;
  workplaceType?: string | null;
  createdAt?: number | string;
  descriptionPlain?: string;
  description?: string;
  descriptionBodyPlain?: string;
  additionalPlain?: string;
  hostedUrl?: string;
  applyUrl?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function postedIso(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const raw = asString(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function companyFromToken(token: string): string {
  const special: Record<string, string> = {
    metabase: "Metabase",
    spotify: "Spotify",
    qonto: "Qonto",
    palantir: "Palantir",
    activecampaign: "ActiveCampaign",
    wealthfront: "Wealthfront",
    theathletic: "The Athletic",
    gopuff: "Gopuff",
  };
  return special[token] ?? token.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
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

function locationText(job: LeverJob): string {
  const categories = job.categories ?? {};
  const parts = [
    asString(categories.location),
    ...(categories.allLocations ?? []).map((item) => asString(item)),
    asString(job.workplaceType),
    asString(job.country),
    asString(categories.commitment),
  ].filter(Boolean);
  return [...new Set(parts)].join(" · ");
}

function descriptionText(job: LeverJob): string {
  return [
    asString(job.descriptionPlain),
    asString(job.descriptionBodyPlain),
    asString(job.additionalPlain),
    asString(job.description),
  ]
    .filter(Boolean)
    .join("\n");
}

export function mapLeverJob(value: unknown, boardToken: string): DiscoveredJob | null {
  const record = asRecord(value);
  if (!record) return null;
  const job = record as unknown as LeverJob;
  const title = asString(job.text);
  const url = asString(job.hostedUrl) || asString(job.applyUrl);
  if (!title || !url) return null;
  const categories = job.categories ?? {};
  return {
    url,
    company: companyFromToken(boardToken),
    title,
    source: "Lever",
    location: locationText(job) || null,
    description: descriptionText(job),
    tags: [asString(categories.department), asString(categories.team), "Lever", boardToken].filter(Boolean),
    postedAt: postedIso(job.createdAt),
    salaryText: null,
    level: asString(categories.commitment) || null,
  };
}

async function listBoardJobs(token: string): Promise<{ token: string; jobs: LeverJob[]; error: string | null }> {
  try {
    const payload = await fetchJson(`https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`);
    const jobs = Array.isArray(payload) ? (payload as LeverJob[]) : [];
    return { token, jobs, error: null };
  } catch (error) {
    return {
      token,
      jobs: [],
      error: error instanceof Error ? error.message : "Request failed",
    };
  }
}

export type LeverPullResult = {
  jobs: DiscoveredJob[];
  boards: number;
  listed: number;
  errors: string[];
};

export async function pullLever(): Promise<LeverPullResult> {
  const listed = await mapPool([...LEVER_BOARD_TOKENS], LIST_CONCURRENCY, listBoardJobs);
  const errors = listed.filter((board) => board.error).map((board) => `${board.token}: ${board.error}`);

  const jobs: DiscoveredJob[] = [];
  const seen = new Set<string>();
  for (const board of listed) {
    for (const job of board.jobs) {
      const title = asString(job.text);
      if (!title || !isSoftwareRole(title)) continue;
      const location = locationText(job);
      const description = descriptionText(job);
      if (looksObviouslyUsOnly(location, description)) continue;
      const mapped = mapLeverJob(job, board.token);
      if (!mapped || seen.has(mapped.url)) continue;
      seen.add(mapped.url);
      jobs.push(mapped);
    }
  }

  jobs.sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""));

  return {
    jobs,
    boards: LEVER_BOARD_TOKENS.length,
    listed: listed.reduce((sum, board) => sum + board.jobs.length, 0),
    errors,
  };
}
