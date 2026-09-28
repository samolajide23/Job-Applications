import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapAshbyJob } from "./ashby";
import { prepareDiscovery } from "./discover";
import { DEFAULT_RULES } from "./types";

describe("mapAshbyJob", () => {
  it("maps a public Ashby posting with EU remote locations", () => {
    const job = mapAshbyJob(
      {
        id: "abc",
        title: "Fullstack Engineer",
        department: "Engineering",
        team: "Product",
        location: "Remote - European Union",
        isListed: true,
        isRemote: true,
        workplaceType: "Remote",
        secondaryLocations: [{ location: "Ireland", address: { postalAddress: { addressCountry: "Ireland" } } }],
        publishedAt: "2026-09-01T12:00:00.000Z",
        jobUrl: "https://jobs.ashbyhq.com/ashby/abc",
        descriptionPlain: "Python TypeScript React Node. Remote in the EU including Ireland.",
        compensation: { summary: "€70,000 - €90,000" },
      },
      "ashby",
    );
    assert.ok(job);
    assert.equal(job?.source, "Ashby");
    assert.equal(job?.company, "Ashby");
    assert.match(job?.location ?? "", /Ireland|European Union|Remote/i);
    assert.match(job?.description ?? "", /Python/);
    assert.equal(job?.salaryText, "€70,000 - €90,000");
  });

  it("skips unlisted postings", () => {
    const job = mapAshbyJob(
      {
        title: "Software Engineer",
        isListed: false,
        jobUrl: "https://jobs.ashbyhq.com/linear/1",
      },
      "linear",
    );
    assert.equal(job, null);
  });

  it("does not age-cut open Ashby board roles", () => {
    const prepared = prepareDiscovery(
      [
        {
          url: "https://jobs.ashbyhq.com/linear/old",
          company: "Linear",
          title: "Software Engineer",
          source: "Ashby",
          location: "Europe",
          description: "TypeScript React Node Python. Remote Europe.",
          tags: ["typescript"],
          postedAt: "2021-04-27T00:00:00.000Z",
          salaryText: null,
          level: null,
        },
      ],
      { ...DEFAULT_RULES, autoQueue: true },
      new Date("2026-09-28T12:00:00.000Z"),
    );
    assert.equal(prepared.tooOld, 0);
    assert.equal(prepared.accepted.length, 1);
  });
});
