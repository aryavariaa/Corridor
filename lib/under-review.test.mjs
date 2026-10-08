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
