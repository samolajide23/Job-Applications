import type { DiscoveredJob } from "@/lib/discover";

const ENDPOINT = "https://hiringcafe.com/api/search-jobs";
const PAGE_SIZE = 40;
const MAX_PAGES = 3;

type SearchOptions = {
  days: number;
  queries: string[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => asString(item)).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[|,]/)
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [];
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

function irelandRemoteSearchState(days: number, searchQuery: string): Record<string, unknown> {
  return {
    locations: [
      {
        formatted_address: "Ireland",
        types: ["country"],
        geometry: { location: { lat: "53.3498", lon: "-6.2603" } },
        id: "user_country",
        address_components: [{ long_name: "Ireland", short_name: "IE", types: ["country"] }],
        options: { flexible_regions: ["anywhere_in_continent", "anywhere_in_world"] },
      },
    ],
    workplaceTypes: ["Remote"],
    defaultToUserLocation: false,
    userLocation: null,
    commitmentTypes: ["Full Time", "Contract"],
    jobTitleQuery: "",
    jobDescriptionQuery: "",
    seniorityLevel: ["Entry Level", "Mid Level", "Senior Level"],
    roleTypes: ["Individual Contributor"],
    roleYoeRange: [0, 8],
    excludeIfRoleYoeIsNotSpecified: false,
    searchQuery,
    dateFetchedPastNDays: days,
    sortBy: "date",
    technologyKeywordsQuery: "",
    requirementsKeywordsQuery: "",
    companyPublicOrPrivate: "all",
    hideJobTypes: [],
    industries: [],
    departments: [],
  };
}

function companyFrom(record: Record<string, unknown>): string {
  const nested =
    asRecord(record.company) ??
    asRecord(record.v) ??
    asRecord(record.v_or) ??
    asRecord(record.company_information) ??
    asRecord(record.companyInformation);
  const direct =
    asString(record.company_name) ||
    asString(record.companyName) ||
    asString(nested?.name) ||
    asString(nested?.company_name) ||
    asString(nested?.companyName);
  if (direct) return direct;
  const board = asString(record.board_token) || asString(record.boardToken);
  if (board) {
    return board
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase())
      .trim();
  }
  const combined = asString(record.source_and_board_token) || asString(record.sourceAndBoardToken);
  if (combined.includes("___")) {
    const parts = combined.split("___").filter(Boolean);
    if (parts.length >= 2) {
      return parts[1].replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()).trim();
    }
  }
  return asString(record.source);
}

function locationFrom(record: Record<string, unknown>): string | null {
  const workplace = asRecord(record.workplace) ?? asRecord(record.job_workplace) ?? {};
  const parts = [
    ...asStringList(record.location_formatted),
    ...asStringList(record.locationFormatted),
    ...asStringList(record.workplace_type),
    ...asStringList(record.workplaceType),
    ...asStringList(workplace.type),
    ...asStringList(record.workplaceCountries ?? record.workplace_countries ?? workplace.countries),
    ...asStringList(record.workplaceCities ?? record.workplace_cities ?? workplace.cities),
    ...asStringList(record.locations),
  ].filter(Boolean);
  if (parts.length === 0) return "Remote";
  return [...new Set(parts)].join(" · ").slice(0, 200);
}

function salaryFrom(record: Record<string, unknown>): string | null {
  const min = record.salary_min ?? record.salaryMin;
  const max = record.salary_max ?? record.salaryMax;
  const currency = asString(record.salary_currency ?? record.salaryCurrency) || "USD";
  if (typeof min === "number" || typeof max === "number") {
    const low = typeof min === "number" ? min : max;
    const high = typeof max === "number" ? max : min;
    if (typeof low === "number" && typeof high === "number" && low !== high) {
      return `${currency} ${low}-${high}`;
    }
    if (typeof low === "number") return `${currency} ${low}`;
  }
  return asString(record.salary) || null;
}

function listingUrl(record: Record<string, unknown>, applyUrl: string): string {
  const id = asString(record.id) || asString(record.objectID) || asString(record.objectId);
  if (id) return `https://hiringcafe.com/job/${encodeURIComponent(id)}`;
  return applyUrl;
}

