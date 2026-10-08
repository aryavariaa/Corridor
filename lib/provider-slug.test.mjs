// node --test lib/provider-slug.test.mjs   (Node 22.18+/24 strips the .ts types)
import test from "node:test";
import assert from "node:assert/strict";
import { pairSlug, parsePairSlug, providerFromSlug, providerSlug } from "./provider-slug.ts";

const NAMES = ["Wise", "PayPal", "Western Union", "XE", "Revolut"];

test("slugs are lowercase, hyphenated and stable", () => {
  assert.equal(providerSlug("Western Union"), "western-union");
  assert.equal(providerSlug("PayPal"), "paypal");
  assert.equal(providerSlug("  Xe  Money & Co. "), "xe-money-and-co");
});

test("a slug maps back to exactly the provider it came from", () => {
  for (const n of NAMES) assert.equal(providerFromSlug(providerSlug(n), NAMES), n);
  assert.equal(providerFromSlug("nobody", NAMES), null);
});

test("a pair has one canonical URL whichever order you pick them in", () => {
  assert.equal(pairSlug("Wise", "PayPal"), "paypal-vs-wise");
  assert.equal(pairSlug("PayPal", "Wise"), "paypal-vs-wise");
  assert.equal(pairSlug("Western Union", "Wise"), "western-union-vs-wise");
  assert.equal(pairSlug("Wise", "Wise"), null);
});

test("parsePairSlug round-trips every canonical pair, including multi-word names", () => {
  for (const a of NAMES) {
    for (const b of NAMES) {
      const slug = pairSlug(a, b);
      if (a === b) { assert.equal(slug, null); continue; }
      const parsed = parsePairSlug(slug);
      assert.ok(parsed, slug);
      assert.deepEqual([providerFromSlug(parsed[0], NAMES), providerFromSlug(parsed[1], NAMES)].sort(), [a, b].sort());
    }
  }
});

test("parsePairSlug refuses malformed input", () => {
  for (const bad of ["wise", "wise-vs-", "-vs-wise", "wise-vs-wise", "a-vs-b-vs-c", ""]) {
    assert.equal(parsePairSlug(bad), null, bad);
  }
});
