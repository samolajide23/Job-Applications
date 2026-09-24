import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapGreenhouseJob } from "./greenhouse";

describe("mapGreenhouseJob", () => {
  it("maps a public Greenhouse job payload", () => {
    const job = mapGreenhouseJob(
      {
        id: 1,
        title: "Python Backend Engineer",
        company_name: "GitLab",
        absolute_url: "https://job-boards.greenhouse.io/gitlab/jobs/1",
        first_published: "2026-09-20T12:00:00-04:00",
        location: { name: "Remote, Europe" },
        content: "<p>Python, TypeScript, LLM tooling</p>",
        departments: [{ name: "Engineering" }],
      },
      "gitlab",
    );
    assert.ok(job);
    assert.equal(job?.source, "Greenhouse");
    assert.equal(job?.company, "GitLab");
    assert.equal(job?.title, "Python Backend Engineer");
    assert.match(job?.location ?? "", /Europe/);
    assert.match(job?.description ?? "", /Python/);
    assert.ok(job?.tags.includes("Engineering"));
  });

  it("falls back to the board token for company name", () => {
    const job = mapGreenhouseJob(
      {
        title: "Software Engineer",
        absolute_url: "https://boards.greenhouse.io/nearform/jobs/2",
      },
      "nearform",
    );
    assert.equal(job?.company, "Nearform");
  });
});
