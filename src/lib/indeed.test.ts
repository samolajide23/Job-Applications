import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeUrl } from "./csv";
import { normalizeIndeedUrl, parseIndeedRss } from "./indeed";

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Python jobs</title>
    <item>
      <title><![CDATA[Software Engineer III - Python - JPMorganChase]]></title>
      <link>https://ie.indeed.com/rc/clk?jk=abc123def&amp;from=rss</link>
      <guid>http://www.indeed.com/viewjob?jk=abc123def</guid>
      <description><![CDATA[<b>Dublin</b> — Python, TypeScript]]></description>
      <pubDate>Sun, 27 Sep 2026 12:00:00 GMT</pubDate>
      <source url="https://ie.indeed.com">JPMorganChase</source>
    </item>
  </channel>
</rss>`;

describe("parseIndeedRss", () => {
  it("maps RSS items into discovered jobs", () => {
    const jobs = parseIndeedRss(SAMPLE_RSS);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0]?.source, "Indeed");
    assert.equal(jobs[0]?.company, "JPMorganChase");
    assert.equal(jobs[0]?.title, "Software Engineer III - Python");
    assert.equal(jobs[0]?.url, "https://ie.indeed.com/viewjob?jk=abc123def");
    assert.equal(jobs[0]?.postedAt, "2026-09-27T12:00:00.000Z");
  });

  it("rejects captcha HTML", () => {
    assert.throws(() => parseIndeedRss("<html>captcha challenge</html>"), /blocked|captcha/i);
  });
});

describe("normalizeIndeedUrl", () => {
  it("keeps the jk id and drops tracking params", () => {
    assert.equal(
      normalizeIndeedUrl("https://ie.indeed.com/viewjob?jk=abc123&utm_source=rss&from=rss"),
      "https://ie.indeed.com/viewjob?jk=abc123",
    );
    assert.equal(
      normalizeUrl("https://www.indeed.com/viewjob?jk=xyz&utm_source=x"),
      "https://www.indeed.com/viewjob?jk=xyz",
    );
  });
});
