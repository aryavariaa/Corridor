// Sanity check for HAND-SOURCED PayPal rows: is the quote plausibly a standard
// rate, or a first-time promotional quote caught by accident?
//
// A row's "implied spread" is how far below that day's mid-market rate the
// customer actually ends up, fees included:
//
//     spread = 1 - (amountReceived / sendAmount) / midMarket(row.dateChecked)
//
// PayPal's consumer transfer product (Xoom) really costs about 1.2-4.9%
// (World Bank RPW, Q3 2025), and Corridor's other hand-sourced PayPal rows
// sit at 1.2-3.2%. A row thinner than ~1% is almost certainly a first-time or
// otherwise promotional quote -- Xoom's public guest calculator tags every
// quote FIRST_TIME_RATE, so it is easy to capture one without noticing. The
// 2026-10-04 audit that motivated this found US->IN at 0.23% and AU->Eurozone
// at 0.34%, against 1.2-3.2% for every other row. See
// docs/provider-data-sourcing.md ("Hand-sourced PayPal sanity check").
//
// What this does NOT prove: a row above the threshold is not thereby verified
// as a standard rate, and the mid is Frankfurter's daily reference rate, not
// Xoom's intraday one (expect ~0.3% of noise either way, which is why the
// threshold has margin). It only catches quotes that are too good to be real.
//
// Pure functions only (no network, no fs) so they can be unit-tested offline;
// scripts/check-paypal-spread.mjs does the I/O.

export const MIN_PLAUSIBLE_SPREAD = 0.01; // 1%

// Rows from the Wise comparison API are rewritten daily by the refresh job
// and are not checked here. Keep this prefix in sync with lib/corridors.ts
// (WISE_LIVE_SOURCE_PREFIX) and scripts/lib/refresh-core.mjs.
export const API_SOURCE_PREFIX = "wise.com live comparison API";

export const SPREAD_CHECKED_PROVIDERS = ["PayPal"];

const DAY_MS = 86_400_000;
const MAX_MID_LOOKBACK_DAYS = 5; // a weekend or holiday gap, not a stale series

export function isHandSourcedPayPal(row) {
  return (
    SPREAD_CHECKED_PROVIDERS.includes(row.provider) &&
    !String(row.source).startsWith(API_SOURCE_PREFIX)
  );
}

export function impliedSpread(row, mid) {
  return 1 - row.amountReceived / row.sendAmount / mid;
}

// series: Map<"YYYY-MM-DD", rate>. The mid for `date`, or the latest earlier
// day within MAX_MID_LOOKBACK_DAYS if that day has no published rate. Never
// looks forward: a later rate would be a different market.
export function midOnOrBefore(series, date) {
  const t0 = Date.parse(`${date}T00:00:00Z`);
  for (let i = 0; i <= MAX_MID_LOOKBACK_DAYS; i++) {
    const d = new Date(t0 - i * DAY_MS).toISOString().slice(0, 10);
    if (series.has(d)) return { date: d, rate: series.get(d) };
  }
  return null;
}

// An allowlist entry says "a human verified this row against a real logged-in
// quote and the thin spread is genuine". It is tied to the row's dateChecked,
// so re-sourcing the row (new date) makes the entry stop applying and forces a
// fresh justification, rather than excusing whatever number comes next.
export function validateAllowlist(entries) {
  if (!Array.isArray(entries)) throw new Error("allowlist must be an array");
  for (const e of entries) {
    for (const k of ["sendCountry", "receiveCountry", "dateChecked", "verifiedOn", "reason"]) {
      if (typeof e[k] !== "string" || !e[k].trim()) {
        throw new Error(`allowlist entry missing "${k}": ${JSON.stringify(e)}`);
      }
    }
  }
  return entries;
}

// rows: provider-data providerRates. corridors: provider-data corridors.
// midSeries(base, quote) -> Map<date, rate> | null.
// Returns one result per hand-sourced PayPal row.
export function auditRows({ rows, corridors, midSeries, allowlist = [], minSpread = MIN_PLAUSIBLE_SPREAD }) {
  const pair = new Map(corridors.map((c) => [`${c.sendCountry}|${c.receiveCountry}`, c]));
  const results = [];
  for (const row of rows.filter(isHandSourcedPayPal)) {
    const c = pair.get(`${row.sendCountry}|${row.receiveCountry}`);
    const base = { sendCountry: row.sendCountry, receiveCountry: row.receiveCountry, tier: row.tier, dateChecked: row.dateChecked };
    const series = c ? midSeries(c.sendCurrency, c.receiveCurrency) : null;
    const mid = series ? midOnOrBefore(series, row.dateChecked) : null;
    if (!mid) {
      results.push({ ...base, status: "no-mid", note: "no mid-market rate available for this date" });
      continue;
    }
    const spread = impliedSpread(row, mid.rate);
    const allowed = allowlist.find(
      (e) =>
        e.sendCountry === row.sendCountry &&
        e.receiveCountry === row.receiveCountry &&
        e.dateChecked === row.dateChecked
    );
    const status = spread >= minSpread ? "ok" : allowed ? "allowlisted" : "flagged";
    results.push({
      ...base,
      status,
      spread,
      mid: mid.rate,
      midDate: mid.date,
      ...(allowed && status === "allowlisted" ? { note: `${allowed.reason} (verified ${allowed.verifiedOn})` } : {}),
    });
  }
  return results;
}

// Flagged corridors that the site is NOT yet labelling "Under review". Matches
// data/under-review.json entries by corridor, provider and exact dateChecked,
// like lib/under-review.ts. A flagged row with no entry shows its thin quote to
// visitors with no caveat, so the check script reports these.
export function flaggedWithoutLabel(results, underReview) {
  return results
    .filter((r) => r.status === "flagged")
    .filter(
      (r) =>
        !underReview.some(
          (e) =>
            e.sendCountry === r.sendCountry &&
            e.receiveCountry === r.receiveCountry &&
            e.provider === "PayPal" &&
            e.dateChecked === r.dateChecked
        )
    );
}
