import { randomUUID } from "node:crypto";
import type { HistoryRecord } from "@/lib/csv";
import { isTrackerStatus, type Status } from "@/lib/statuses";
import type { Application, Origin, QueueRules, ScoreBreakdown } from "@/lib/types";
import { DEFAULT_RULES } from "@/lib/types";
export type Queryable = {
  query<T extends Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
};

export type NewApplication = {
  id: string;
  url: string;
  company: string;
  title: string;
  source: string;
  status: Status;
  score: number | null;
  scoreBreakdown: ScoreBreakdown | null;
  location: string | null;
  notes: string | null;
  excerpt: string | null;
  tags: string[];
  postedAt: string | null;
  appliedAt: string | null;
  discoveredAt: string | null;
  origin: Origin;
};

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS applications (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    company TEXT NOT NULL,
    title TEXT NOT NULL,
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    score INTEGER,
    score_breakdown TEXT,
    location TEXT,
    notes TEXT,
    excerpt TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    posted_at TIMESTAMPTZ,
    applied_at TIMESTAMPTZ,
    discovered_at TIMESTAMPTZ,
    origin TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS applications_status_idx ON applications (status)`,
  `CREATE INDEX IF NOT EXISTS applications_applied_at_idx ON applications (applied_at DESC)`,
  `CREATE TABLE IF NOT EXISTS queue_rules (
    id TEXT PRIMARY KEY,
    auto_queue BOOLEAN NOT NULL DEFAULT TRUE,
    min_score INTEGER NOT NULL DEFAULT 60,
    exclude_senior BOOLEAN NOT NULL DEFAULT TRUE,
    eligible_only BOOLEAN NOT NULL DEFAULT TRUE,
    keywords TEXT NOT NULL DEFAULT '',
    posted_within_days INTEGER NOT NULL DEFAULT 14,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `INSERT INTO queue_rules (id) VALUES ('default') ON CONFLICT (id) DO NOTHING`,
];

type DbRow = {
  id: string;
  url: string;
  company: string;
  title: string;
  source: string;
  status: string;
  score: number | string | null;
  score_breakdown: string | null;
  location: string | null;
  notes: string | null;
  excerpt: string | null;
  tags: string;
  posted_at: string | Date | null;
  applied_at: string | Date | null;
  discovered_at: string | Date | null;
  origin: string;
  updated_at: string | Date;
};

export async function ensureSchema(db: Queryable): Promise<void> {
  for (const statement of SCHEMA) {
    await db.query(statement);
  }
  await bootstrapAutoQueue(db);
}

async function bootstrapAutoQueue(db: Queryable): Promise<void> {
  const claimed = await db.query<{ key: string }>(
    `INSERT INTO app_meta (key, value) VALUES ('rules_autoqueue_v1', '1')
     ON CONFLICT (key) DO NOTHING
     RETURNING key`,
  );
  if (claimed.length === 0) return;
  await saveRules(db, DEFAULT_RULES);
}

export async function listApplications(db: Queryable): Promise<Application[]> {
  const rows = await db.query<DbRow>(
    `SELECT id, url, company, title, source, status, score, score_breakdown, location, notes,
            excerpt, tags, posted_at, applied_at, discovered_at, origin, updated_at
     FROM applications
     ORDER BY COALESCE(applied_at, posted_at, discovered_at, updated_at) DESC`,
  );
  return rows.map(mapRow);
}

export async function getApplication(db: Queryable, id: string): Promise<Application | null> {
  const rows = await db.query<DbRow>(
    `SELECT id, url, company, title, source, status, score, score_breakdown, location, notes,
            excerpt, tags, posted_at, applied_at, discovered_at, origin, updated_at
     FROM applications WHERE id = $1`,
    [id],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function findByUrl(db: Queryable, url: string): Promise<Application | null> {
  const rows = await db.query<DbRow>(
    `SELECT id, url, company, title, source, status, score, score_breakdown, location, notes,
            excerpt, tags, posted_at, applied_at, discovered_at, origin, updated_at
     FROM applications WHERE url = $1`,
    [url],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function seedLoaded(db: Queryable): Promise<boolean> {
  const rows = await db.query<{ value: string }>(
    `SELECT value FROM app_meta WHERE key = 'seed_v1'`,
  );
  return rows.length > 0;
}

export async function markSeedLoaded(db: Queryable): Promise<void> {
  await db.query(
    `INSERT INTO app_meta (key, value) VALUES ('seed_v1', '1') ON CONFLICT (key) DO NOTHING`,
  );
}

export async function insertIgnore(db: Queryable, rows: NewApplication[]): Promise<string[]> {
  const inserted: string[] = [];
  const chunkSize = 40;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const params: unknown[] = [];
    const values = chunk.map((row) => {
      const placeholders = Array.from({ length: 16 }, (_, offset) => {
        params.push(columnValue(row, offset));
        return `$${params.length}`;
      });
      return `(${placeholders.join(", ")})`;
    });
    const created = await db.query<{ url: string }>(
      `INSERT INTO applications (
        id, url, company, title, source, status, score, score_breakdown, location, notes,
        excerpt, tags, posted_at, applied_at, discovered_at, origin
      ) VALUES ${values.join(", ")}
      ON CONFLICT (url) DO NOTHING
      RETURNING url`,
      params,
    );
    inserted.push(...created.map((row) => row.url));
  }
  return inserted;
}

function columnValue(row: NewApplication, offset: number): unknown {
  const columns = [
    row.id || randomUUID(),
    row.url,
    row.company,
    row.title,
    row.source,
    row.status,
    row.score,
    row.scoreBreakdown ? JSON.stringify(row.scoreBreakdown) : null,
    row.location,
    row.notes,
    row.excerpt,
    JSON.stringify(row.tags),
    row.postedAt,
    row.appliedAt,
    row.discoveredAt,
    row.origin,
  ];
  return columns[offset];
}

export function historyToRow(record: HistoryRecord, origin: Origin): NewApplication {
  return {
    url: record.url,
    company: record.company,
    title: record.title,
    source: record.source,
    status: record.status,
    score: record.score,
    scoreBreakdown: null,
    location: record.location,
    notes: record.notes,
    excerpt: null,
    tags: [],
    postedAt: null,
    appliedAt: record.appliedAt,
    discoveredAt: null,
    origin,
    id: randomUUID(),
  };
}

export type Patch = {
  status?: Status;
  notes?: string | null;
  score?: number | null;
  location?: string | null;
  company?: string;
  title?: string;
  source?: string;
  appliedAt?: string | null;
  excerpt?: string | null;
  tags?: string[];
};

export async function patchApplication(
  db: Queryable,
  id: string,
  patch: Patch,
): Promise<Application | null> {
  const sets: string[] = ["updated_at = NOW()"];
  const params: unknown[] = [];
  const add = (column: string, value: unknown) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };
  if (patch.status) {
    add("status", patch.status);
    if (isTrackerStatus(patch.status)) {
      sets.push(`applied_at = COALESCE(applied_at, NOW())`);
    }
  }
  if (patch.notes !== undefined) add("notes", patch.notes);
  if (patch.score !== undefined) add("score", patch.score);
  if (patch.location !== undefined) add("location", patch.location);
  if (patch.company !== undefined) add("company", patch.company);
  if (patch.title !== undefined) add("title", patch.title);
  if (patch.source !== undefined) add("source", patch.source);
  if (patch.appliedAt !== undefined) add("applied_at", patch.appliedAt);
  if (patch.excerpt !== undefined) add("excerpt", patch.excerpt);
  if (patch.tags !== undefined) add("tags", JSON.stringify(patch.tags));
  params.push(id);
  const rows = await db.query<DbRow>(
    `UPDATE applications SET ${sets.join(", ")} WHERE id = $${params.length}
     RETURNING id, url, company, title, source, status, score, score_breakdown, location, notes,
               excerpt, tags, posted_at, applied_at, discovered_at, origin, updated_at`,
    params,
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function bulkStatus(db: Queryable, ids: string[], status: Status): Promise<number> {
  if (ids.length === 0) return 0;
  const params: unknown[] = [status];
  const placeholders = ids.map((id) => {
    params.push(id);
    return `$${params.length}`;
  });
  const appliedStamp = isTrackerStatus(status) ? ", applied_at = COALESCE(applied_at, NOW())" : "";
  const rows = await db.query<{ id: string }>(
    `UPDATE applications
     SET status = $1, updated_at = NOW()${appliedStamp}
     WHERE id IN (${placeholders.join(", ")})
     RETURNING id`,
    params,
  );
  return rows.length;
}

export async function upsertByUrl(
  db: Queryable,
  row: NewApplication,
  fields: {
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
  },
): Promise<{ application: Application; created: boolean }> {
  const existing = await findByUrl(db, row.url);
  if (!existing) {
    await insertIgnore(db, [{ ...row, id: randomUUID() }]);
    const created = await findByUrl(db, row.url);
    if (!created) throw new Error("Insert did not return the new application.");
    return { application: created, created: true };
  }
  const patch: Patch = {};
  if (fields.company) patch.company = row.company;
  if (fields.title) patch.title = row.title;
  if (fields.source) patch.source = row.source;
  if (fields.status) patch.status = row.status;
  if (fields.score) patch.score = row.score;
  if (fields.location) patch.location = row.location;
  if (fields.notes) patch.notes = row.notes;
  if (fields.appliedAt) patch.appliedAt = row.appliedAt;
  if (fields.excerpt) patch.excerpt = row.excerpt;
  if (fields.tags) patch.tags = row.tags;
  const updated = await patchApplication(db, existing.id, patch);
  if (!updated) throw new Error("Update did not return the application.");
  return { application: updated, created: false };
}

export async function listQueued(db: Queryable): Promise<Application[]> {
  const rows = await db.query<DbRow>(
    `SELECT id, url, company, title, source, status, score, score_breakdown, location, notes,
            excerpt, tags, posted_at, applied_at, discovered_at, origin, updated_at
     FROM applications
     WHERE status = 'queued'
     ORDER BY score DESC NULLS LAST, posted_at DESC NULLS LAST`,
  );
  return rows.map(mapRow);
}

type RulesRow = {
  auto_queue: boolean | string | number;
  min_score: number | string;
  exclude_senior: boolean | string | number;
  eligible_only: boolean | string | number;
  keywords: string;
  posted_within_days: number | string;
};

export async function getRules(db: Queryable): Promise<QueueRules> {
  const rows = await db.query<RulesRow>(
    `SELECT auto_queue, min_score, exclude_senior, eligible_only, keywords, posted_within_days
     FROM queue_rules WHERE id = 'default'`,
  );
  const row = rows[0];
  if (!row) return { ...DEFAULT_RULES };
  return {
    autoQueue: asBool(row.auto_queue),
    minScore: numberOr(row.min_score, DEFAULT_RULES.minScore),
    excludeSenior: asBool(row.exclude_senior),
    eligibleOnly: asBool(row.eligible_only),
    keywords: row.keywords
      .split(",")
      .map((keyword) => keyword.trim())
      .filter(Boolean),
    postedWithinDays: numberOr(row.posted_within_days, DEFAULT_RULES.postedWithinDays),
  };
}

export async function saveRules(db: Queryable, rules: QueueRules): Promise<QueueRules> {
  await db.query(
    `INSERT INTO queue_rules (
      id, auto_queue, min_score, exclude_senior, eligible_only, keywords, posted_within_days, updated_at
    ) VALUES ('default', $1, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT (id) DO UPDATE SET
      auto_queue = EXCLUDED.auto_queue,
      min_score = EXCLUDED.min_score,
      exclude_senior = EXCLUDED.exclude_senior,
      eligible_only = EXCLUDED.eligible_only,
      keywords = EXCLUDED.keywords,
      posted_within_days = EXCLUDED.posted_within_days,
      updated_at = NOW()`,
    [
      rules.autoQueue,
      rules.minScore,
      rules.excludeSenior,
      rules.eligibleOnly,
      rules.keywords.join(","),
      rules.postedWithinDays,
    ],
  );
  return getRules(db);
}

export async function promoteMatchingDiscovered(db: Queryable, rules: QueueRules): Promise<number> {
  if (!rules.autoQueue) return 0;
  const { shouldAutoQueue } = await import("@/lib/filters");
  const applications = await listApplications(db);
  const ids = applications
    .filter((application) => {
      if (application.status !== "discovered") return false;
      if (application.score === null || !application.scoreBreakdown) return false;
      if (!withinPostedDays(application, rules.postedWithinDays)) return false;
      const haystack = [
        application.title,
        application.company,
        application.tags.join(" "),
        application.excerpt ?? "",
        application.location ?? "",
      ].join("\n");
      return shouldAutoQueue(rules, {
        total: application.score,
        eligible: application.scoreBreakdown.eligible,
        seniorityFlag: application.scoreBreakdown.seniorityFlag,
        haystack,
      });
    })
    .map((application) => application.id);
  if (ids.length === 0) return 0;
  return bulkStatus(db, ids, "queued");
}

function withinPostedDays(application: Application, days: number, now: Date = new Date()): boolean {
  if (days <= 0) return true;
  const stamp = application.postedAt ?? application.discoveredAt;
  if (!stamp) return true;
  return now.getTime() - new Date(stamp).getTime() <= days * 86_400_000;
}

function mapRow(row: DbRow): Application {
  return {
    id: row.id,
    url: row.url,
    company: row.company,
    title: row.title,
    source: row.source,
    status: row.status as Status,
    score: asScore(row.score),
    scoreBreakdown: parseBreakdown(row.score_breakdown),
    location: row.location,
    notes: row.notes,
    excerpt: row.excerpt,
    tags: parseTags(row.tags),
    postedAt: asIso(row.posted_at),
    appliedAt: asIso(row.applied_at),
    discoveredAt: asIso(row.discovered_at),
    origin: row.origin as Origin,
    updatedAt: asIso(row.updated_at) ?? new Date(0).toISOString(),
  };
}

function parseBreakdown(value: string | null): ScoreBreakdown | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as ScoreBreakdown;
    if (!parsed || typeof parsed.total !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string") : [];
  } catch {
    return [];
  }
}

function asScore(value: number | string | null): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function asIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function numberOr(value: number | string, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function asBool(value: boolean | string | number): boolean {
  return value === true || value === 1 || value === "t" || value === "true" || value === "1";
}
