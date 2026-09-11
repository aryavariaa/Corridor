#!/usr/bin/env node
// scripts/refresh-wise-rows.mjs
//
// Refreshes Wise / PayPal / Western Union rows in data/provider-data.json
// from the Wise Comparison API (api.wise.com/v3/comparisons), scoped
// narrowly per docs/provider-data-sourcing.md's 2026-09-11 automation note:
//
//   - Only ever writes rows for provider in {Wise, PayPal, Western Union}.
//   - Only refreshes a row that already exists for that
//     (sendCountry, receiveCountry, provider, tier) -- it never invents a
//     new provider row for a corridor that doesn't already offer it.
//   - Every other provider (XE, Remitly, Revolut, WorldRemit, Paysend,
//     MoneyGram, Ria, Al Ansari, ...) is left completely untouched. The
//     Wise API simply doesn't return them -- confirmed across multiple
//     corridors at both the $300 and $3000 tier amounts -- so this script
//     must never attempt to source them from here.
//   - If the API doesn't return one of the three target providers for a
//     given corridor+tier (this happens -- e.g. PayPal is entirely absent
//     from the USD->INR response), the existing row is left as-is and the
//     gap is reported, not deleted or blanked.
//   - A fetched value that would beat the corridor+tier's peer cluster by
//     more than 8% is refused (same "probably bad data" signal used
//     throughout docs/provider-data-sourcing.md's manual corrections) --
//     pass --force to write it anyway after manually double-checking it.
//
// Dry-run by default: prints a diff of what would change and does not
// write data/provider-data.json. Pass --write to actually persist.
//
//   node scripts/refresh-wise-rows.mjs            # dry run, prints diff
//   node scripts/refresh-wise-rows.mjs --write    # applies the changes
//   node scripts/refresh-wise-rows.mjs --write --force   # also writes flagged outliers
//
// NETWORK REQUIREMENT: this script calls api.wise.com directly over plain
// outbound HTTPS. It will NOT run inside a network-sandboxed environment
// (that includes the Claude sandbox this repo has been edited from) --
// see the "Automated refresh" section of docs/provider-data-sourcing.md.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, "..", "data", "provider-data.json");

const TARGET_PROVIDERS = ["Wise", "PayPal", "Western Union"];

// When a corridor's sendCurrency is EUR, the Wise API returns one quote per
// Eurozone origin country instead of one blended figure. Pick
// deterministically by this preference order (first match wins) so re-runs
// are stable. ES was the country used when this pattern was first
// established (2026-09-11, EUR->CO Western Union fix) -- see
// docs/provider-data-sourcing.md.
const EUR_SOURCE_COUNTRY_PREFERENCE = ["ES", "IT", "DE", "FR", "EE"];

// >8% better than every peer's implied rate in the same corridor+tier group
// is this repo's established "probably bad data" signal (see the
// 2026-09-08 and 2026-09-10 corrections in docs/provider-data-sourcing.md).
// Refuse to write a fetched value that trips it without --force.
const OUTLIER_BEAT_THRESHOLD = 1.08;

const WRITE = process.argv.includes("--write");
const FORCE = process.argv.includes("--force");

function impliedRate(row) {
  return row.amountReceived / row.sendAmount;
}

async function fetchWiseComparison(sourceCurrency, targetCurrency, sendAmount) {
  const url = `https://api.wise.com/v3/comparisons/?sourceCurrency=${sourceCurrency}&targetCurrency=${targetCurrency}&sendAmount=${sendAmount}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Wise API ${res.status} for ${url}`);
  }
  return res.json();
}

function pickQuote(providerEntry, sourceCurrency) {
  const quotes = providerEntry.quotes ?? [];
  if (quotes.length === 0) return null;
  if (quotes.length === 1) return quotes[0];
  if (sourceCurrency === "EUR") {
    for (const cc of EUR_SOURCE_COUNTRY_PREFERENCE) {
      const match = quotes.find((q) => q.sourceCountry === cc);
      if (match) return match;
    }
  }
  // Fallback: first quote, but this is an un-preferenced multi-quote
  // currency combo we haven't seen before -- worth a manual look.
  return quotes[0];
}

