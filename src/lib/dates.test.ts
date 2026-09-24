import assert from "node:assert/strict";
import test from "node:test";
import { londonDateKey, zonedLocalToIso } from "./dates";

test("converts a London wall time in September to UTC", () => {
  assert.equal(zonedLocalToIso("2026-09-24T10:00"), "2026-09-24T09:00:00.000Z");
});

test("maps late UTC on the 18th to the 19th in London", () => {
  assert.equal(londonDateKey("2026-09-18T23:30:00.000Z"), "2026-09-19");
});
