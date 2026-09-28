import type { DiscoveredJob } from "@/lib/discover";

/**
 * LinkedIn's public guest job search (same HTML cards logged-out visitors see).
 * No account / cookies. Rate-limited; keep page count modest.
 */
const SEARCH_URL = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search";
const USER_AGENT =
  "Mozilla/5.0 (compatible; SamuelOlajideJobDashboard/1.0; +https://github.com/samolajide23/Job-Applications)";

/** LinkedIn geoId for Ireland. */
const IRELAND_GEO_ID = "104738515";

const PAGE_SIZE = 10;
/** Keep modest — LinkedIn guest search 429s quickly from one IP. */
const MAX_PAGES_PER_QUERY = 2;

export type LinkedInPullResult = {
  jobs: DiscoveredJob[];
  errors: string[];
};

type SearchQuery = {
  keywords: string;
  geoId?: string;
  location?: string;
  /** LinkedIn workplace type: 1=on-site, 2=remote, 3=hybrid */
  workplace?: "1" | "2" | "3";
};

const DEFAULT_QUERIES: SearchQuery[] = [
  { keywords: "software engineer", geoId: IRELAND_GEO_ID, location: "Ireland" },
  { keywords: "python typescript", geoId: IRELAND_GEO_ID, location: "Ireland" },
  { keywords: "lead software engineer", geoId: IRELAND_GEO_ID, location: "Ireland" },
  { keywords: "software engineer remote Europe", workplace: "2" },
];

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function stripTags(value: string): string {
  // Class markers often sit mid-tag, so drop a leftover opening-tag tail first.
  const cleaned = value.replace(/^[^<]*>/, "").replace(/<[^>]+>/g, " ");
  return decodeHtml(cleaned.replace(/\s+/g, " ").trim());
}

function between(html: string, start: string, end: string): string | null {
  const i = html.indexOf(start);
  if (i < 0) return null;
  const from = i + start.length;
  const j = html.indexOf(end, from);
  if (j < 0) return null;
  return html.slice(from, j);
}

function attr(tag: string, name: string): string | null {
  const re = new RegExp(`${name}="([^"]*)"`, "i");
  const match = tag.match(re);
  return match ? decodeHtml(match[1] ?? "") : null;
}

/** Canonical job URL used for dedupe across ie./www. hosts and tracking params. */
export function linkedInJobUrl(jobId: string): string {
  return `https://www.linkedin.com/jobs/view/${jobId}`;
}

export function parseLinkedInSearchHtml(html: string): DiscoveredJob[] {
  if (!html.trim()) return [];
  const lower = html.toLowerCase();
  if (lower.includes("authwall") || lower.includes("/checkpoint/")) {
    throw new Error("LinkedIn returned an auth wall; try again later from this host.");
  }

  const cards = html.split(/data-entity-urn="urn:li:jobPosting:/).slice(1);
  const jobs: DiscoveredJob[] = [];

  for (const chunk of cards) {
    const idMatch = chunk.match(/^(\d+)/);
    if (!idMatch) continue;
    const jobId = idMatch[1] ?? "";
    if (!jobId) continue;

    const title =
      stripTags(between(chunk, 'class="base-search-card__title"', "</h3>") ?? "") ||
      stripTags(between(chunk, 'class="sr-only"', "</span>") ?? "");
    const company = stripTags(
      between(chunk, 'class="base-search-card__subtitle"', "</h4>") ?? "",
    );
    const location = stripTags(
      between(chunk, 'class="job-search-card__location"', "</span>") ?? "",
    );
    const timeTag = chunk.match(/<time[^>]*datetime="([^"]+)"[^>]*>/i);
    const postedAt = timeTag?.[1]
      ? (() => {
          const date = new Date(`${timeTag[1]}T12:00:00.000Z`);
          return Number.isNaN(date.getTime()) ? null : date.toISOString();
        })()
      : null;

    // Prefer the card href when present, then canonicalize by id.
    const hrefTag = chunk.match(/<a[^>]*class="base-card__full-link"[^>]*>/i)?.[0] ?? "";
    const href = attr(hrefTag, "href");
    const url = linkedInJobUrl(jobId);

    if (!title || !company) continue;

    jobs.push({
      url: href?.includes("/jobs/view/") ? linkedInJobUrl(jobId) : url,
      company,
      title,
      source: "LinkedIn",
      location: location || null,
      description: [title, company, location].filter(Boolean).join(" — "),
      tags: location ? [location] : [],
      postedAt,
      salaryText: null,
      level: null,
    });
  }

  return jobs;
}

function tprSeconds(days: number): number {
  const clamped = Math.max(1, Math.min(days, 30));
  return clamped * 86_400;
}

async function fetchSearchPage(params: URLSearchParams): Promise<string> {
  const response = await fetch(`${SEARCH_URL}?${params.toString()}`, {
    headers: {
      Accept: "text/html",
      "Accept-Language": "en-IE,en;q=0.9",
      "User-Agent": USER_AGENT,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    redirect: "follow",
  });
  const body = await response.text();
  if (response.status === 429) {
    throw new Error("LinkedIn rate-limited this host (429).");
  }
  if (!response.ok) {
    throw new Error(`LinkedIn ${response.status} ${response.statusText}`);
  }
  if (body.trimStart().startsWith("{") && body.toLowerCase().includes("challenge")) {
    throw new Error("LinkedIn returned a challenge response.");
  }
  return body;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pullLinkedIn(options?: {
  postedWithinDays?: number;
  queries?: SearchQuery[];
}): Promise<LinkedInPullResult> {
  const days =
    options?.postedWithinDays && options.postedWithinDays > 0 ? options.postedWithinDays : 14;
  const queries = options?.queries ?? DEFAULT_QUERIES;
  const byId = new Map<string, DiscoveredJob>();
  const errors: string[] = [];

  for (const query of queries) {
    for (let page = 0; page < MAX_PAGES_PER_QUERY; page += 1) {
      const params = new URLSearchParams({
        keywords: query.keywords,
        start: String(page * PAGE_SIZE),
        f_TPR: `r${tprSeconds(days)}`,
      });
      if (query.geoId) params.set("geoId", query.geoId);
      if (query.location) params.set("location", query.location);
      if (query.workplace) params.set("f_WT", query.workplace);

      try {
        const html = await fetchSearchPage(params);
        const jobs = parseLinkedInSearchHtml(html);
        if (jobs.length === 0) break;
        for (const job of jobs) {
          const id = job.url.match(/\/jobs\/view\/(\d+)/)?.[1];
          if (id) byId.set(id, job);
        }
        if (jobs.length < PAGE_SIZE) break;
        await sleep(500);
      } catch (error) {
        const message = error instanceof Error ? error.message : "LinkedIn request failed";
        errors.push(`${query.keywords}: ${message}`);
        break;
      }
    }
  }

  return { jobs: [...byId.values()], errors };
}
