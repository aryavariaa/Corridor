// node --experimental-strip-types --test lib/home-example.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { pickExample } from "./home-example.ts";

const r = (provider, amountReceived, underReview) => ({ provider, amountReceived, underReview });

test("best first, the rest in descending order", () => {
  const ex = pickExample([r("Wise", 18595), r("Western Union", 19046), r("PayPal", 18900)]);
  assert.equal(ex.best.provider, "Western Union");
  assert.deepEqual(ex.others.map((o) => o.provider), ["PayPal", "Wise"]);
});

test("an under-review row is never the best nor a comparison", () => {
  const ex = pickExample([r("Wise", 18595), r("Western Union", 19046), r("PayPal", 19500, true)]);
  assert.equal(ex.best.provider, "Western Union");
  assert.deepEqual(ex.others.map((o) => o.provider), ["Wise"]);
});

test("needs two eligible rows", () => {
  assert.equal(pickExample([r("Wise", 100)]), null);
  assert.equal(pickExample([r("Wise", 100), r("PayPal", 120, true)]), null);
  assert.equal(pickExample([]), null);
});

test("a tie at the top gives no example rather than a false win", () => {
  assert.equal(pickExample([r("Wise", 100), r("Western Union", 100)]), null);
});

test("ignores non-positive or non-finite amounts", () => {
  assert.equal(pickExample([r("Wise", 100), r("X", NaN), r("Y", 0)]), null);
});
