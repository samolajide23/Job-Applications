import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prepareDiscovery } from "./discover";
import { mapLeverJob } from "./lever";
import { normalizeUrl } from "./csv";
import { DEFAULT_RULES } from "./types";

describe("mapLeverJob", () => {
  it("maps a Lever posting with EU location metadata", () => {
    const job = mapLeverJob(
      {
        id: "abc",
        text: "Backend Engineer",
        categories: {
          department: "Engineering",
          team: "Platform",
          location: "London",
          commitment: "Permanent",
          allLocations: ["London", "Dublin"],
        },
        country: "GB",
        workplaceType: "remote",
        createdAt: 1_725_000_000_000,
        descriptionPlain: "Python TypeScript Node. Remote from Ireland or the UK.",
        hostedUrl: "https://jobs.lever.co/metabase/abc",
        applyUrl: "https://jobs.lever.co/metabase/abc/apply",
      },
      "metabase",
    );
    assert.ok(job);
    assert.equal(job?.source, "Lever");
    assert.equal(job?.company, "Metabase");
    assert.match(job?.location ?? "", /Dublin|London|remote/i);
    assert.match(job?.description ?? "", /Python/);
    assert.equal(normalizeUrl(job?.url ?? ""), "https://jobs.lever.co/metabase/abc");
  });

  it("does not age-cut open Lever board roles", () => {
    const prepared = prepareDiscovery(
      [
        {
          url: "https://jobs.lever.co/spotify/old",
          company: "Spotify",
          title: "Software Engineer",
          source: "Lever",
          location: "London · remote · GB",
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
