import { NextResponse } from "next/server";
import { DatabaseConfigError } from "@/lib/db";
import { isStatus, type Status } from "@/lib/statuses";
import type { Origin, QueueRules } from "@/lib/types";
import { normalizeUrl } from "@/lib/csv";

export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function failureResponse(error: unknown): NextResponse {
  if (error instanceof DatabaseConfigError) return jsonError(error.message, 503);
  console.error(error);
  return jsonError("The dashboard could not finish that request.", 500);
}

export function unauthorized(): NextResponse {
  return jsonError("Unauthorized", 401);
}

type FieldFlags = {
  company: boolean;
  title: boolean;
  source: boolean;
  status: boolean;
  score: boolean;
  location: boolean;
  notes: boolean;
  appliedAt: boolean;
  excerpt: boolean;
  tags: boolean;
};

export type ParsedUpsert = {
  url: string;
  company: string;
  title: string;
  source: string;
  status: Status;
  score: number | null;
  location: string | null;
  notes: string | null;
  excerpt: string | null;
  tags: string[];
  appliedAt: string | null;
  postedAt: string | null;
  origin: Origin;
  fields: FieldFlags;
};

export function parseUpsertBody(body: unknown, fallbackOrigin: Origin): ParsedUpsert | string {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "Expected a JSON object.";
  const record = body as Record<string, unknown>;
  const url = typeof record.url === "string" ? normalizeUrl(record.url) : null;
  if (!url) return "A valid http(s) url is required.";
  const has = (key: string) => Object.prototype.hasOwnProperty.call(record, key);
  const company = cleanText(record.company, 200);
  const title = cleanText(record.title, 300);
  const source = cleanText(record.source, 80);
  const statusRaw = typeof record.status === "string" ? record.status.trim().toLowerCase() : "";
  if (has("status") && !isStatus(statusRaw)) return `Unknown status “${statusRaw || "blank"}”.`;
  const status = (isStatus(statusRaw) ? statusRaw : "applied") as Status;
  const score = parseOptionalScore(record, "score");
  if (typeof score === "string") return score;
  const notes = parseOptionalText(record, "notes", 4000);
  if (typeof notes === "string" && notes.startsWith("error:")) return notes.slice(6);
  const location = parseOptionalText(record, "location", 200);
  if (typeof location === "string" && location.startsWith("error:")) return location.slice(6);
  const timestamp = firstString(record, ["timestamp", "appliedAt", "applied_at"]);
  let appliedAt: string | null = null;
  if (timestamp) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "Timestamp is invalid.";
    appliedAt = date.toISOString();
  }
  const postedRaw = firstString(record, ["postedAt", "posted_at"]);
  let postedAt: string | null = null;
  if (postedRaw) {
    const date = new Date(postedRaw);
    if (Number.isNaN(date.getTime())) return "postedAt is invalid.";
    postedAt = date.toISOString();
  }
  const tags = Array.isArray(record.tags)
    ? record.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean)
    : [];
  return {
    url,
    company: company ?? "",
    title: title ?? "",
    source: source ?? "",
    status,
    score: score ?? null,
    location: location ?? null,
    notes: notes ?? null,
    excerpt: typeof record.excerpt === "string" ? record.excerpt.slice(0, 1200) : null,
    tags,
    appliedAt,
    postedAt,
    origin: fallbackOrigin,
    fields: {
      company: has("company"),
      title: has("title"),
      source: has("source"),
      status: has("status"),
      score: has("score"),
      location: has("location"),
      notes: has("notes"),
      appliedAt: has("timestamp") || has("appliedAt") || has("applied_at"),
      excerpt: has("excerpt"),
      tags: has("tags"),
    },
  };
}

export function parseRules(body: unknown): QueueRules | string {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "Expected a JSON object.";
  const record = body as Record<string, unknown>;
  const minScore = Number(record.minScore);
  const postedWithinDays = Number(record.postedWithinDays);
  if (!Number.isInteger(minScore) || minScore < 0 || minScore > 100) {
    return "minScore must be a whole number from 0 to 100.";
  }
  if (!Number.isInteger(postedWithinDays) || postedWithinDays < 1 || postedWithinDays > 90) {
    return "postedWithinDays must be a whole number from 1 to 90.";
  }
  const keywords = Array.isArray(record.keywords)
    ? record.keywords
        .filter((keyword): keyword is string => typeof keyword === "string")
        .map((keyword) => keyword.trim())
        .filter((keyword) => keyword.length > 0 && !keyword.includes(","))
        .slice(0, 20)
    : [];
  return {
    autoQueue: record.autoQueue === true,
    minScore,
    excludeSenior: record.excludeSenior !== false,
    eligibleOnly: record.eligibleOnly !== false,
    keywords,
    postedWithinDays,
  };
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function firstString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function parseOptionalScore(record: Record<string, unknown>, key: string): number | null | undefined | string {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return undefined;
  const value = record[key];
  if (value === null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 100) {
    return "Score must be a whole number from 0 to 100.";
  }
  return number;
}

function parseOptionalText(
  record: Record<string, unknown>,
  key: string,
  max: number,
): string | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return undefined;
  const value = record[key];
  if (value === null) return null;
  if (typeof value !== "string") return `error:${key} must be a string.`;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}
