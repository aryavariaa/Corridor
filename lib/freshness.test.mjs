import assert from "node:assert/strict";
import test from "node:test";
import { freshnessLevelFor } from "./freshness.ts";

const NOW = Date.UTC(2026, 9, 11);

test("freshness stays fresh through the 7-day cutoff", () => {
  assert.equal(freshnessLevelFor("2026-10-04", NOW), "fresh");
});

test("freshness becomes aging after 7 days and stays aging through 30", () => {
  assert.equal(freshnessLevelFor("2026-10-03", NOW), "aging");
  assert.equal(freshnessLevelFor("2026-09-11", NOW), "aging");
});

test("freshness becomes stale after 30 days", () => {
  assert.equal(freshnessLevelFor("2026-09-10", NOW), "stale");
});
