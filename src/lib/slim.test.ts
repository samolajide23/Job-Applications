import assert from "node:assert/strict";
import test from "node:test";
import { slimApplication } from "./slim";
import type { Application } from "./types";

test("slimApplication drops heavy scoring detail and long excerpts", () => {
  const application: Application = {
    id: "1",
    url: "https://example.com/job",
    company: "Acme",
    title: "Engineer",
    source: "Ashby",
    status: "discovered",
    score: 72,
    scoreBreakdown: {
      location: 10,
      skills: 20,
      seniority: 10,
      aiPython: 10,
      projects: 5,
      salary: 5,
      company: 5,
      practicality: 7,
      total: 72,
      eligible: "eligible",
      seniorityFlag: "open",
      reasons: ["Strong Python match", "Ireland remote", "Extra detail"],
    },
    location: "Ireland",
    notes: null,
    excerpt: "x".repeat(500),
    tags: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"],
    postedAt: "2026-09-20T00:00:00.000Z",
    appliedAt: null,
    discoveredAt: "2026-09-20T00:00:00.000Z",
    origin: "discovery",
    updatedAt: "2026-09-20T00:00:00.000Z",
  };

  const slim = slimApplication(application);
  assert.equal(slim.scoreBreakdown?.total, 72);
  assert.equal(slim.scoreBreakdown?.eligible, "eligible");
  assert.deepEqual(slim.scoreBreakdown?.reasons, ["Strong Python match"]);
  assert.equal(slim.scoreBreakdown?.skills, 0);
  assert.ok((slim.excerpt?.length ?? 0) <= 280);
  assert.equal(slim.tags.length, 8);
  assert.ok(JSON.stringify(slim).length < JSON.stringify(application).length);

  const queued = slimApplication({ ...application, status: "queued", notes: "secret" });
  assert.equal(queued.scoreBreakdown, null);
  assert.equal(queued.excerpt, null);
  assert.equal(queued.notes, null);
  assert.deepEqual(queued.tags, []);
});