export function mapHiringCafeJob(value: unknown): DiscoveredJob | null {
  const record = asRecord(value);
  if (!record) return null;
  const info =
    asRecord(record.job_information) ??
    asRecord(record.jobInformation) ??
    asRecord(record.job) ??
    {};
  const title =
    asString(info.title) ||
    asString(record.title) ||
    asString(record.job_title) ||
    asString(record.jobTitle) ||
    asString(record.coreJobTitle);
  const company = companyFrom(record);
  const applyUrl =
    asString(record.apply_url) ||
    asString(record.applyUrl) ||
    asString(record.job_url) ||
    asString(record.jobUrl) ||
    asString(info.apply_url) ||
    asString(info.applyUrl);
  const description =
    asString(info.description) ||
    asString(record.description) ||
    asString(record.job_description) ||
    asString(record.jobDescription);
  const url = applyUrl || listingUrl(record, "");
  if (!title || !company || !url) return null;
  const tags = [
    ...asStringList(record.technical_tools ?? record.technicalTools ?? info.technical_tools),
    ...asStringList(record.category ?? info.category),
    ...asStringList(record.seniority_level ?? record.seniorityLevel),
    ...asStringList(record.workplace_type ?? record.workplaceType),
    "HiringCafe",
  ];
  const level = asString(record.seniority_level ?? record.seniorityLevel) || null;
  return {
    url,
    company,
    title,
    source: "HiringCafe",
    location: locationFrom(record),
    description,
    tags: [...new Set(tags.filter(Boolean))],
    postedAt:
      postedIso(record.posted_at) ??
      postedIso(record.postedAt) ??
      postedIso(record.date_fetched) ??
      postedIso(record.dateFetched) ??
      postedIso(info.posted_at),
    salaryText: salaryFrom(record),
    level,
  };
}

function extractJobs(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = asRecord(payload);
  if (!record) return [];
  for (const key of ["results", "jobs", "data", "items", "content"]) {
    const nested = record[key];
    if (Array.isArray(nested)) return nested;
  }
  const hits = asRecord(record.hits);
  if (hits && Array.isArray(hits.hits)) {
    return hits.hits.map((hit) => {
      const row = asRecord(hit);
      return row?._source ?? hit;
    });
  }
  return [];
}

function assertJson(response: Response, body: string): unknown {
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok) {
    if (
      body.includes("Just a moment") ||
      response.status === 403 ||
      response.status === 405 ||
      response.status === 503
    ) {
      throw new Error(
        "Hiring Cafe blocked this host (Cloudflare). Open hiringcafe.com from a normal browser network, or pull again later; Jobicy/Remotive/RemoteOK still run.",
      );
    }
    throw new Error(`${response.status} ${response.statusText}`);
  }
  if (!type.includes("json") && body.trimStart().startsWith("<")) {
    throw new Error("Hiring Cafe returned HTML instead of JSON (likely a bot challenge).");
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error("Hiring Cafe response was not valid JSON.");
  }
}

async function postSearch(searchState: Record<string, unknown>, page: number): Promise<unknown[]> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json",
      Origin: "https://hiringcafe.com",
      Referer: "https://hiringcafe.com/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      "sec-ch-ua": '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "x-nextjs-data": "1",
      purpose: "prefetch",
    },
    body: JSON.stringify({ size: PAGE_SIZE, page, searchState }),
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(8_000),
  });
  if (response.status >= 300 && response.status < 400) {
    throw new Error(`Hiring Cafe redirected (${response.status}); refusing to convert POST.`);
  }
  const text = await response.text();
  return extractJobs(assertJson(response, text));
}

export async function pullHiringCafe(options: SearchOptions): Promise<DiscoveredJob[]> {
  const days = Math.min(Math.max(options.days, 1), 60);
  const queries = options.queries.length > 0 ? options.queries : ["software engineer"];
  const seen = new Set<string>();
  const jobs: DiscoveredJob[] = [];

  // Probe once — if Cloudflare blocks this host, bail instead of retrying every query.
  const firstQuery = queries[0] ?? "software engineer";
  const firstBatch = await postSearch(irelandRemoteSearchState(days, firstQuery), 0);
  for (const item of firstBatch) {
    const mapped = mapHiringCafeJob(item);
    if (!mapped || seen.has(mapped.url)) continue;
    seen.add(mapped.url);
    jobs.push(mapped);
  }

  const pageStarts: { query: string; page: number }[] = [];
  if (firstBatch.length >= PAGE_SIZE) pageStarts.push({ query: firstQuery, page: 1 });
  for (const query of queries.slice(1)) pageStarts.push({ query, page: 0 });

  const batches = await Promise.all(
    pageStarts.map(async ({ query, page: startPage }) => {
      const found: DiscoveredJob[] = [];
      for (let page = startPage; page < MAX_PAGES; page += 1) {
        const batch = await postSearch(irelandRemoteSearchState(days, query), page);
        if (batch.length === 0) break;
        for (const item of batch) {
          const mapped = mapHiringCafeJob(item);
          if (mapped) found.push(mapped);
        }
        if (batch.length < PAGE_SIZE) break;
      }
      return found;
    }),
  );

  for (const found of batches) {
    for (const mapped of found) {
      if (seen.has(mapped.url)) continue;
      seen.add(mapped.url);
      jobs.push(mapped);
    }
  }

  return jobs;
}
