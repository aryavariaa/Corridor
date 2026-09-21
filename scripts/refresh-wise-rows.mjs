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
import {
  TARGET_PROVIDERS,
  computeRefresh,
  applyChanges,
  serializeData,
} from "./lib/refresh-core.mjs";

// The refresh/guard logic lives in ./lib/refresh-core.mjs, shared with the
// AWS Lambda (aws/refresh-lambda/) so the scheduled run and this manual one
// can never disagree about what the guard allows. This file is only the
// CLI: flag parsing, reading/writing data/provider-data.json, and printing.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, "..", "data", "provider-data.json");

const WRITE = process.argv.includes("--write");
const FORCE = process.argv.includes("--force");

async function main() {
  const raw = readFileSync(DATA_PATH, "utf8");
  const data = JSON.parse(raw);

  const { corridorsChecked, changes, skippedNotFound, skippedOutlier, errors } =
    await computeRefresh(data, { force: FORCE });

  console.log(`Checked ${corridorsChecked} corridors, ${TARGET_PROVIDERS.join("/")} rows only.\n`);

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

  applyChanges(changes);
  writeFileSync(DATA_PATH, serializeData(data));
  console.log(`\nWrote ${changes.length} updated row(s) to ${path.relative(process.cwd(), DATA_PATH)}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
