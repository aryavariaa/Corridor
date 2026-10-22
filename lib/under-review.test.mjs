// node --test lib/under-review.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findUnderReview } from "./under-review.ts";

const entry = { sendCountry: "US", receiveCountry: "IN", provider: "PayPal", dateChecked: "2026-09-01", reason: "r" };
const row = { sendCountry: "US", receiveCountry: "IN", provider: "PayPal", dateChecked: "2026-09-01" };

test("matches the exact corridor, provider and date", () => {
  assert.equal(findUnderReview([entry], row), entry);
});

test("re-sourcing the row (new date) ends the label", () => {
  assert.equal(findUnderReview([entry], { ...row, dateChecked: "2026-10-09" }), undefined);
});

test("does not leak to other providers or corridors", () => {
  assert.equal(findUnderReview([entry], { ...row, provider: "Wise" }), undefined);
  assert.equal(findUnderReview([entry], { ...row, receiveCountry: "VN" }), undefined);
});

test("data/under-review.json: complete entries that each match a real PayPal row", () => {
  const entries = JSON.parse(readFileSync(new URL("../data/under-review.json", import.meta.url), "utf8"));
  const rows = JSON.parse(readFileSync(new URL("../data/provider-data.json", import.meta.url), "utf8")).providerRates;
  assert.ok(entries.length > 0);
  for (const e of entries) {
    for (const k of ["sendCountry", "receiveCountry", "provider", "dateChecked", "reason"]) assert.ok(e[k], `${k} missing`);
    assert.ok(rows.some((r) => findUnderReview([e], r)), `stale entry ${e.sendCountry}->${e.receiveCountry}`);
  }
});

// ---- Best value never goes to a row under review (lib/best-value.ts) ----
import { bestValue, runnerUpTo } from "./best-value.ts";

const r = (provider, rank, extra = {}) => ({ provider, rank, ...extra });

test("best value is the top-ranked row that is not under review", () => {
  const rows = [r("PayPal", 1, { underReview: true }), r("Western Union", 2), r("Wise", 0, { benchmarkReference: true })];
  assert.equal(bestValue(rows).provider, "Western Union");
});

test("an under-review row keeps its sorted position; only the badge moves", () => {
  const rows = [r("PayPal", 1, { underReview: true }), r("Western Union", 2)];
  assert.equal(rows[0].provider, "PayPal"); // untouched
  assert.equal(bestValue(rows).provider, "Western Union");
  assert.equal(bestValue([r("Western Union", 1), r("PayPal", 2, { underReview: true })]).provider, "Western Union");
});

test("with no rows under review it is simply rank 1", () => {
  assert.equal(bestValue([r("A", 2), r("B", 1), r("C", 3)]).provider, "B");
});

test("if every ranked row is under review there is no badge", () => {
  assert.equal(bestValue([r("A", 1, { underReview: true }), r("B", 2, { underReview: true })]), undefined);
  assert.equal(bestValue([]), undefined);
});

test("the benchmark reference (rank 0) is never the best value", () => {
  assert.equal(bestValue([r("Wise", 0, { benchmarkReference: true })]), undefined);
  assert.equal(bestValue([r("Wise", 0), r("A", 1)]).provider, "A");
});

test("the runner-up is the next row that is also not under review", () => {
  const rows = [r("P", 1, { underReview: true }), r("W", 2), r("X", 3, { underReview: true }), r("Y", 4)];
  const best = bestValue(rows);
  assert.equal(best.provider, "W");
  assert.equal(runnerUpTo(rows, best).provider, "Y");
  assert.equal(runnerUpTo([r("W", 1), r("P", 2, { underReview: true })], r("W", 1)), undefined);
});

test("the real US->IN case: the Sep 1 PayPal row ranks first but WU gets the badge", () => {
  const entries = JSON.parse(readFileSync(new URL("../data/under-review.json", import.meta.url), "utf8"));
  const rows = JSON.parse(readFileSync(new URL("../data/provider-data.json", import.meta.url), "utf8")).providerRates;
  const paypal = rows.find((x) => x.sendCountry === "US" && x.receiveCountry === "IN" && x.provider === "PayPal" && x.tier === "Everyday");
  assert.ok(findUnderReview(entries, paypal), "US->IN PayPal row is flagged");
  // PayPal first (it beats mid-market by -0.1%), Western Union second:
  const ranked = [r("PayPal", 1, { underReview: Boolean(findUnderReview(entries, paypal)) }), r("Western Union", 2)];
  assert.equal(bestValue(ranked).provider, "Western Union");
});
