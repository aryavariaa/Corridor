export type SupportedCurrency = "USD" | "GBP" | "EUR" | "AED" | "MYR" | "AUD" | "CAD";

// Frankfurter (frankfurter.dev) -- free, no API key, no rate caps,
// aggregating ~90+ central banks and refreshed daily. Replaces the
// previous open.er-api.com source (2026-09-11): same live-rate contract,
// same cached-fallback behavior below, just a different upstream.
type FrankfurterRateResponse = {
  date: string; // "YYYY-MM-DD" -- the rate's own effective date, not
  // necessarily today (a weekend/holiday can mean the underlying central
  // bank hasn't published a newer one yet).
  base: string;
  quote: string;
  rate: number;
};

export type MidMarketRate = {
  rate: number;
  asOf: string;
  // True when this is a cached rate served because the live fetch failed —
  // lets the UI say so instead of silently showing a stale number as live.
  stale?: boolean;
};

// Last known-good rate per currency pair, kept in memory so a single
// upstream hiccup (Frankfurter down, rate-limited, timing out) doesn't
// take the whole comparison table down with a 502.
//
// Best-effort only: state lives in a single serverless instance's memory,
// so it resets on cold start and isn't shared across concurrent instances —
// same tradeoff made deliberately in lib/rate-limit.ts. Good enough to ride
// out a transient outage; it does nothing for a cold instance that has
// never seen a successful fetch for this pair.
const lastKnownGood = new Map<string, { rate: number; asOf: string }>();

function cacheKey(base: string, target: string): string {
  return `${base}->${target}`;
}

// A same-cache-window swing this large for a plain fiat/fiat pair is a
// stronger signal of a flaky/inconsistent upstream response than of a real
// intraday move. Confirmed empirically on 2026-09-11: two "latest" reads of
// USD->COP made minutes apart, via different network paths, returned
// 3199.03 (dated 2026-08-31) and 3097.5 (dated 2026-09-11) -- a 3.2% spread
// on the exact same endpoint, with no corresponding MXN inconsistency (MXN
// was identical, 16.9605, on every read). That spread alone was enough to
// flip several thin-margin US->CO providers (XE, Remitly, Western Union --
// all part of the original "six providers" seed batch with "no confidence/
// method notes preserved", per docs/provider-data-sourcing.md) from a sane
// positive cost to an impossible negative one, purely depending on which
// snapshot got served. Reject a fetch that swings more than this from the
// last known-good rate for the same pair within this process's lifetime,
// and fall back to that cached rate (marked stale) instead of trusting a
// number that might just be an inconsistent snapshot.
//
// revalidate is 3600s (1hr): a genuine >3% fiat/fiat move inside one hour
// is rare outside an actual currency crisis, and worst case this costs one
// extra cache cycle of staleness on a real fast-moving day -- an
// acceptable tradeoff for a comparison tool, where a false "impossible"
// negative cost is worse than being briefly out of date.
//
// Known gap: this can't catch a bad value on the very first fetch for a
// pair (nothing cached yet to compare against, e.g. right after a cold
// start) -- there's no second, independent FX source here to cross-check
// against instead. Worth adding one if this keeps recurring.
const MAX_PLAUSIBLE_SWING = 0.03; // 3%

export async function getMidMarketRate(
  base: SupportedCurrency,
  target: string
): Promise<MidMarketRate> {
  const key = cacheKey(base, target);

  try {
    const res = await fetch(
      `https://api.frankfurter.dev/v2/rate/${base}/${target}`,
      { next: { revalidate: 3600 } }
    );

    if (!res.ok) {
      throw new Error(`FX API request failed: ${res.status}`);
    }

    const data: FrankfurterRateResponse = await res.json();

    if (typeof data.rate !== "number") {
      throw new Error(`No rate found for ${base} -> ${target}`);
    }

    const previouslyKnownGood = lastKnownGood.get(key);
    if (previouslyKnownGood) {
      const swing =
        Math.abs(data.rate - previouslyKnownGood.rate) / previouslyKnownGood.rate;
      if (swing > MAX_PLAUSIBLE_SWING) {
        console.error(
          `FX rate for ${key} swung ${(swing * 100).toFixed(1)}% since last known good ` +
            `(${previouslyKnownGood.rate} @ ${previouslyKnownGood.asOf} -> ${data.rate} @ ` +
            `${new Date(data.date).toISOString()}) -- treating this as a suspect upstream ` +
            `snapshot rather than a real move, serving the last known-good rate instead.`
        );
        return { ...previouslyKnownGood, stale: true };
      }
    }

    // Use Frankfurter's own effective date rather than stamping "now" --
    // more honest about actual freshness than the previous provider's
    // approach of always recording the fetch time.
    const fresh = { rate: data.rate, asOf: new Date(data.date).toISOString() };
    lastKnownGood.set(key, fresh);
    return fresh;
  } catch (err) {
    const cached = lastKnownGood.get(key);
    if (cached) {
      console.error(
        `FX fetch failed for ${key}, serving last known rate from ${cached.asOf}`,
        err
      );
      return { ...cached, stale: true };
    }
    // Nothing to fall back to yet (e.g. a cold instance that's never seen
    // a successful fetch for this pair) — this is a genuine failure the
    // caller needs to surface.
    throw err;
  }
}
