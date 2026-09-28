import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHistoryCsv } from "@/lib/csv";
import {
  collapseUrlAliases,
  ensureSchema,
  getRules,
  historyToRow,
  insertIgnore,
  listApplications,
  listQueued,
  markSeedLoaded,
  patchApplication,
  promoteMatchingDiscovered,
  saveRules,
  seedLoaded,
  upsertByUrl,
  bulkStatus,
  findByUrl,
  getApplication,
  type NewApplication,
  type Patch,
  type Queryable,
} from "@/lib/repository";
import type { Application, QueueRules } from "@/lib/types";

export class DatabaseConfigError extends Error {}

let pending: Promise<Queryable> | null = null;

export function getDb(): Promise<Queryable> {
  if (!pending) {
    pending = open().catch((error: unknown) => {
      pending = null;
      throw error;
    });
  }
  return pending;
}

async function open(): Promise<Queryable> {
  const db = await connect();
  await ensureSchema(db);
  if (!(await seedLoaded(db))) {
    const csv = readFileSync(join(process.cwd(), "data/seed.csv"), "utf8");
    const { records } = parseHistoryCsv(csv);
    await insertIgnore(db, records.map((record) => historyToRow(record, "seed")));
    await markSeedLoaded(db);
  }
  return db;
}

async function connect(): Promise<Queryable> {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(databaseUrl);
    return {
      async query<T extends Record<string, unknown>>(text: string, params: unknown[] = []) {
        const rows = await sql.query(text, params);
        return rows as T[];
      },
    };
  }
  if (process.env.NODE_ENV === "production") {
    throw new DatabaseConfigError(
      "DATABASE_URL is not set. Connect a Neon Postgres database before using the production dashboard.",
    );
  }
  const { mkdirSync } = await import("node:fs");
  const { PGlite } = await import("@electric-sql/pglite");
  const directory = join(process.cwd(), "data", "pglite");
  mkdirSync(directory, { recursive: true });
  const client = new PGlite(directory);
  return {
    async query<T extends Record<string, unknown>>(text: string, params: unknown[] = []) {
      const result = await client.query<T>(text, params);
      return result.rows;
    },
  };
}

export async function loadDashboard(): Promise<{ applications: Application[]; rules: QueueRules }> {
  const db = await getDb();
  const [applications, rules] = await Promise.all([listApplications(db), getRules(db)]);
  return { applications, rules };
}

export async function loadQueue(): Promise<Application[]> {
  return listQueued(await getDb());
}

export async function updateApplication(id: string, patch: Patch): Promise<Application | null> {
  return patchApplication(await getDb(), id, patch);
}

export async function updateMany(ids: string[], status: Patch["status"]): Promise<number> {
  if (!status) return 0;
  return bulkStatus(await getDb(), ids, status);
}

export async function createOrUpdate(
  row: NewApplication,
  fields: Parameters<typeof upsertByUrl>[2],
): Promise<{ application: Application; created: boolean }> {
  return upsertByUrl(await getDb(), row, fields);
}

export async function insertNew(rows: NewApplication[]): Promise<string[]> {
  return insertIgnore(await getDb(), rows);
}

export async function collapseAliases(): Promise<number> {
  return collapseUrlAliases(await getDb());
}

export async function readRules(): Promise<QueueRules> {
  return getRules(await getDb());
}

export async function writeRules(rules: QueueRules): Promise<QueueRules> {
  const db = await getDb();
  const saved = await saveRules(db, rules);
  await promoteMatchingDiscovered(db, saved);
  return saved;
}

export async function promoteQueueMatches(): Promise<number> {
  const db = await getDb();
  return promoteMatchingDiscovered(db, await getRules(db));
}

export async function applicationById(id: string): Promise<Application | null> {
  return getApplication(await getDb(), id);
}

export async function applicationByUrl(url: string): Promise<Application | null> {
  return findByUrl(await getDb(), url);
}
