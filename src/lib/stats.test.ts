import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseHistoryCsv } from "./csv";
import { computeStats } from "./stats";
import type { Application } from "./types";

test("seed stats match the logged history", () => {
  const csv = readFileSync(new URL("../../data/seed.csv", import.meta.url), "utf8");
  const { records } = parseHistoryCsv(csv);
  const applications: Application[] = records.map((record, index) => ({
    id: String(index),
    url: record.url,
    company: record.company,
    title: record.title,
    source: record.source,
    status: record.status,
    score: null,
    scoreBreakdown: null,
    location: null,
    notes: null,
    excerpt: null,
    tags: [],
    postedAt: null,
    appliedAt: record.appliedAt,
    discoveredAt: null,
    origin: "seed",
    updatedAt: record.appliedAt,
  }));
  const stats = computeStats(applications, new Date("2026-09-24T12:00:00.000Z"));
  assert.equal(stats.total, 312);
  assert.equal(stats.applied, 164);
  assert.equal(stats.skipped, 78);
  assert.equal(stats.blocked, 69);
  assert.equal(stats.needsInput, 1);
  assert.equal(stats.interviews, 0);
  assert.equal(stats.moving, 0);
  assert.equal(stats.offers, 0);
  assert.equal(stats.responseRate, 0);
  assert.equal(stats.submitted, 164);
  assert.equal(stats.bySource.find((source) => source.source === "Ashby")?.count, 180);
  assert.equal(stats.bySource.find((source) => source.source === "Greenhouse")?.count, 78);
  assert.equal(stats.bySource.find((source) => source.source === "LinkedIn")?.count, 49);
  const counts = Object.fromEntries(stats.last30Days.map((day) => [day.date, day.count]));
  assert.equal(counts["2026-09-18"], 76);
  assert.equal(counts["2026-09-19"], 89);
  assert.equal(counts["2026-09-20"], 64);
  assert.equal(counts["2026-09-24"], 83);
  assert.equal(
    stats.last30Days.reduce((sum, day) => sum + day.count, 0),
    312,
  );
});

test("queued candidates stay out of tracker totals", () => {
  const stats = computeStats([
    {
      id: "1",
      url: "https://example.com/q",
      company: "Acme",
      title: "Engineer",
      source: "Jobicy",
      status: "queued",
      score: 70,
      scoreBreakdown: null,
      location: "Europe",
      notes: null,
      excerpt: null,
      tags: [],
      postedAt: "2026-09-24T00:00:00.000Z",
      appliedAt: null,
      discoveredAt: "2026-09-24T00:00:00.000Z",
      origin: "discovery",
      updatedAt: "2026-09-24T00:00:00.000Z",
    },
  ]);
  assert.equal(stats.total, 0);
});
