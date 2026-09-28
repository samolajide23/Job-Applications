import assert from "node:assert/strict";
import test from "node:test";
import { idleSourceStatuses, statusesFromDiscover } from "./sources";

test("maps discover results into colored source health", () => {
  const statuses = statusesFromDiscover([
    { source: "HiringCafe", fetched: 0, error: "Cloudflare", ms: 50 },
    { source: "Greenhouse", fetched: 120, error: null, ms: 4000 },
    { source: "Ashby", fetched: 80, error: null, ms: 2500 },
    { source: "Lever", fetched: 40, error: null, ms: 900 },
    { source: "Jobicy", fetched: 40, error: null, ms: 200 },
    { source: "Remotive", fetched: 0, error: null, ms: 40 },
    { source: "RemoteOK", fetched: 99, error: null, ms: 300 },
  ]);
  assert.equal(statuses.find((item) => item.id === "HiringCafe")?.health, "down");
  assert.equal(statuses.find((item) => item.id === "Greenhouse")?.health, "ok");
  assert.equal(statuses.find((item) => item.id === "Ashby")?.health, "ok");
  assert.equal(statuses.find((item) => item.id === "Lever")?.health, "ok");
  assert.equal(statuses.find((item) => item.id === "Remotive")?.health, "empty");
  assert.equal(idleSourceStatuses()[0]?.health, "idle");
});
