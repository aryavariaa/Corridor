export type SupportedCurrency = "USD" | "GBP" | "EUR" | "AUD" | "CAD";

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

// Structured detail for the specific "swing rejected" case below, as
// opposed to a plain upstream fetch failure -- both set `stale: true` on
// MidMarketRate, but only this case has real numbers behind it worth
// narrating (see lib/ai.ts's getAnomalyExplanation, added for the AI Rate
// Insights feature). Every field here is a real value already computed
// below; nothing here is invented for the narration.
export type RateAnomaly = {
  previousRate: number;
  previousAsOf: string;
  rejectedRate: number;
  rejectedAsOf: string;
  swingPercent: number; // e.g. 3.2 for a 3.2% swing
};

export type MidMarketRate = {
  rate: number;
  asOf: string;
  // True when this is a cached rate served because the live fetch failed —
  // lets the UI say so instead of silently showing a stale number as live.
  stale?: boolean;
  // Present only when `stale` is true because of a rejected swing (see
  // MAX_PLAUSIBLE_SWING below), not a plain fetch failure.
  anomaly?: RateAnomaly;
  // Which upstream produced `rate`. Absent means Frankfurter.
  source?: "wise" | "frankfurter";
};

// Currencies whose published official reference rate (what Frankfurter
// reports) sits well away from the rate providers actually execute at. For
// these targets the benchmark is Wise's own mid-market rate, with Frankfurter
// as the fallback, and Wise's row is shown as the reference, not ranked.
// Currently empty: NGN was the only case and was dropped from the dataset
// (docs/provider-data-sourcing.md, 2026-09-23). Add a currency here only
// after checking Wise's rate against Frankfurter's across every send currency.
const WISE_BENCHMARK_TARGETS = new Set<string>();

export function usesWiseBenchmark(target: string): boolean {
  return WISE_BENCHMARK_TARGETS.has(target);
}

const WISE_SOURCE_COUNTRY: Record<SupportedCurrency, string> = {
  USD: "US",
  GBP: "GB",
  EUR: "ES",
  AUD: "AU",
  CAD: "CA",
};

type WiseComparisonResponse = {
  providers?: {
    name: string;
    quotes?: { rate?: number; sourceCountry?: string | null }[];
  }[];
};

// Kept apart from lastKnownGood: Wise and Frankfurter legitimately differ
// by a few percent for such currencies, so sharing one cache would make a Wise->Frankfurter
// switch look like a suspect swing to the guard below.
const wiseLastKnownGood = new Map<string, { rate: number; asOf: string }>();

async function getWiseMidMarketRate(
  base: SupportedCurrency,
  target: string
): Promise<MidMarketRate | null> {
  const key = cacheKey(base, target);
  const country = WISE_SOURCE_COUNTRY[base];
  try {
    const res = await fetch(
      `https://api.wise.com/v3/comparisons/?sourceCurrency=${base}&targetCurrency=${target}&sendAmount=1000&sourceCountry=${country}`,
      { next: { revalidate: 3600 }, signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) throw new Error(`Wise comparison request failed: ${res.status}`);
    const data: WiseComparisonResponse = await res.json();
    const quotes = data.providers?.find((p) => p.name === "Wise")?.quotes ?? [];
    const rate = (quotes.find((q) => q.sourceCountry === country) ?? quotes[0])?.rate;
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
      throw new Error(`No Wise rate found for ${base} -> ${target}`);
    }
    const fresh = { rate, asOf: new Date().toISOString() };
    wiseLastKnownGood.set(key, fresh);
    return { ...fresh, source: "wise" };
  } catch (err) {
    const cached = wiseLastKnownGood.get(key);
    if (cached) {
      console.error(`Wise benchmark fetch failed for ${key}, serving last known rate`, err);
      return { ...cached, stale: true, source: "wise" };
    }
    console.error(`Wise benchmark fetch failed for ${key}, falling back to Frankfurter`, err);
    return null;
  }
}

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

