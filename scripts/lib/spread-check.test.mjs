// node --test scripts/lib/spread-check.test.mjs   (offline; no network)
import test from "node:test";
import assert from "node:assert/strict";
import {
  API_SOURCE_PREFIX,
  auditRows,
  impliedSpread,
  isHandSourcedPayPal,
  midOnOrBefore,
  validateAllowlist,
} from "./spread-check.mjs";

const row = (over = {}) => ({
  sendCountry: "AU", receiveCountry: "DE", provider: "PayPal", tier: "Everyday",
  sendAmount: 300, amountReceived: 183.51, dateChecked: "2026-10-01",
  source: "xoom.com/germany/send-money (PayPal's Xoom) -- 'Best Xoom Rate'", ...over,
});
const corridors = [
  { sendCountry: "AU", receiveCountry: "DE", sendCurrency: "AUD", receiveCurrency: "EUR" },
  { sendCountry: "CA", receiveCountry: "DE", sendCurrency: "CAD", receiveCurrency: "EUR" },
];
const series = (obj) => new Map(Object.entries(obj));

test("impliedSpread: shortfall vs mid, fee already inside amountReceived", () => {
  // 300 AUD -> 183.51 EUR is 0.6117/AUD; mid 0.6138 -> 0.342% below mid
  assert.ok(Math.abs(impliedSpread(row(), 0.6138) - 0.00342) < 0.00001);
  assert.ok(impliedSpread(row({ amountReceived: 300 * 0.6138 }), 0.6138) < 1e-12); // exactly mid -> 0
  assert.ok(impliedSpread(row({ amountReceived: 300 * 0.62 }), 0.6138) < 0); // better than mid -> negative
});

test("only hand-sourced PayPal rows are audited", () => {
  assert.equal(isHandSourcedPayPal(row()), true);
  assert.equal(isHandSourcedPayPal(row({ source: `${API_SOURCE_PREFIX} (sourceCurrency=AUD...)` })), false);
  assert.equal(isHandSourcedPayPal(row({ provider: "Wise" })), false);
  assert.equal(isHandSourcedPayPal(row({ source: "Paypal (Xoom)" })), true); // legacy bare source still counts
});

test("midOnOrBefore: exact day, then earlier within 5 days, never later, else null", () => {
  const s = series({ "2026-09-30": 1, "2026-10-04": 4 });
  assert.deepEqual(midOnOrBefore(s, "2026-09-30"), { date: "2026-09-30", rate: 1 });
  assert.deepEqual(midOnOrBefore(s, "2026-10-02"), { date: "2026-09-30", rate: 1 }); // gap -> earlier day
  assert.deepEqual(midOnOrBefore(s, "2026-10-04"), { date: "2026-10-04", rate: 4 });
  assert.equal(midOnOrBefore(series({ "2026-10-04": 4 }), "2026-10-01"), null); // would need a LATER day
  assert.equal(midOnOrBefore(series({ "2026-09-20": 1 }), "2026-10-01"), null); // too stale
});

test("auditRows flags a thin spread and passes a normal one", () => {
  const rows = [
    row(), // AU->DE: 0.34% -> flagged
    row({ sendCountry: "CA", amountReceived: 181.92 }), // CA->DE: 0.6064/CAD vs mid 0.6247 -> 2.93% -> ok
    row({ sendCountry: "AU", receiveCountry: "DE", provider: "Wise" }), // ignored
  ];
  const mids = { "AUD|EUR": series({ "2026-10-01": 0.6138 }), "CAD|EUR": series({ "2026-10-01": 0.6247 }) };
  const out = auditRows({ rows, corridors, midSeries: (b, q) => mids[`${b}|${q}`] ?? null });
  assert.equal(out.length, 2);
  assert.equal(out.find((r) => r.sendCountry === "AU").status, "flagged");
  assert.equal(out.find((r) => r.sendCountry === "CA").status, "ok");
});

test("threshold boundary: exactly at the minimum passes, just under fails", () => {
  // Binary-exact numbers (3/4 and a 0.25 threshold) so float rounding can't make
  // a ">=" vs ">" mutation pass by accident: 1 - 3/4/1 is exactly 0.25.
  const mids = { "AUD|EUR": series({ "2026-10-01": 1 }) };
  const at = row({ sendAmount: 4, amountReceived: 3 }); // spread exactly 0.25
  const under = row({ sendAmount: 4, amountReceived: 3.01 }); // 0.2475
  const f = (r) => auditRows({ rows: [r], corridors, midSeries: (b, q) => mids[`${b}|${q}`], minSpread: 0.25 })[0].status;
  assert.equal(f(at), "ok");
  assert.equal(f(under), "flagged");
});

test("a missing mid-market rate is 'no-mid', never silently ok", () => {
  const out = auditRows({ rows: [row()], corridors, midSeries: () => null });
  assert.equal(out[0].status, "no-mid");
});

test("allowlist excuses a row only for the exact dateChecked it was verified for", () => {
  const mids = { "AUD|EUR": series({ "2026-10-01": 0.6138, "2026-10-08": 0.6138 }) };
  const entry = { sendCountry: "AU", receiveCountry: "DE", dateChecked: "2026-10-01", verifiedOn: "2026-10-05", reason: "logged-in quote matched" };
  const run = (r) => auditRows({ rows: [r], corridors, midSeries: (b, q) => mids[`${b}|${q}`], allowlist: [entry] })[0];
  assert.equal(run(row()).status, "allowlisted");
  assert.equal(run(row({ dateChecked: "2026-10-08" })).status, "flagged"); // re-sourced -> allowance expired
});

test("validateAllowlist requires a reason and verification date", () => {
  assert.doesNotThrow(() => validateAllowlist([]));
  assert.throws(() => validateAllowlist([{ sendCountry: "US", receiveCountry: "IN", dateChecked: "2026-09-01" }]));
  assert.throws(() => validateAllowlist([{ sendCountry: "US", receiveCountry: "IN", dateChecked: "2026-09-01", verifiedOn: "2026-10-05", reason: " " }]));
  assert.throws(() => validateAllowlist({}));
});
