import type { DiscoveredJob } from "@/lib/discover";

/**
 * Indeed has no public developer Jobs API. We try the public Ireland RSS feed
 * (same data logged-out users can subscribe to). Cloud hosts are often blocked
 * by captcha — set JOBSPIPE_API_KEY to pull Indeed rows via JobsPipe instead.
 */
const RSS_BASE = "https://ie.indeed.com/rss";
const JOBSPIPE_URL = "https://api.jobspipe.dev/v1/jobs/search";
const USER_AGENT =
  "Mozilla/5.0 (compatible; SamuelOlajideJobDashboard/1.0; +https://github.com/samolajide23/Job-Applications)";

export type IndeedPullResult = {
  jobs: DiscoveredJob[];
  errors: string[];
};

type RssQuery = {
  q: string;
  l: string;
};

const DEFAULT_QUERIES: RssQuery[] = [
  { q: "software engineer", l: "Ireland" },
  { q: "python engineer", l: "Dublin, County Dublin" },
  { q: "typescript react", l: "Ireland" },
  { q: "lead software engineer", l: "Ireland" },
  { q: "software engineer", l: "Remote" },
];

function decodeHtml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function tagValue(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = block.match(re);
  return match ? decodeHtml(match[1] ?? "") : "";
}

function splitTitle(raw: string): { title: string; company: string } {
  const cleaned = stripTags(raw);
  const parts = cleaned.split(/\s+[-–—]\s+/);
  if (parts.length >= 2) {
    const company = parts.pop()?.trim() ?? "";
    return { title: parts.join(" - ").trim(), company };
  }
  return { title: cleaned, company: "Indeed" };
}

function parsePubDate(raw: string): string | null {
  if (!raw.trim()) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Canonicalize Indeed viewjob / pagead links to a stable jk= id when present. */
export function normalizeIndeedUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (!url.hostname.includes("indeed.")) return raw.trim() || null;
    const jk = url.searchParams.get("jk");
    if (jk) {
      const host = url.hostname.includes("ie.indeed") ? "ie.indeed.com" : "www.indeed.com";
      return `https://${host}/viewjob?jk=${jk}`;
    }
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|from|vjk|advn|adid|sjdu|tk|xkcb)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function parseIndeedRss(xml: string): DiscoveredJob[] {
  const lower = xml.toLowerCase();
  if (
    lower.includes("captcha") ||
    lower.includes("cf-mitigated") ||
    lower.includes("just a moment") ||
    (lower.includes("<html") && !lower.includes("<rss"))
  ) {
    throw new Error(
      "Indeed blocked this host (captcha / bot challenge). Set JOBSPIPE_API_KEY for a live Indeed feed, or try again later.",
    );
  }
  if (!/<rss[\s>]/i.test(xml) && !/<item[\s>]/i.test(xml)) {
    throw new Error("Indeed response was not an RSS feed.");
  }

  const items = xml.split(/<item[\s>]/i).slice(1);
  const jobs: DiscoveredJob[] = [];
  for (const chunk of items) {
    const item = chunk.split(/<\/item>/i)[0] ?? "";
    const link = stripTags(tagValue(item, "link") || tagValue(item, "guid"));
    const url = normalizeIndeedUrl(link);
    if (!url) continue;
    const { title, company: fromTitle } = splitTitle(tagValue(item, "title"));
    const company =
      stripTags(tagValue(item, "source")) ||
      fromTitle ||
      "Indeed";
    const description = stripTags(tagValue(item, "description"));
    const postedAt = parsePubDate(tagValue(item, "pubDate"));
    if (!title) continue;
    jobs.push({
      url,
      company,
      title,
      source: "Indeed",
      location: null,
      description: description || `${title} at ${company}`,
      tags: ["Indeed"],
      postedAt,
      salaryText: null,
      level: null,
    });
  }
  return jobs;
}

