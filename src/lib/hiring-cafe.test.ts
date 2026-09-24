import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapHiringCafeJob } from "./hiring-cafe";

describe("mapHiringCafeJob", () => {
  it("maps nested job_information and apply_url", () => {
    const job = mapHiringCafeJob({
      id: "ashby___acme___abc",
      board_token: "acme",
      source: "ashby",
      apply_url: "https://jobs.ashbyhq.com/acme/abc",
      job_information: {
        title: "Python Backend Engineer",
        description: "Build LLM tools with Python and React.",
      },
      workplace_type: "Remote",
      workplaceCountries: ["IE", "EU"],
      seniority_level: "Mid Level",
      technical_tools: ["Python", "LLM"],
      posted_at: "2026-09-20T12:00:00.000Z",
      salary_min: 45000,
      salary_max: 60000,
      salary_currency: "EUR",
    });
    assert.ok(job);
    assert.equal(job?.title, "Python Backend Engineer");
    assert.equal(job?.company, "Acme");
    assert.equal(job?.source, "HiringCafe");
    assert.equal(job?.url, "https://jobs.ashbyhq.com/acme/abc");
    assert.match(job?.location ?? "", /Remote/);
    assert.equal(job?.salaryText, "EUR 45000-60000");
    assert.ok(job?.tags.includes("Python"));
  });

  it("prefers company_name when present", () => {
    const job = mapHiringCafeJob({
      company_name: "Ceriga Labs",
      apply_url: "https://boards.greenhouse.io/ceriga/jobs/1",
      title: "Full-stack Engineer",
      description: "TypeScript and AI tooling.",
    });
    assert.equal(job?.company, "Ceriga Labs");
    assert.equal(job?.title, "Full-stack Engineer");
  });

  it("returns null when title or url is missing", () => {
    assert.equal(mapHiringCafeJob({ company_name: "Acme" }), null);
  });
});
