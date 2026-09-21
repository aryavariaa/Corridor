// scripts/lib/refresh-core.mjs
//
// The refresh logic itself -- provider scoping, Eurozone quote selection,
// the peer-outlier guard -- extracted from scripts/refresh-wise-rows.mjs so
// the CLI and the AWS Lambda (aws/refresh-lambda/) run *literally the same
// code*. That's deliberate: the guard is the safety property of this whole
// pipeline, so the unattended path must not be able to drift from the
// manual one. Pure logic only: no fs, no process.exit, no console output --
// callers decide how to read/write data and how to report.
//
// Behavior is unchanged from the pre-extraction script (verified by
// replaying recorded API responses through both versions and comparing
// output and the written file byte for byte). See
// docs/provider-data-sourcing.md (2026-09-11 automation note) for the
// scoping rules and docs/aws-automation.md for how this runs on a schedule.

export const TARGET_PROVIDERS = ["Wise", "PayPal", "Western Union"];

// When a corridor's sendCurrency is EUR, the Wise API returns one quote per
// Eurozone origin country instead of one blended figure. Pick
// deterministically by this preference order (first match wins) so re-runs
// are stable. ES was the country used when this pattern was first
// established (2026-09-11, EUR->CO Western Union fix) -- see
// docs/provider-data-sourcing.md.
export const EUR_SOURCE_COUNTRY_PREFERENCE = ["ES", "IT", "DE", "FR", "EE"];

// The guard, as actually implemented: a fetched value whose implied rate
// beats the best *peer* in the same corridor+tier by more than 8% is
// treated as probably-bad data and refused unless forced (the same signal
// behind every manual correction in docs/provider-data-sourcing.md).
//
// NOTE what this is and isn't: it compares against the corridor's OTHER
// providers, and only in the "too good to be true" direction. It does not
// compare a refreshed row against its own previous value, and it does not
// catch a fetched value that is far *worse* than expected. See
// docs/aws-automation.md ("The guard, precisely") for why that matters for
// unattended runs.
export const OUTLIER_BEAT_THRESHOLD = 1.08;

export function impliedRate(row) {
  return row.amountReceived / row.sendAmount;
}

export async function fetchWiseComparison(
  sourceCurrency,
  targetCurrency,
  sendAmount,
  fetchImpl = fetch
) {
  const url = `https://api.wise.com/v3/comparisons/?sourceCurrency=${sourceCurrency}&targetCurrency=${targetCurrency}&sendAmount=${sendAmount}`;
  const res = await fetchImpl(url);
  if (!res.ok) {
    throw new Error(`Wise API ${res.status} for ${url}`);
  }
  return res.json();
}

export function pickQuote(providerEntry, sourceCurrency) {
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

// Computes what a refresh would do, without touching any data. `data` is
// only read (never mutated); apply the result with applyChanges().
//
//   force      -- write rows the peer guard would otherwise refuse
//   today      -- "YYYY-MM-DD" stamped into dateChecked
//   fetchImpl  -- injectable for tests / replay
export async function computeRefresh(
  data,
  { force = false, today = new Date().toISOString().slice(0, 10), fetchImpl = fetch } = {}
) {
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
        apiData = await fetchWiseComparison(
          corridor.sendCurrency,
          corridor.receiveCurrency,
          amount,
          fetchImpl
        );
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

        if (isOutlier && !force) {
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

  return {
    corridorsChecked: corridorsNeeded.size,
    changes,
    skippedNotFound,
    skippedOutlier,
    errors,
  };
}

// Applies computeRefresh()'s changes onto `data` in place. Same behavior
// as the pre-extraction script's final loop.
export function applyChanges(changes) {
  for (const c of changes) {
    Object.assign(c.row, c.after);
  }
}

// Canonical on-disk serialization, shared so the CLI and the Lambda write
// byte-identical files for identical data.
export function serializeData(data) {
  return JSON.stringify(data, null, 2) + "\n";
}
