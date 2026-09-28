import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dedupeHistory, normalizeUrl, parseHistoryCsv } from "./csv";

test("normalizes trailing slashes and host case", () => {
  assert.equal(
    normalizeUrl("https://www.LinkedIn.com/jobs/view/4466761686/"),
    "https://www.linkedin.com/jobs/view/4466761686",
  );
});

test("collapses Ashby apply URLs and Greenhouse board hosts", () => {
  assert.equal(
    normalizeUrl("https://jobs.ashbyhq.com/elevenlabs/abc-123/application"),
    "https://jobs.ashbyhq.com/elevenlabs/abc-123",
  );
  assert.equal(
    normalizeUrl("https://job-boards.greenhouse.io/gitlab/jobs/123?utm_source=x"),
    "https://boards.greenhouse.io/gitlab/jobs/123",
  );
  assert.equal(
    normalizeUrl("https://databricks.com/careers/job?gh_jid=99&utm_campaign=x"),
    "https://databricks.com/careers/job?gh_jid=99",
  );
});

test("parses the seed file without dropping quoted titles", () => {
  const csv = readFileSync(new URL("../../data/seed.csv", import.meta.url), "utf8");
  const { records, errors } = parseHistoryCsv(csv);
  assert.deepEqual(errors, []);
  assert.equal(records.length, 312);
  const oliver = records.find((record) => record.company === "Oliver Bernard");
  assert.ok(oliver);
  assert.match(oliver.title, /Senior Backend Engineer/);
  assert.equal(records.filter((record) => record.status === "applied").length, 164);
  assert.equal(records.filter((record) => record.status === "skipped").length, 78);
  assert.equal(records.filter((record) => record.status === "blocked").length, 69);
  assert.equal(records.filter((record) => record.status === "needs_input").length, 1);
});

test("keeps the latest row when urls repeat", () => {
  const [kept] = dedupeHistory([
    {
      url: "https://example.com/job",
      company: "Old",
      title: "Engineer",
      source: "Ashby",
      status: "applied",
      appliedAt: "2026-09-18T00:00:00.000Z",
      score: null,
      location: null,
      notes: null,
      hasScore: false,
      hasLocation: false,
      hasNotes: false,
    },
    {
      url: "https://example.com/job",
      company: "New",
      title: "Engineer",
      source: "Ashby",
      status: "interview",
      appliedAt: "2026-09-20T00:00:00.000Z",
      score: null,
      location: null,
      notes: null,
      hasScore: false,
      hasLocation: false,
      hasNotes: false,
    },
  ]);
  assert.equal(kept.company, "New");
  assert.equal(kept.status, "interview");
});
