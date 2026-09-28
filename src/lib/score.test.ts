import assert from "node:assert/strict";
import test from "node:test";
import { prepareDiscovery } from "./discover";
import { scoreJob } from "./score";
import { DEFAULT_RULES } from "./types";

test("scores a junior Ireland Python role at or above 60 without inventing missing parts", () => {
  const score = scoreJob({
    title: "Software Engineer",
    company: "Acme",
    location: "Remote Ireland",
    description: "Python, TypeScript, React, Node, LLM, RAG, APIs, and automation. Salary €50,000-€60,000.",
    tags: ["python"],
    url: "https://jobs.ashbyhq.com/acme/123/application",
  });
  assert.equal(score.eligible, "eligible");
  assert.equal(score.seniorityFlag, "junior_mid");
  assert.ok(score.total >= 60);
  assert.equal(
    score.total,
    score.location +
      score.skills +
      score.seniority +
      score.aiPython +
      score.projects +
      score.salary +
      score.company +
      score.practicality,
  );
});

test("does not give a high score when the listing has no stack evidence", () => {
  const score = scoreJob({
    title: "Software Engineer",
    company: "Acme",
    location: "Anywhere",
    description: "",
    tags: [],
    url: "https://jobicy.com/jobs/1",
  });
  assert.ok(score.total < 60);
  assert.equal(score.skills, 0);
  assert.equal(score.aiPython, 0);
  assert.equal(score.salary, 0);
});

test("treats plain Remote listings as eligible unless geo is blocked", () => {
  const remote = scoreJob({
    title: "Backend Engineer",
    company: "Acme",
    location: "Remote",
    description: "Python TypeScript APIs.",
    tags: ["python"],
    url: "https://example.com/remote",
  });
  assert.equal(remote.eligible, "eligible");
  assert.ok(remote.location >= 14);

  const indiaRemote = scoreJob({
    title: "Backend Engineer",
    company: "Acme",
    location: "Remote, India",
    description: "Python.",
    tags: [],
    url: "https://example.com/india",
  });
  assert.equal(indiaRemote.eligible, "unknown");
});

test("marks US-only and Ceriga as ineligible and senior titles to skip", () => {
  const us = scoreJob({
    title: "Backend Engineer",
    company: "Acme",
    location: "United States",
    description: "Python remote role.",
    tags: [],
    url: "https://example.com/us",
  });
  assert.equal(us.eligible, "ineligible");
  const ceriga = scoreJob({
    title: "Software Engineer",
    company: "Ceriga",
    location: "Remote Ireland",
    description: "Python",
    tags: [],
    url: "https://example.com/ceriga",
  });
  assert.equal(ceriga.eligible, "ineligible");
  const senior = scoreJob({
    title: "Senior Backend Engineer",
    company: "Acme",
    location: "Europe",
    description: "Python",
    tags: [],
    url: "https://example.com/senior",
    level: "Any",
  });
  assert.equal(senior.seniorityFlag, "senior_skip");
});

test("auto-filters to applicable roles and auto-queues strong matches", () => {
  const prepared = prepareDiscovery(
    [
      {
        url: "https://jobs.ashbyhq.com/acme/123/application",
        company: "Acme",
        title: "Software Engineer",
        source: "Jobicy",
        location: "Remote Ireland",
        description: "Python TypeScript React Node LLM RAG APIs automation. €50,000-€60,000",
        tags: ["python"],
        postedAt: "2026-09-23T00:00:00.000Z",
        salaryText: null,
        level: "Junior",
      },
      {
        url: "https://example.com/us-only",
        company: "Acme",
        title: "Backend Engineer",
        source: "Remotive",
        location: "USA",
        description: "Python",
        tags: [],
        postedAt: "2026-09-23T00:00:00.000Z",
        salaryText: null,
        level: null,
      },
      {
        url: "https://example.com/senior",
        company: "Acme",
        title: "Senior Backend Engineer",
        source: "Jobicy",
        location: "Europe",
        description: "Python TypeScript",
        tags: ["python"],
        postedAt: "2026-09-23T00:00:00.000Z",
        salaryText: null,
        level: "Senior",
      },
      {
        url: "https://example.com/sales",
        company: "Acme",
        title: "Account Executive",
        source: "RemoteOK",
        location: "Remote",
        description: "Sell software",
        tags: [],
        postedAt: "2026-09-23T00:00:00.000Z",
        salaryText: null,
        level: null,
      },
    ],
    { ...DEFAULT_RULES, autoQueue: true },
    new Date("2026-09-24T12:00:00.000Z"),
  );
  assert.equal(prepared.pulled, 4);
  assert.equal(prepared.ineligible, 1);
  assert.equal(prepared.senior, 1);
  assert.equal(prepared.notSoftware, 1);
  assert.equal(prepared.accepted.length, 1);
  assert.equal(prepared.accepted[0]?.status, "queued");
});