async function main() {
  const raw = readFileSync(DATA_PATH, "utf8");
  const data = JSON.parse(raw);

  const corridorByKey = new Map(
    data.corridors.map((c) => [`${c.sendCountry}|${c.receiveCountry}`, c])
  );

  // Only rows for the three target providers, grouped by corridor.
  const eligibleRows = data.providerRates.filter((r) =>
    TARGET_PROVIDERS.includes(r.provider)
  );

  const corridorsNeeded = new Map(); // key -> corridor
  for (const row of eligibleRows) {
    const key = `${row.sendCountry}|${row.receiveCountry}`;
    corridorsNeeded.set(key, corridorByKey.get(key));
  }

  const today = new Date().toISOString().slice(0, 10);
  const changes = [];
  const skippedNotFound = [];
  const skippedOutlier = [];
  const errors = [];

  for (const [key, corridor] of corridorsNeeded) {
    if (!corridor) continue;
    for (const tier of ["Everyday", "Large"]) {
      const amount = tier === "Everyday" ? corridor.everydayAmount : corridor.largeAmount;
      let apiData;
      try {
        apiData = await fetchWiseComparison(corridor.sendCurrency, corridor.receiveCurrency, amount);
      } catch (err) {
        errors.push({ corridor: key, tier, error: err.message });
        continue;
      }

      for (const providerName of TARGET_PROVIDERS) {
        const row = data.providerRates.find(
          (r) =>
            r.sendCountry === corridor.sendCountry &&
            r.receiveCountry === corridor.receiveCountry &&
            r.provider === providerName &&
            r.tier === tier
        );
        if (!row) continue; // this corridor+tier doesn't offer this provider -- never invent one

        const entry = apiData.providers?.find((p) => p.name === providerName);
        if (!entry) {
          skippedNotFound.push({ corridor: key, tier, provider: providerName });
          continue;
        }
        const quote = pickQuote(entry, corridor.sendCurrency);
        if (!quote) {
          skippedNotFound.push({ corridor: key, tier, provider: providerName, reason: "empty quotes array" });
          continue;
        }

        const newAmountReceived = quote.receivedAmount;
        const newImplied = newAmountReceived / amount;

        // Peer check: compare against every OTHER row in this corridor+tier
        // group (excluding the one we're about to replace).
        const peers = data.providerRates.filter(
          (r) =>
            r.sendCountry === corridor.sendCountry &&
            r.receiveCountry === corridor.receiveCountry &&
            r.tier === tier &&
            r !== row
        );
        const bestPeer = peers.length ? Math.max(...peers.map(impliedRate)) : null;
        const isOutlier = bestPeer !== null && newImplied > bestPeer * OUTLIER_BEAT_THRESHOLD;

        if (isOutlier && !FORCE) {
          skippedOutlier.push({
            corridor: key,
            tier,
            provider: providerName,
            newImplied: newImplied.toFixed(4),
            bestPeer: bestPeer.toFixed(4),
          });
          continue;
        }

        changes.push({
          row,
          before: {
            sendAmount: row.sendAmount,
            amountReceived: row.amountReceived,
            dateChecked: row.dateChecked,
          },
          after: {
            sendAmount: amount,
            amountReceived: newAmountReceived,
            dateChecked: today,
            source:
              `wise.com live comparison API (sourceCurrency=${corridor.sendCurrency}, ` +
              `targetCurrency=${corridor.receiveCurrency}, sendAmount=${amount}` +
              `${quote.sourceCountry ? `, sourceCountry=${quote.sourceCountry}` : ""}) -- ` +
              `rate ${quote.rate}, fee ${quote.fee} ${corridor.sendCurrency}. ` +
              `Auto-refreshed by scripts/refresh-wise-rows.mjs.`,
          },
        });
      }
    }
  }

  console.log(`Checked ${corridorsNeeded.size} corridors, ${TARGET_PROVIDERS.join("/")} rows only.\n`);

  if (changes.length) {
    console.log(`${changes.length} row(s) would change:`);
    for (const c of changes) {
      console.log(
        `  ${c.row.sendCountry}->${c.row.receiveCountry} ${c.row.provider} ${c.row.tier}: ` +
          `amountReceived ${c.before.amountReceived} -> ${c.after.amountReceived}` +
          (c.before.sendAmount !== c.after.sendAmount
            ? ` (sendAmount ${c.before.sendAmount} -> ${c.after.sendAmount})`
            : "")
      );
    }
  } else {
    console.log("No rows would change.");
  }

  if (skippedNotFound.length) {
    console.log(
      `\n${skippedNotFound.length} row(s) left untouched -- provider not in this Wise API response (existing manually-sourced value kept):`
    );
    for (const s of skippedNotFound) {
      console.log(`  ${s.corridor} ${s.provider} ${s.tier}${s.reason ? ` (${s.reason})` : ""}`);
    }
  }

  if (skippedOutlier.length) {
    console.log(
      `\n${skippedOutlier.length} row(s) SKIPPED -- fetched value beats the corridor's peer cluster by >8%, refusing to write without --force:`
    );
    for (const s of skippedOutlier) {
      console.log(`  ${s.corridor} ${s.provider} ${s.tier}: implied ${s.newImplied} vs best peer ${s.bestPeer}`);
    }
  }

  if (errors.length) {
    console.log(`\n${errors.length} corridor+tier fetch(es) failed:`);
    for (const e of errors) console.log(`  ${e.corridor} ${e.tier}: ${e.error}`);
  }

  if (!WRITE) {
    console.log("\nDry run only -- no files written. Re-run with --write to persist these changes.");
    return;
  }

  if (!changes.length) {
    console.log("\nNothing to write.");
    return;
  }

  for (const c of changes) {
    Object.assign(c.row, c.after);
  }
  writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + "\n");
  console.log(`\nWrote ${changes.length} updated row(s) to ${path.relative(process.cwd(), DATA_PATH)}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
