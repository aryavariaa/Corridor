// node --experimental-strip-types --test lib/geo.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { inProse, withArticle } from "./geo.ts";

test("inProse adds 'the' to the names that take it, and only those", () => {
  for (const n of ["United States", "United Kingdom", "Eurozone", "Netherlands", "Philippines"]) {
    assert.equal(inProse(n), `the ${n}`);
  }
  for (const n of ["India", "Germany", "Mexico", "Australia", "South Africa"]) assert.equal(inProse(n), n);
});

test("withArticle still only covers the Eurozone", () => {
  assert.equal(withArticle("Eurozone"), "the Eurozone");
  assert.equal(withArticle("United States"), "United States");
});

test("every name in the data that needs 'the' is covered", async () => {
  const { readFileSync } = await import("node:fs");
  const d = JSON.parse(readFileSync(new URL("../data/provider-data.json", import.meta.url), "utf8"));
  const names = new Set(d.corridors.flatMap((c) => [c.sendCountryName, c.receiveCountryName]));
  // Plural or "of"-style names are the ones English puts "the" in front of.
  for (const n of names) {
    if (/^(United |Netherlands|Philippines|Eurozone)/.test(n)) assert.match(inProse(n), /^the /, n);
  }
});
