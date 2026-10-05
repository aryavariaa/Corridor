// Standing sanity check for hand-sourced PayPal rows: flags any row whose
// implied spread vs. that date's Frankfurter mid-market rate is under 1%,
// which means it is almost certainly a first-time promotional quote.
// Logic and rationale: scripts/lib/spread-check.mjs.
//
//   node scripts/check-paypal-spread.mjs            # audit data/provider-data.json
//   node scripts/check-paypal-spread.mjs --min 0.015
//
// Exit 0: every hand-sourced PayPal row passed (or is allowlisted).
// Exit 1: at least one row is flagged.  Exit 2: a row could not be checked.
//
// Run it after hand-entering or re-sourcing ANY PayPal row (see
// docs/provider-data-sourcing.md). It deliberately isn't part of the Lambda:
// the refresh job never touches these rows.
import { readFileSync, existsSync } from "node:fs";
import {
  auditRows,
  isHandSourcedPayPal,
  MIN_PLAUSIBLE_SPREAD,
  validateAllowlist,
} from "./lib/spread-check.mjs";

const DATA = new URL("../data/provider-data.json", import.meta.url);
const ALLOWLIST = new URL("../data/paypal-spread-allowlist.json", import.meta.url);
const DAY_MS = 86_400_000;

const minArg = process.argv.indexOf("--min");
const minSpread = minArg > -1 ? Number(process.argv[minArg + 1]) : MIN_PLAUSIBLE_SPREAD;
if (!(minSpread > 0 && minSpread < 1)) {
  console.error("--min must be a fraction between 0 and 1 (e.g. 0.01 for 1%)");
  process.exit(2);
}

const data = JSON.parse(readFileSync(DATA, "utf8"));
const allowlist = existsSync(ALLOWLIST) ? validateAllowlist(JSON.parse(readFileSync(ALLOWLIST, "utf8"))) : [];

// One Frankfurter request per currency pair, covering every row date for it
// (plus a week of lookback for weekend/holiday gaps).
const rows = data.providerRates.filter(isHandSourcedPayPal);
const corridorByKey = new Map(data.corridors.map((c) => [`${c.sendCountry}|${c.receiveCountry}`, c]));
const span = new Map(); // "BASE|QUOTE" -> { from, to }
for (const r of rows) {
  const c = corridorByKey.get(`${r.sendCountry}|${r.receiveCountry}`);
  if (!c) continue;
  const k = `${c.sendCurrency}|${c.receiveCurrency}`;
  const s = span.get(k) ?? { from: r.dateChecked, to: r.dateChecked };
  if (r.dateChecked < s.from) s.from = r.dateChecked;
  if (r.dateChecked > s.to) s.to = r.dateChecked;
  span.set(k, s);
}

const series = new Map();
for (const [k, { from, to }] of span) {
  const [base, quote] = k.split("|");
  const start = new Date(Date.parse(`${from}T00:00:00Z`) - 7 * DAY_MS).toISOString().slice(0, 10);
  try {
    const res = await fetch(
      `https://api.frankfurter.dev/v2/rates?from=${start}&to=${to}&base=${base}&quotes=${quote}`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    series.set(k, new Map(body.map((p) => [p.date, p.rate])));
  } catch (err) {
    console.error(`could not fetch ${base}->${quote} history: ${err.message}`);
  }
}

const results = auditRows({
  rows: data.providerRates,
  corridors: data.corridors,
  midSeries: (b, q) => series.get(`${b}|${q}`) ?? null,
  allowlist,
  minSpread,
});

// One line per corridor (both tiers normally agree; show the thinner one).
const byCorridor = new Map();
for (const r of results) {
  const k = `${r.sendCountry}->${r.receiveCountry}`;
  const prev = byCorridor.get(k);
  if (!prev || (r.spread ?? -Infinity) < (prev.spread ?? -Infinity)) byCorridor.set(k, r);
}
const pct = (x) => (x * 100).toFixed(2).padStart(6) + "%";
for (const [k, r] of [...byCorridor].sort((a, b) => (a[1].spread ?? -9) - (b[1].spread ?? -9))) {
  const tag = { ok: "ok         ", flagged: "FLAGGED    ", allowlisted: "allowlisted", "no-mid": "NO MID     " }[r.status];
  const detail = r.spread === undefined ? r.note : `${pct(r.spread)} vs mid ${r.mid} (${r.midDate}), row dated ${r.dateChecked}`;
  console.log(`${tag} ${k.padEnd(8)} ${detail}${r.status === "allowlisted" ? `  [${r.note}]` : ""}`);
}

const flagged = [...byCorridor.values()].filter((r) => r.status === "flagged");
const unchecked = [...byCorridor.values()].filter((r) => r.status === "no-mid");
console.log(
  `\n${byCorridor.size} hand-sourced PayPal corridors (${results.length} rows), threshold ${(minSpread * 100).toFixed(1)}%: ` +
    `${flagged.length} flagged, ${unchecked.length} unchecked, ` +
    `${[...byCorridor.values()].filter((r) => r.status === "allowlisted").length} allowlisted`
);
if (flagged.length) {
  console.log(
    "A flagged row is almost certainly a first-time promotional quote. Re-source it from a standard-rate\n" +
      "(logged-in or returning-customer) quote; only allowlist it in data/paypal-spread-allowlist.json with the\n" +
      "reason and date you verified it."
  );
}
process.exit(flagged.length ? 1 : unchecked.length ? 2 : 0);
