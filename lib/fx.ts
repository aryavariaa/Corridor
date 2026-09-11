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
