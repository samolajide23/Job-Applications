import { GREENHOUSE_BOARD_TOKENS } from "@/lib/ats-boards";
import type { DiscoveredJob } from "@/lib/discover";
import { isSoftwareRole } from "@/lib/discover";

export { GREENHOUSE_BOARD_TOKENS };

const USER_AGENT = "SamuelOlajideJobDashboard/1.0 (Ireland; job discovery for personal apply queue)";
const LIST_CONCURRENCY = 16;
const DETAIL_CONCURRENCY = 14;
/** Cap detail fetches so mega-boards (SpaceX, etc.) stay within discover time budget. */
const MAX_DETAILS = 500;

type GreenhouseJob = {
  id: number;
  title: string;
  company_name?: string;
  absolute_url?: string;
  updated_at?: string;
  first_published?: string;
  content?: string;
  location?: { name?: string } | null;
  departments?: { name?: string }[] | null;
  offices?: { name?: string; location?: string }[] | null;
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

function locationText(job: GreenhouseJob): string {
  const parts = [
    asString(job.location?.name),
    ...(job.offices ?? []).flatMap((office) => [asString(office.name), asString(office.location)]),
  ].filter(Boolean);
  return [...new Set(parts)].join(" · ");
}

/**
 * Drop only clear US-only / Americas-only listings. If the description allows
 * remote Ireland/EU/worldwide, keep it for scoring.
 */
export function looksObviouslyUsOnly(location: string, description = ""): boolean {
  const place = location.toLowerCase();
  const blob = `${place}\n${description.slice(0, 2000).toLowerCase()}`;
  const allowsIrelandOrEu =
    /\b(ireland|dublin|europe|european|eea|emea|\beu\b|united kingdom|\buk\b|london|worldwide|world wide|global|anywhere|remote from anywhere)\b/.test(
      blob,
    );
  if (allowsIrelandOrEu) return false;

  const hasUs = /\b(united states|\bu\.?s\.?a\.?\b|\bus only\b|\bu\.s\. only\b|america)\b/.test(place);
  const americasOnly = /\b(americas only|north america only|latam only|apac only)\b/.test(place);
  if (!hasUs && !americasOnly) return false;
  return true;
}

export function mapGreenhouseJob(value: unknown, boardToken: string): DiscoveredJob | null {
  const record = asRecord(value);
  if (!record) return null;
  const title = asString(record.title);
  const company =
    asString(record.company_name) || boardToken.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const url = asString(record.absolute_url);
  if (!title || !company || !url) return null;
  const location = locationText(record as unknown as GreenhouseJob) || null;
  const departments = Array.isArray(record.departments)
    ? record.departments.map((item) => asString(asRecord(item)?.name)).filter(Boolean)
    : [];
  return {
    url,
    company,
    title,
    source: "Greenhouse",
    location,
    description: asString(record.content),
    tags: [...departments, "Greenhouse", boardToken],
    postedAt: postedIso(record.first_published) ?? postedIso(record.updated_at),
    salaryText: null,
    level: null,
  };
}

async function listBoardJobs(token: string): Promise<{ token: string; jobs: GreenhouseJob[]; error: string | null }> {
  try {
    // Lightweight list first — detail fetch only for software / non-US candidates.
    const payload = await fetchJson(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs`,
    );
    const record = asRecord(payload);
    const jobs = Array.isArray(record?.jobs) ? (record.jobs as GreenhouseJob[]) : [];
    return { token, jobs, error: null };
  } catch (error) {
    return {
      token,
      jobs: [],
      error: error instanceof Error ? error.message : "Request failed",
    };
  }
}

async function fetchJobDetail(token: string, id: number): Promise<GreenhouseJob | null> {
  try {
    const payload = await fetchJson(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs/${id}`,
    );
    return asRecord(payload) as unknown as GreenhouseJob;
  } catch {
    return null;
  }
}

export type GreenhousePullResult = {
  jobs: DiscoveredJob[];
  boards: number;
  listed: number;
  detailed: number;
  errors: string[];
};

export async function pullGreenhouse(_options?: { postedWithinDays?: number }): Promise<GreenhousePullResult> {
  const listed = await mapPool([...GREENHOUSE_BOARD_TOKENS], LIST_CONCURRENCY, listBoardJobs);
  const errors = listed.filter((board) => board.error).map((board) => `${board.token}: ${board.error}`);

  const candidates: { token: string; job: GreenhouseJob }[] = [];
  for (const board of listed) {
    for (const job of board.jobs) {
      const title = asString(job.title);
      if (!title || !isSoftwareRole(title)) continue;
      const location = locationText(job);
      if (looksObviouslyUsOnly(location)) continue;
      candidates.push({ token: board.token, job });
    }
  }

  candidates.sort((a, b) => {
    const left = postedIso(a.job.first_published) ?? postedIso(a.job.updated_at) ?? "";
    const right = postedIso(b.job.first_published) ?? postedIso(b.job.updated_at) ?? "";
    return right.localeCompare(left);
  });

  const toDetail = candidates.slice(0, MAX_DETAILS);
  const details = await mapPool(toDetail, DETAIL_CONCURRENCY, async (item) => {
    const detail = await fetchJobDetail(item.token, item.job.id);
    return { token: item.token, job: detail ?? item.job };
  });

  const jobs: DiscoveredJob[] = [];
  const seen = new Set<string>();
  for (const item of details) {
    const mapped = mapGreenhouseJob(item.job, item.token);
    if (!mapped || seen.has(mapped.url)) continue;
    // Re-check with description now that we have content.
    if (looksObviouslyUsOnly(mapped.location ?? "", mapped.description)) continue;
    seen.add(mapped.url);
    jobs.push(mapped);
  }

  jobs.sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""));

  return {
    jobs,
    boards: GREENHOUSE_BOARD_TOKENS.length,
    listed: listed.reduce((sum, board) => sum + board.jobs.length, 0),
    detailed: details.length,
    errors,
  };
}
