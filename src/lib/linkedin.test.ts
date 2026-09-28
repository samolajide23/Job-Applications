import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeUrl } from "./csv";
import { linkedInJobUrl, parseLinkedInSearchHtml } from "./linkedin";

const SAMPLE_CARD = `
<li>
  <div class="base-card base-search-card job-search-card" data-entity-urn="urn:li:jobPosting:4445314635">
    <a class="base-card__full-link" href="https://ie.linkedin.com/jobs/view/software-engineer-iii-python-at-jpmorganchase-4445314635?position=1&amp;pageNum=0&amp;refId=abc&amp;trackingId=xyz">
      <span class="sr-only">Software Engineer III - Python</span>
    </a>
    <div class="base-search-card__info">
      <h3 class="base-search-card__title">Software Engineer III - Python</h3>
      <h4 class="base-search-card__subtitle">
        <a href="https://www.linkedin.com/company/jpmorganchase">JPMorganChase</a>
      </h4>
      <div class="base-search-card__metadata">
        <span class="job-search-card__location">Dublin, County Dublin, Ireland</span>
        <time class="job-search-card__listdate" datetime="2026-09-27">1 day ago</time>
      </div>
    </div>
  </div>
</li>
`;

describe("parseLinkedInSearchHtml", () => {
  it("maps public guest job cards", () => {
    const jobs = parseLinkedInSearchHtml(SAMPLE_CARD);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0]?.source, "LinkedIn");
    assert.equal(jobs[0]?.company, "JPMorganChase");
    assert.equal(jobs[0]?.title, "Software Engineer III - Python");
    assert.equal(jobs[0]?.url, linkedInJobUrl("4445314635"));
    assert.match(jobs[0]?.location ?? "", /Dublin/);
    assert.equal(jobs[0]?.postedAt, "2026-09-27T12:00:00.000Z");
  });

  it("rejects auth walls", () => {
    assert.throws(() => parseLinkedInSearchHtml("<html>authwall checkpoint</html>"), /auth wall/i);
  });
});

describe("normalizeUrl LinkedIn", () => {
  it("canonicalizes regional hosts and tracking params", () => {
    const url = normalizeUrl(
      "https://ie.linkedin.com/jobs/view/software-engineer-iii-python-at-jpmorganchase-4445314635?position=1&refId=abc&trackingId=xyz",
    );
    assert.equal(url, "https://www.linkedin.com/jobs/view/4445314635");
  });
});
