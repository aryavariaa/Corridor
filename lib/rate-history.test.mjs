// node --test lib/rate-history.test.mjs   (Node 22.18+/24 strips the .ts types)
import test from "node:test";
import assert from "node:assert/strict";
import {
  changeSincePrevious,
  historyUrl,
  niceTicks,
  parseRateHistory,
  sliceRange,
} from "./rate-history.ts";

const series = (start, rates) =>
  rates.map((rate, i) => ({
    date: new Date(Date.parse(`${start}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10),
    rate,
  }));

test("historyUrl asks for 60 days ending today, for the right pair", () => {
  const u = historyUrl("USD", "INR", new Date("2026-10-04T15:00:00Z"));
  assert.equal(
    u,
    "https://api.frankfurter.dev/v2/rates?from=2026-08-05&to=2026-10-04&base=USD&quotes=INR"
  );
});

test("parseRateHistory sorts, drops bad rows, and rejects unusable bodies", () => {
  const body = [
    { date: "2026-10-02", quote: "INR", rate: 96.14 },
    { date: "2026-10-01", quote: "INR", rate: 95.98 },
    { date: "2026-10-03", quote: "INR", rate: 0 },
    { date: "2026-10-03", quote: "EUR", rate: 0.9 },
    null,
  ];
  assert.deepEqual(parseRateHistory(body, "INR").map((p) => p.date), ["2026-10-01", "2026-10-02"]);
  assert.throws(() => parseRateHistory({ message: "not found" }, "INR"));
  assert.throws(() => parseRateHistory([{ date: "2026-10-01", quote: "INR", rate: 95 }], "INR"));
});

test("sliceRange keeps the last N days inclusive of both ends", () => {
  const pts = series("2026-08-05", Array.from({ length: 61 }, (_, i) => 90 + i)); // Aug 5 .. Oct 4
  assert.equal(sliceRange(pts, 7).length, 8);
  assert.equal(sliceRange(pts, 14).length, 15);
  assert.equal(sliceRange(pts, 60).length, 61);
  assert.equal(sliceRange(pts, 7)[7].date, "2026-10-04");
});

test("changeSincePrevious: percent, direction and the yesterday/gap wording", () => {
  const up = changeSincePrevious(series("2026-10-03", [96.0, 96.1344]));
  assert.ok(Math.abs(up.pct - 0.14) < 1e-9);
  assert.equal(up.sinceYesterday, true);
  const down = changeSincePrevious(series("2026-10-03", [100, 99]));
  assert.ok(down.pct < 0);
  const gap = changeSincePrevious([
    { date: "2026-10-01", rate: 100 },
    { date: "2026-10-04", rate: 101 },
  ]);
  assert.equal(gap.sinceYesterday, false);
  assert.equal(changeSincePrevious([{ date: "2026-10-04", rate: 1 }]), null);
});

test("niceTicks returns round values inside the range, including for VND-sized rates", () => {
  const t = niceTicks(94.3, 96.5);
  assert.ok(t.length >= 3 && t.length <= 8);
  assert.ok(t.every((v) => v >= 94.3 && v <= 96.5));
  const v = niceTicks(25_700, 26_200);
  assert.ok(v.every((x) => Number.isInteger(x)));
  assert.deepEqual(niceTicks(5, 5), [5]);
});
