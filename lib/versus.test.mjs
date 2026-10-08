// node --test lib/versus.test.mjs   (Node 22.18+/24 strips the .ts types)
import test from "node:test";
import assert from "node:assert/strict";
import { allPairs, POPULAR_CORRIDORS, TIE_THRESHOLD, verdict } from "./versus.ts";

const row = (provider, amountReceived, costPercent = 0.01) => ({ provider, sendAmount: 500, amountReceived, costPercent });

test("the provider whose recipient gets more wins, by the exact difference", () => {
  const v = verdict(row("Wise", 47476.5), row("Western Union", 48074.51));
  assert.equal(v.kind, "winner");
  assert.equal(v.winner, "Western Union");
  assert.equal(v.loser, "Wise");
  assert.ok(Math.abs(v.diff - 598.01) < 1e-9);
  assert.ok(Math.abs(v.diffPercent - (598.01 / 47476.5) * 100) < 1e-9);
});

test("argument order never changes the answer", () => {
  const a = row("A", 1000);
  const b = row("B", 1100);
  assert.deepEqual(verdict(a, b), verdict(b, a));
});

test("within 0.1% is a tie, just past it is a winner", () => {
  const base = 10000;
  assert.equal(verdict(row("A", base), row("B", base * (1 + TIE_THRESHOLD * 0.9))).kind, "tie");
  assert.equal(verdict(row("A", base), row("B", base * (1 + TIE_THRESHOLD * 1.1))).kind, "winner");
  assert.equal(verdict(row("A", base), row("B", base)).kind, "tie");
});

test("a tie still reports the (tiny) difference, and a zero amount can't divide by zero", () => {
  const t = verdict(row("A", 10000), row("B", 10005));
  assert.equal(t.kind, "tie");
  assert.equal(t.diff, 5);
  assert.equal(verdict(row("A", 0), row("B", 0)).kind, "tie");
  assert.equal(verdict(row("A", 0), row("B", 5)).kind, "tie");
});

test("allPairs lists each unordered pair once, in a stable order", () => {
  assert.deepEqual(allPairs(["Wise", "PayPal", "Western Union"]), [
    ["PayPal", "Western Union"],
    ["PayPal", "Wise"],
    ["Western Union", "Wise"],
  ]);
  assert.deepEqual(allPairs(["A"]), []);
  assert.equal(allPairs(["A", "B", "C", "D"]).length, 6);
});

test("the popular corridor list has no duplicates", () => {
  const keys = POPULAR_CORRIDORS.map(([s, r]) => `${s}-${r}`);
  assert.equal(new Set(keys).size, keys.length);
});
