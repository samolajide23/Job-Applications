import { isStatus, type Status } from "@/lib/statuses";

export type HistoryRecord = {
  url: string;
  company: string;
  title: string;
  source: string;
  status: Status;
  appliedAt: string;
  score: number | null;
  location: string | null;
  notes: string | null;
  hasScore: boolean;
  hasLocation: boolean;
  hasNotes: boolean;
};

export type CsvIssue = {
  row: number;
  message: string;
};

const HEADER_ALIASES: Record<string, string> = {
  timestamp: "timestamp",
  applied_at: "timestamp",
  date: "timestamp",
  company: "company",
  title: "title",
  url: "url",
  source: "source",
  status: "status",
  score: "score",
  location: "location",
  notes: "notes",
};

export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += character;
      }
      continue;
    }
    if (character === '"') {
      inQuotes = true;
      continue;
    }
    if (character === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      cell = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    cell += character;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.trim() !== "")) rows.push(row);
  }
  return rows;
}

export function normalizeUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    // Same Greenhouse board, two public hosts.
    if (url.hostname === "job-boards.greenhouse.io") {
      url.hostname = "boards.greenhouse.io";
    }
    if (url.pathname.length > 1) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }
    // Ashby / Lever job page and apply page are the same role.
    if (url.hostname.endsWith("ashbyhq.com") && url.pathname.endsWith("/application")) {
      url.pathname = url.pathname.slice(0, -"/application".length) || "/";
    }
    if (url.hostname.endsWith("lever.co") && url.pathname.endsWith("/apply")) {
      url.pathname = url.pathname.slice(0, -"/apply".length) || "/";
    }
    // Drop tracking noise; keep ATS ids like gh_jid.
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|ref$|source$|gh_src)/i.test(key)) url.searchParams.delete(key);
    }
    // Canonical LinkedIn job URLs (ie./uk. hosts + tracking query → www + id).
    if (url.hostname.endsWith("linkedin.com")) {
      const view = url.pathname.match(/\/jobs\/view\/(?:[^/]+-)?(\d+)/);
      if (view?.[1]) {
        url.hostname = "www.linkedin.com";
        url.pathname = `/jobs/view/${view[1]}`;
        url.search = "";
      }
    }
    // Canonical Indeed viewjob links by jk id.
    if (url.hostname.includes("indeed.")) {
      const jk = url.searchParams.get("jk");
      if (jk) {
        url.hostname = url.hostname.includes("ie.indeed") ? "ie.indeed.com" : "www.indeed.com";
        url.pathname = "/viewjob";
        url.search = "";
        url.searchParams.set("jk", jk);
      }
    }
    return url.toString();
  } catch {
    return null;
  }
}

function headerIndex(headers: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headers.forEach((header, index) => {
    const canonical = HEADER_ALIASES[header.trim().toLowerCase()];
    if (canonical) map.set(canonical, index);
  });
  return map;
}

function cell(row: string[], map: Map<string, number>, key: string): string {
  const index = map.get(key);
  if (index === undefined) return "";
  return (row[index] ?? "").trim();
}

export function parseHistoryCsv(input: string): { records: HistoryRecord[]; errors: CsvIssue[] } {
  const table = parseCsv(input);
  if (table.length === 0) {
    return { records: [], errors: [{ row: 1, message: "CSV is empty." }] };
  }
  const columns = headerIndex(table[0]);
  for (const required of ["timestamp", "company", "title", "url", "source", "status"]) {
    if (!columns.has(required)) {
      return {
        records: [],
        errors: [{ row: 1, message: `Missing ${required} column.` }],
      };
    }
  }

  const records: HistoryRecord[] = [];
  const errors: CsvIssue[] = [];
  table.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;
    const url = normalizeUrl(cell(row, columns, "url"));
    const company = cell(row, columns, "company");
    const title = cell(row, columns, "title");
    const source = cell(row, columns, "source");
    const statusRaw = cell(row, columns, "status").toLowerCase();
    const timestamp = cell(row, columns, "timestamp");
    if (!url) {
      errors.push({ row: rowNumber, message: "URL is missing or not http(s)." });
      return;
    }
    if (!company || !title || !source) {
      errors.push({ row: rowNumber, message: "Company, title, and source are required." });
      return;
    }
    if (!isStatus(statusRaw)) {
      errors.push({ row: rowNumber, message: `Unknown status “${statusRaw || "blank"}”.` });
      return;
    }
    const applied = new Date(timestamp);
    if (!timestamp || Number.isNaN(applied.getTime())) {
      errors.push({ row: rowNumber, message: "Timestamp is missing or invalid." });
      return;
    }
    const scoreText = cell(row, columns, "score");
    const locationText = cell(row, columns, "location");
    const notesText = cell(row, columns, "notes");
    let score: number | null = null;
    if (columns.has("score") && scoreText) {
      const parsed = Number(scoreText);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
        errors.push({ row: rowNumber, message: "Score must be a whole number from 0 to 100." });
        return;
      }
      score = parsed;
    }
    records.push({
      url,
      company,
      title,
      source,
      status: statusRaw,
      appliedAt: applied.toISOString(),
      score,
      location: locationText || null,
      notes: notesText || null,
      hasScore: columns.has("score"),
      hasLocation: columns.has("location"),
      hasNotes: columns.has("notes"),
    });
  });

  return { records: dedupeHistory(records), errors };
}

export function dedupeHistory(records: HistoryRecord[]): HistoryRecord[] {
  const byUrl = new Map<string, HistoryRecord>();
  for (const record of records) {
    const current = byUrl.get(record.url);
    if (!current || record.appliedAt >= current.appliedAt) {
      byUrl.set(record.url, record);
    }
  }
  return [...byUrl.values()];
}