async function fetchRss(query: RssQuery, fromageDays: number): Promise<DiscoveredJob[]> {
  const params = new URLSearchParams({
    q: query.q,
    l: query.l,
    sort: "date",
    fromage: String(Math.max(1, Math.min(fromageDays, 30))),
  });
  const response = await fetch(`${RSS_BASE}?${params.toString()}`, {
    headers: {
      Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
      "Accept-Language": "en-IE,en;q=0.9",
      "User-Agent": USER_AGENT,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    redirect: "follow",
  });
  const body = await response.text();
  if (response.status === 403 || response.status === 429 || response.status === 503) {
    throw new Error(
      "Indeed blocked this host (captcha / bot challenge). Set JOBSPIPE_API_KEY for a live Indeed feed, or try again later.",
    );
  }
  if (!response.ok) {
    throw new Error(`Indeed RSS ${response.status} ${response.statusText}`);
  }
  return parseIndeedRss(body);
}

function mapJobsPipeRow(value: unknown): DiscoveredJob | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const title = typeof row.job_title === "string" ? row.job_title.trim() : "";
  const company = typeof row.company === "string" ? row.company.trim() : "";
  const rawUrl =
    (typeof row.url === "string" && row.url) ||
    (typeof row.source_url === "string" && row.source_url) ||
    (typeof row.final_url === "string" && row.final_url) ||
    "";
  const url = normalizeIndeedUrl(rawUrl) ?? rawUrl.trim();
  if (!title || !company || !url) return null;
  const location = typeof row.location === "string" ? row.location.trim() : null;
  const postedAt =
    typeof row.date_posted === "string" ? parsePubDate(row.date_posted) : null;
  const tags = Array.isArray(row.technology_slugs)
    ? row.technology_slugs.filter((tag): tag is string => typeof tag === "string").slice(0, 8)
    : [];
  if (row.remote === true) tags.unshift("Remote");
  return {
    url,
    company,
    title,
    source: "Indeed",
    location,
    description: [title, company, location].filter(Boolean).join(" — "),
    tags: [...tags, "Indeed"],
    postedAt,
    salaryText: null,
    level: typeof row.seniority === "string" ? row.seniority : null,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pullViaJobsPipe(days: number): Promise<DiscoveredJob[]> {
  const key = process.env.JOBSPIPE_API_KEY?.trim();
  if (!key) {
    throw new Error("JOBSPIPE_API_KEY is not set.");
  }
  // Free plan: max 25 results/request; rate limit is tight — one request, then backoff.
  void days;
  const titleSets: string[][] = [
    ["software engineer", "python engineer", "typescript", "lead software engineer"],
  ];
  const byUrl = new Map<string, DiscoveredJob>();
  for (const titles of titleSets) {
    await sleep(1100);
    const response = await fetch(JOBSPIPE_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        job_title_or: titles,
        job_country_code_or: ["IE"],
        source_or: ["indeed"],
        limit: 25,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`JobsPipe ${response.status}: ${body.slice(0, 180)}`);
    }
    const payload = JSON.parse(body) as { data?: unknown };
    const rows = Array.isArray(payload.data) ? payload.data : [];
    for (const row of rows) {
      const job = mapJobsPipeRow(row);
      if (job) byUrl.set(job.url, job);
    }
  }
  return [...byUrl.values()];
}

export async function pullIndeed(options?: {
  postedWithinDays?: number;
  queries?: RssQuery[];
}): Promise<IndeedPullResult> {
  const days =
    options?.postedWithinDays && options.postedWithinDays > 0 ? options.postedWithinDays : 14;
  const queries = options?.queries ?? DEFAULT_QUERIES;

  // Prefer JobsPipe when configured — Indeed RSS is captcha-blocked on most cloud hosts.
  if (process.env.JOBSPIPE_API_KEY?.trim()) {
    try {
      const jobs = await pullViaJobsPipe(days);
      return { jobs, errors: [] };
    } catch (error) {
      const message = error instanceof Error ? error.message : "JobsPipe Indeed pull failed";
      return { jobs: [], errors: [message] };
    }
  }

  const byUrl = new Map<string, DiscoveredJob>();
  const errors: string[] = [];
  let blocked = false;

  for (const query of queries) {
    try {
      const jobs = await fetchRss(query, days);
      for (const job of jobs) byUrl.set(job.url, job);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Indeed RSS failed";
      errors.push(`${query.q} @ ${query.l}: ${message}`);
      if (/blocked|captcha/i.test(message)) blocked = true;
    }
  }

  if (byUrl.size > 0) {
    return { jobs: [...byUrl.values()], errors };
  }

  if (blocked) {
    return {
      jobs: [],
      errors: [
        "Indeed blocked this host (captcha). Other sources still run. Optional: set JOBSPIPE_API_KEY (https://jobspipe.dev/signup) for a live Indeed feed.",
      ],
    };
  }

  return { jobs: [], errors };
}
