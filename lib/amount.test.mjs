// node --test lib/amount.test.mjs   (Node 22.18+/24 strips the .ts types)
import test from "node:test";
import assert from "node:assert/strict";
import { AMOUNT_MAX, AMOUNT_MIN, amountFromSearch, amountQuery, parseAmount } from "./amount.ts";

test("parses plain, comma and space separated amounts", () => {
  assert.deepEqual(parseAmount("500", "USD"), { ok: true, value: 500 });
  assert.deepEqual(parseAmount("1,500", "USD"), { ok: true, value: 1500 });
  assert.deepEqual(parseAmount(" 2 500 ", "USD"), { ok: true, value: 2500 });
});

test("rounds to a whole unit before range-checking", () => {
  assert.deepEqual(parseAmount("500.4", "USD"), { ok: true, value: 500 });
  assert.deepEqual(parseAmount("99.6", "USD"), { ok: true, value: 100 }, "99.6 rounds up into range");
  assert.equal(parseAmount("99.4", "USD").ok, false, "99.4 rounds down out of range");
});

test("the limits are inclusive, one past is refused", () => {
  assert.equal(parseAmount(String(AMOUNT_MIN), "USD").ok, true);
  assert.equal(parseAmount(String(AMOUNT_MAX), "USD").ok, true);
  assert.equal(parseAmount(String(AMOUNT_MIN - 1), "USD").ok, false);
  assert.equal(parseAmount(String(AMOUNT_MAX + 1), "USD").ok, false);
});

test("empty is not an error; junk, zero and negatives are", () => {
  assert.deepEqual(parseAmount("", "USD"), { ok: false, empty: true, message: null });
  assert.deepEqual(parseAmount("   ", "USD"), { ok: false, empty: true, message: null });
  for (const bad of ["abc", "0", "-5", "NaN", "Infinity", "12abc"]) {
    const r = parseAmount(bad, "USD");
    assert.equal(r.ok, false, bad);
    assert.equal(r.message, "Enter a positive number.", bad);
  }
});

test("the range message names the limits in the sending currency", () => {
  assert.match(parseAmount("50", "GBP").message, /£100 and £10,000/);
  assert.match(parseAmount("50", "USD").message, /\$100 and \$10,000/);
});

test("amountQuery only emits a valid, rounded amount", () => {
  assert.equal(amountQuery(500), "?amount=500");
  assert.equal(amountQuery(500.6), "?amount=501");
  assert.equal(amountQuery(null), "");
  assert.equal(amountQuery(50), "");
  assert.equal(amountQuery(10001), "");
});

test("amountFromSearch reads the param and ignores anything unusable", () => {
  assert.equal(amountFromSearch("?amount=500"), 500);
  assert.equal(amountFromSearch("?x=1&amount=1,250"), 1250);
  assert.equal(amountFromSearch(""), null);
  assert.equal(amountFromSearch("?amount="), null);
  assert.equal(amountFromSearch("?amount=abc"), null);
  assert.equal(amountFromSearch("?amount=99999"), null);
});
