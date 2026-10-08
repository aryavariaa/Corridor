// node --test lib/row-breakdown.test.mjs   (Node 22.18+/24 strips the .ts types)
import test from "node:test";
import assert from "node:assert/strict";
import { consistentBreakdown, formatDelivery } from "./row-breakdown.ts";

// A real Wise row: US->IN $500, fee 9.16, rate 96.8065 -> (500-9.16)*96.8065 = 47,516.5
const wise = { sendAmount: 500, amountReceived: 47516.5, fee: 9.16, rate: 96.8065, deliveryMinMinutes: 669, deliveryMaxMinutes: 669 };

test("a row whose fee and rate reproduce its amount shows them", () => {
  assert.deepEqual(consistentBreakdown(wise), { fee: 9.16, rate: 96.8065, deliveryMinMinutes: 669, deliveryMaxMinutes: 669 });
});

test("Western Union style (fee 0, margin inside the rate) is consistent", () => {
  const wu = { sendAmount: 500, amountReceived: 48095.78, fee: 0, rate: 96.191551403 };
  assert.deepEqual(consistentBreakdown(wu), { fee: 0, rate: 96.191551403 });
});

test("a stale fee or rate beside a fresh amount is dropped, never shown", () => {
  // amount refreshed to a 2% better rate but fee/rate are last week's
  const stale = { ...wise, amountReceived: 47516.5 * 1.02 };
  const out = consistentBreakdown(stale);
  assert.equal(out.fee, undefined);
  assert.equal(out.rate, undefined);
  assert.equal(out.deliveryMinMinutes, 669, "delivery has no amount to contradict, so it stays");
});

test("fee without rate (or vice versa) is not enough to show either", () => {
  assert.deepEqual(consistentBreakdown({ sendAmount: 500, amountReceived: 47516.5, fee: 9.16 }), {});
  assert.deepEqual(consistentBreakdown({ sendAmount: 500, amountReceived: 47516.5, rate: 96.8065 }), {});
});

test("the 1% tolerance boundary", () => {
  const base = { sendAmount: 100, fee: 0, rate: 10, amountReceived: 1000 };
  assert.ok(consistentBreakdown({ ...base, amountReceived: 1009 }).rate !== undefined, "0.9% off still passes");
  assert.equal(consistentBreakdown({ ...base, amountReceived: 1011 }).rate, undefined, "1.1% off fails");
});

test("nonsense values are refused", () => {
  const base = { sendAmount: 100, amountReceived: 1000 };
  assert.deepEqual(consistentBreakdown({ ...base, fee: -1, rate: 10 }), {});
  assert.deepEqual(consistentBreakdown({ ...base, fee: 0, rate: 0 }), {});
  assert.deepEqual(consistentBreakdown({ ...base, fee: 100, rate: 10 }), {}, "fee >= the whole amount");
  assert.deepEqual(consistentBreakdown({ ...base, deliveryMinMinutes: 10, deliveryMaxMinutes: 5 }), {}, "max < min");
  assert.deepEqual(consistentBreakdown({ ...base, fee: NaN, rate: 10 }), {});
});

test("formatDelivery gives a plain range, no false precision", () => {
  assert.equal(formatDelivery(5, 30), "Under an hour");
  assert.equal(formatDelivery(669, 669), "About 11 hours");
  assert.equal(formatDelivery(60, 60), "About 1 hour");
  assert.equal(formatDelivery(120, 360), "2-6 hours");
  assert.equal(formatDelivery(1440, 2880), "24 hours to 2 days");
  assert.equal(formatDelivery(2880, 4320), "2-3 days");
});

test("the TS duration parser agrees with the one the Lambda ships (scripts/lib/refresh-core.mjs)", async () => {
  const { parseIsoDurationMinutes: shipped } = await import("../scripts/lib/refresh-core.mjs");
  const { parseIsoDurationMinutes: ours } = await import("./row-breakdown.ts");
  for (const x of ["PT11H9M3.810098236S", "PT30M", "P1D", "P1DT2H", "PT0S", "P2D", "PT", "P", "bad", "", null, undefined, 42, "pt5m", "PT5M ", "P1.5D"]) {
    assert.equal(ours(x), shipped(x), `disagree on ${JSON.stringify(x)}`);
  }
});
