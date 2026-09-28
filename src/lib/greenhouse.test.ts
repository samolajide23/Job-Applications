import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prepareDiscovery } from "./discover";
import { looksObviouslyUsOnly, mapGreenhouseJob } from "./greenhouse";
import { DEFAULT_RULES } from "./types";

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

  it("keeps US-labelled roles when the copy allows Europe or worldwide remote", () => {
    assert.equal(looksObviouslyUsOnly("Remote, United States", "Remote worldwide. Open to Europe."), false);
    assert.equal(looksObviouslyUsOnly("United States", "Onsite in NYC only."), true);
  });

  it("does not age-cut open Greenhouse board roles", () => {
    const prepared = prepareDiscovery(
      [
        {
          url: "https://job-boards.greenhouse.io/gitlab/jobs/99",
          company: "GitLab",
          title: "Software Engineer",
          source: "Greenhouse",
          location: "Remote, Europe",
          description: "Python TypeScript React Node LLM. Remote in the EU.",
          tags: ["python"],
          postedAt: "2026-08-01T00:00:00.000Z",
          salaryText: null,
          level: "Intermediate",
        },
      ],
      { ...DEFAULT_RULES, autoQueue: true },
      new Date("2026-09-28T12:00:00.000Z"),
    );
    assert.equal(prepared.tooOld, 0);
    assert.equal(prepared.accepted.length, 1);
  });
});
