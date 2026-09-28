import { normalizeUrl } from "@/lib/csv";
import { shouldAutoQueue } from "@/lib/filters";
import { scoreJob } from "@/lib/score";
import { cleanTags, excerpt, extractAtsUrl, stripHtml } from "@/lib/text";
import type { QueueRules, ScoreBreakdown } from "@/lib/types";

export type DiscoveredJob = {
  url: string;
  company: string;
  title: string;
  source: string;
  location: string | null;
  description: string;
  tags: string[];
  postedAt: string | null;
  salaryText: string | null;
  level: string | null;
};

export type PreparedJob = {
  url: string;
  company: string;
  title: string;
  source: string;
  location: string | null;
  excerpt: string;
  tags: string[];
  postedAt: string | null;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  status: "discovered" | "queued";
};

export type PrepareResult = {
  accepted: PreparedJob[];
  /** Raw board listings considered before applicability cuts. */
  pulled: number;
  ineligible: number;
  notSoftware: number;
  tooOld: number;
  senior: number;
  noKeyword: number;
};

const SOFTWARE_TITLE =
  /\b(engineer|developer|software|full[- ]?stack|fullstack|backend|back-end|frontend|front-end|python|machine learning|data scientist|\bml\b|\bai\b|sre|devops|mlops|site reliability|\bswe\b|\bsde\b|platform|automation|typescript|react|node)\b/i;

/** Open ATS boards list currently-open roles; first_published is not a useful age cut. */
const OPEN_BOARD_SOURCES = new Set(["Greenhouse", "Ashby"]);

export function isSoftwareRole(title: string, tags: string[] = []): boolean {
  return SOFTWARE_TITLE.test(`${title} ${tags.join(" ")}`);
}

/**
 * Keep applicable roles: software, recent (except open ATS boards), not geo-blocked,
 * not Staff/Principal/Director+, matching CV stack keywords. Score ≥ minScore → Queue.
 */
export function prepareDiscovery(
  jobs: DiscoveredJob[],
  rules: QueueRules,
  now: Date = new Date(),
): PrepareResult {
  const sorted = [...jobs].sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""));
  const seen = new Set<string>();
  const accepted: PreparedJob[] = [];
  let pulled = 0;
  let ineligible = 0;
  let notSoftware = 0;
  let tooOld = 0;
  let senior = 0;
  let noKeyword = 0;

  for (const job of sorted) {
    const url = normalizeUrl(job.url);
    if (!url || seen.has(url)) continue;
    if (!job.company.trim() || !job.title.trim()) continue;
    pulled += 1;
    if (!isSoftwareRole(job.title, job.tags)) {
      notSoftware += 1;
      continue;
    }
    if (job.postedAt && rules.postedWithinDays > 0 && !OPEN_BOARD_SOURCES.has(job.source)) {
      const age = now.getTime() - new Date(job.postedAt).getTime();
      if (age > rules.postedWithinDays * 86_400_000) {
        tooOld += 1;
        continue;
      }
    }
    const description = stripHtml(job.description);
    const breakdown = scoreJob({
      title: job.title,
      company: job.company,
      location: job.location,
      description,
      tags: job.tags,
      url,
      salaryText: job.salaryText,
      level: job.level,
    });
    if (breakdown.eligible === "ineligible") {
      ineligible += 1;
      continue;
    }
    if (rules.excludeSenior && breakdown.seniorityFlag === "senior_skip") {
      senior += 1;
      continue;
    }
    const haystack = `${job.title}\n${job.company}\n${job.tags.join(" ")}\n${description}\n${job.location ?? ""}`;
    if (rules.keywords.length > 0) {
      const lower = haystack.toLowerCase();
      const matched = rules.keywords.some((keyword) => lower.includes(keyword.toLowerCase()));
      if (!matched) {
        noKeyword += 1;
        continue;
      }
    }
    seen.add(url);
    accepted.push({
      url,
      company: job.company.trim().slice(0, 200),
      title: job.title.trim().slice(0, 300),
      source: job.source.slice(0, 80),
      location: job.location?.trim().slice(0, 200) || null,
      excerpt: excerpt(description, 1200),
      tags: cleanTags(job.tags),
      postedAt: job.postedAt,
      score: breakdown.total,
      scoreBreakdown: breakdown,
      status: shouldAutoQueue(rules, {
        total: breakdown.total,
        eligible: breakdown.eligible,
        seniorityFlag: breakdown.seniorityFlag,
        haystack,
      })
        ? "queued"
        : "discovered",
    });
  }

  return { accepted, pulled, ineligible, notSoftware, tooOld, senior, noKeyword };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => asString(item)).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function postedFromEpoch(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const milliseconds = value < 10_000_000_000 ? value * 1000 : value;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function postedIso(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function chooseUrl(listingUrl: string, description: string, applyUrl = ""): string {
  const externalApply =
    applyUrl && !/remoteok\.com|remotive\.com|jobicy\.com|hiringcafe\.com|hiring\.cafe/i.test(applyUrl)
      ? applyUrl
      : "";
  return externalApply || extractAtsUrl(description) || listingUrl;
}

export function mapJobicyJob(value: unknown): DiscoveredJob | null {
  const record = asRecord(value);
  if (!record) return null;
  const title = asString(record.jobTitle);
  const company = asString(record.companyName);
  const listing = asString(record.url);
  const description = asString(record.jobDescription) || asString(record.jobExcerpt);
  const url = chooseUrl(listing, description);
  if (!title || !company || !url) return null;
  return {
    url,
    company,
    title,
    source: "Jobicy",
    location: asString(record.jobGeo) || null,
    description,
    tags: [...asStringList(record.jobIndustry), ...asStringList(record.jobLevel)],
    postedAt: postedIso(record.pubDate),
    salaryText: null,
    level: asString(record.jobLevel) || null,
  };
}

export function mapRemotiveJob(value: unknown): DiscoveredJob | null {
  const record = asRecord(value);
  if (!record) return null;
  const title = asString(record.title);
  const company = asString(record.company_name);
  const listing = asString(record.url);
  const description = asString(record.description);
  const url = chooseUrl(listing, description);
  if (!title || !company || !url) return null;
  const category = asString(record.category);
  return {
    url,
    company,
    title,
    source: "Remotive",
    location: asString(record.candidate_required_location) || null,
    description,
    tags: [...asStringList(record.tags), category].filter(Boolean),
    postedAt: postedIso(record.publication_date),
    salaryText: asString(record.salary) || null,
    level: null,
  };
}

export function mapRemoteOkJob(value: unknown): DiscoveredJob | null {
  const record = asRecord(value);
  if (!record || !asString(record.position)) return null;
  const title = asString(record.position);
  const company = asString(record.company);
  const listing = asString(record.url);
  const description = asString(record.description);
  const applyUrl = asString(record.apply_url);
  const url = chooseUrl(listing, description, applyUrl);
  if (!title || !company || !url) return null;
  const min = typeof record.salary_min === "number" ? record.salary_min : 0;
  const max = typeof record.salary_max === "number" ? record.salary_max : 0;
  const salaryText = min > 0 || max > 0 ? `USD ${min || max}${max && min ? `-${max}` : ""}` : null;
  return {
    url,
    company,
    title,
    source: "RemoteOK",
    location: asString(record.location) || null,
    description,
    tags: asStringList(record.tags),
    postedAt: postedIso(record.date) ?? postedFromEpoch(record.epoch),
    salaryText,
    level: null,
  };
}
