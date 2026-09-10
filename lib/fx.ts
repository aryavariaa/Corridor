export type SupportedCurrency = "USD" | "GBP" | "EUR" | "AED" | "MYR";

type ERApiResponse = {
  result: string;
  base_code: string;
  rates: Record<string, number>;
};

export type MidMarketRate = {
  rate: number;
  asOf: string;
  // True when this is a cached rate served because the live fetch failed —
  // lets the UI say so instead of silently showing a stale number as live.
  stale?: boolean;
};

// Last known-good rate per currency pair, kept in memory so a single
// upstream hiccup (open.er-api.com down, rate-limited, timing out) doesn't
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
    const res = await fetch(`https://open.er-api.com/v6/latest/${base}`, {
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      throw new Error(`FX API request failed: ${res.status}`);
    }

    const data: ERApiResponse = await res.json();

    if (data.result !== "success") {
      throw new Error("FX API returned an error result");
    }

    const rate = data.rates[target];
    if (!rate) {
      throw new Error(`No rate found for ${base} -> ${target}`);
    }

    const fresh = { rate, asOf: new Date().toISOString() };
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
