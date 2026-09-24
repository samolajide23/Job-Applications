import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  bulkStatus,
  ensureSchema,
  getRules,
  historyToRow,
  insertIgnore,
  listQueued,
  patchApplication,
  saveRules,
  type Queryable,
} from "./repository";

async function memoryDb(): Promise<Queryable> {
  const client = new PGlite();
  const db: Queryable = {
    async query<T extends Record<string, unknown>>(text: string, params: unknown[] = []) {
      const result = await client.query<T>(text, params);
      return result.rows;
    },
  };
  await ensureSchema(db);
  return db;
}

test("seeds once, patches status, and lists the queue", async () => {
  const db = await memoryDb();
  const row = historyToRow(
    {
      url: "https://example.com/role",
      company: "Acme",
      title: "Software Engineer",
      source: "Ashby",
      status: "discovered",
      appliedAt: "2026-09-24T09:00:00.000Z",
      score: 72,
      location: "Europe",
      notes: null,
      hasScore: true,
      hasLocation: true,
      hasNotes: false,
    },
    "discovery",
  );
  row.scoreBreakdown = null;
  const inserted = await insertIgnore(db, [row]);
  assert.deepEqual(inserted, ["https://example.com/role"]);
  const again = await insertIgnore(db, [{ ...row, company: "Other" }]);
  assert.deepEqual(again, []);
  const queued = await bulkStatus(db, [row.id], "queued");
  assert.equal(queued, 1);
  const jobs = await listQueued(db);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0]?.score, 72);
  const applied = await patchApplication(db, row.id, { status: "applied", notes: "Submitted on Ashby" });
  assert.equal(applied?.status, "applied");
  assert.equal(applied?.notes, "Submitted on Ashby");
  assert.ok(applied?.appliedAt);
  assert.equal((await listQueued(db)).length, 0);
  const rules = await saveRules(db, {
    autoQueue: true,
    minScore: 70,
    excludeSenior: true,
    eligibleOnly: true,
    keywords: ["Python"],
    postedWithinDays: 10,
  });
  assert.equal(rules.autoQueue, true);
  assert.equal(rules.minScore, 70);
  assert.deepEqual(rules.keywords, ["Python"]);
  assert.deepEqual(await getRules(db), rules);
});