// The one-off rejection above only distinguishes "flaky snapshot" from
// "real move" by re-checking on the *next* fetch: a flaky CDN inconsistency
// won't reproduce itself, but a genuine move (like COP's ~3.2% drift this
// week) will keep reading the same new level again. Track the rejected
// value per pair so a second, independent fetch landing back near it
// promotes it to the new known-good rate instead of leaving the pair stuck.
//
// Without this, `lastKnownGood` is never written on rejection, so every
// later fetch keeps comparing against the same pre-move baseline forever --
// each one swings >3% from that frozen baseline and gets rejected again,
// with no way back to a live rate short of a process restart (cold start
// wiping the map). That silently contradicts this file's own "costs one
// extra cache cycle of staleness" claim above, which assumes recovery
// happens -- it doesn't, as implemented. A currency having a real bad
// multi-day run (again, see COP) would leave the comparison table quoting
// a rate that's days or weeks stale, still labeled merely `stale: true`
// with no indication it's now arbitrarily far off, while genuinely-current
// provider quotes are compared against it -- the *opposite* direction of
// the currently-tracked negative-cost issue in docs/provider-data-sourcing.md,
// but the same failure mode: a mid-market benchmark that no longer reflects
// the real market it's supposed to represent.
const pendingCandidates = new Map<string, { rate: number; confirmations: number }>();

// How close a newly-rejected reading must land to the previously-rejected
// one to count as "the same real level showing up again," as opposed to
// still-inconsistent bouncing between unrelated snapshots. Deliberately
// tighter than MAX_PLAUSIBLE_SWING -- confirmation is about two suspect
// readings agreeing with each other, not about either agreeing with the
// old baseline.
const CANDIDATE_CONFIRM_TOLERANCE = 0.01; // 1%

export async function getMidMarketRate(
  base: SupportedCurrency,
  target: string
): Promise<MidMarketRate> {
  const key = cacheKey(base, target);

  if (usesWiseBenchmark(target)) {
    const wise = await getWiseMidMarketRate(base, target);
    if (wise) return wise;
  }

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
        const pending = pendingCandidates.get(key);
        const confirmsPending =
          pending !== undefined &&
          Math.abs(data.rate - pending.rate) / pending.rate <= CANDIDATE_CONFIRM_TOLERANCE;

        if (confirmsPending && pending.confirmations + 1 >= 2) {
          // Same suspect level as last time, on an independent fetch --
          // this is a real move, not a one-off flaky snapshot. Accept it
          // as the new baseline instead of staying stuck on the old one.
          pendingCandidates.delete(key);
          const fresh = { rate: data.rate, asOf: new Date(data.date).toISOString() };
          lastKnownGood.set(key, fresh);
          return fresh;
        }

        pendingCandidates.set(key, {
          rate: data.rate,
          confirmations: confirmsPending ? pending.confirmations + 1 : 1,
        });

        const rejectedAsOf = new Date(data.date).toISOString();
        console.error(
          `FX rate for ${key} swung ${(swing * 100).toFixed(1)}% since last known good ` +
            `(${previouslyKnownGood.rate} @ ${previouslyKnownGood.asOf} -> ${data.rate} @ ` +
            `${rejectedAsOf}) -- treating this as a suspect upstream ` +
            `snapshot rather than a real move, serving the last known-good rate instead.`
        );
        return {
          ...previouslyKnownGood,
          stale: true,
          anomaly: {
            previousRate: previouslyKnownGood.rate,
            previousAsOf: previouslyKnownGood.asOf,
            rejectedRate: data.rate,
            rejectedAsOf,
            swingPercent: swing * 100,
          },
        };
      }
      // Within tolerance of known-good -- no longer a suspect reading, so
      // drop any pending candidate from an earlier rejected swing.
      pendingCandidates.delete(key);
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
