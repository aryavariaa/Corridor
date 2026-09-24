import providerData from "@/data/provider-data.json";
import {
  getMidMarketRate,
  usesWiseBenchmark,
  type RateAnomaly,
  type SupportedCurrency,
} from "@/lib/fx";
import { fetchLiveQuotes, LIVE_PROVIDERS } from "@/lib/wise-live";

export type Tier = "Everyday" | "Large";

// A corridor is identified by its send/receive country pair, not by an
// arbitrary index. "Does this pair have any data" is answered by whether a
// ProviderRate row exists for it, not by membership in a separately
// maintained corridors[] whitelist -- this metadata array exists only to
// carry per-pair display names, currencies, and the two test-amount tiers,
// not to gate which pairs "exist."
export type Corridor = {
  // ISO 3166-1 alpha-2 (e.g. "US") for most corridors -- but Eurozone
  // corridors use the currency code "EUR" instead of a specific member
  // country, since SEPA-based rate/fee data doesn't vary by which
  // Eurozone country you send from (see the 2026-09-11 EUR-keying change
  // in docs/provider-data-sourcing.md). Any future Eurozone corridor
  // (Germany, France, etc.) should follow this same pattern.
  sendCountry: string;
  sendCountryName: string;
  sendCurrency: string;
  receiveCountry: string; // ISO 3166-1 alpha-2, e.g. "IN"
  receiveCountryName: string;
  receiveCurrency: string;
  everydayAmount: number;
  largeAmount: number;
};

export type ProviderRate = {
  sendCountry: string;
  receiveCountry: string;
  provider: string;
  tier: string;
  sendAmount: number;
  amountReceived: number;
  dateChecked: string;
  source: string;
};

export type RankedProvider = {
  provider: string;
  sendAmount: number;
  amountReceived: number;
  costPercent: number;
  // 0 for a benchmark reference row, which sits outside the ranking.
  rank: number;
  // True for the provider whose own mid-market rate is the benchmark on
  // this corridor (Wise, on corridors using the Wise benchmark): its cost is only its fee, so
  // it's shown as the reference rather than ranked against the others.
  benchmarkReference?: boolean;
  // Where this row's number comes from. Preset-tier rows are "verified"
  // (checked against the provider's own quote, dated dateChecked). On a
  // custom amount, Wise/PayPal/Western Union rows are "live" (queried just
  // now at that amount) and every other row is "estimated" (interpolated
  // from its two verified tier rows, never checked at this amount).
  basis: RowBasis;
  dateChecked: string;
  source: string;
};

export type RowBasis = "verified" | "live" | "estimated";

// Present only on a custom-amount result.
export type CustomAmountInfo = {
  amount: number;
  min: number;
  max: number;
  // The verified amounts the estimates are interpolated between.
  anchors: [number, number];
  // True when `amount` lies outside `anchors`, so estimates extend the
  // line beyond the verified span rather than interpolating within it.
  extrapolated: boolean;
  // "live": every live-capable provider got a live quote; "partial": some
  // fell back to estimates; "unavailable": the live call failed entirely.
  liveStatus: "live" | "partial" | "unavailable";
  // Providers left out because only one verified amount is on file, so
  // there is no line to interpolate along -- listed rather than invented.
  notEstimated: string[];
};

// A provider row whose costPercent came out negative -- it appears to
// receive MORE than the live mid-market value implies, which no real
// remittance provider actually does (see docs/provider-data-sourcing.md's
// repeated "impossible negative cost" corrections, starting with the
// original COP incident). This is a request-time check nothing previously
// performed: rateAnomaly (above) only ever covers a rejected *FX-rate
// fetch* -- two consecutive live-rate reads disagreeing with each other.
// It says nothing about a manually-sourced provider row simply going
// stale against today's live rate, which is the actual, much more common
// cause here (confirmed 2026-09-17: 7 of 20 corridor+tier groups showed
// this, always at rank 1, always because of a >=1-week-old manual row --
// not a calculation bug, and not a swing in the FX fetch itself).
export type CostAnomalyProvider = {
  provider: string;
  costPercent: number;
  dateChecked: string;
  basis: RowBasis;
};

// A negative cost this small can be nothing more than the reference rate
// (Frankfurter publishes once a day) lagging a market that has moved since,
// so it isn't treated as an anomaly -- but only for rows that were quoted
// the same day, or just now (see withinFixingLagAllowance). Older rows get
// no allowance: they may simply be stale. See docs/provider-data-sourcing.md.
export const COST_ANOMALY_TOLERANCE = 0.005; // 0.5%

// Manual rows are dated with the operator's local calendar date (not UTC),
// so "same day" is judged in that zone. Rows written by the daily refresh use
// the UTC date; where the two disagree the row simply gets no allowance,
// which is the safe direction.
const ROW_DATING_TIMEZONE = "America/Los_Angeles";

export function todayInRowTimezone(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ROW_DATING_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function withinFixingLagAllowance(
  p: { costPercent: number; basis: RowBasis; dateChecked: string },
  today: string
): boolean {
  return (
    p.costPercent >= -COST_ANOMALY_TOLERANCE &&
    (p.basis === "live" || p.dateChecked === today)
  );
}

export type RankedProvidersResult = {
  sendCountry: string;
  receiveCountry: string;
  tier: Tier;
  liveRate: number;
  asOf: string;
  // True when liveRate/asOf came from a cached fallback because the live
  // FX fetch failed, not from a fresh request.
  rateStale?: boolean;
  // Present only when rateStale is true because getMidMarketRate rejected
  // a suspect swing (see lib/fx.ts), not a plain upstream fetch failure --
  // lets the UI/AI-insight layer explain *why* with real numbers instead
  // of just showing the generic "not live right now" state.
  rateAnomaly?: RateAnomaly;
  // Every provider in this corridor+tier with costPercent < 0, sorted
  // worst-first (most negative = most likely rank 1, since a negative
  // cost always looks "best" to the sort). Independent of rateStale/
  // rateAnomaly -- the live FX fetch can be perfectly fresh and correct
  // while a provider's own manually-sourced row is what's out of date.
  costAnomaly?: CostAnomalyProvider[];
  // Rows reading slightly below mid-market that were NOT raised as an
  // anomaly because they fall inside the fixing-lag allowance. Never shown
  // silently: the page notes them next to the live rate.
  lagAllowed?: { provider: string; costPercent: number }[];
  // Set only for custom amounts. For those, `tier` is the nearest preset
  // tier and is not meaningful to the UI.
  custom?: CustomAmountInfo;
  benchmark: {
    source: "wise" | "frankfurter";
    // True on corridors configured to benchmark against Wise, even when
    // the live fetch fell back to Frankfurter.
    wiseConfigured: boolean;
  };
  providers: RankedProvider[];
};

const corridors = providerData.corridors as Corridor[];
const providerRates = providerData.providerRates as ProviderRate[];

// A single string identifier for a corridor, derived from its send/receive
// pair rather than stored anywhere -- convenient at the edges (URL query
// params, Amplitude event properties, Buttondown tags) where a single
// opaque string is easier to pass around than two. Never treat this as the
// data model itself; the (sendCountry, receiveCountry) pair is.
export function corridorId(
  c: Pick<Corridor, "sendCountry" | "receiveCountry">
): string {
  return `${c.sendCountry}-${c.receiveCountry}`;
}

export function listCorridors(): Corridor[] {
  return corridors;
}

export function findCorridor(
  sendCountry: string,
  receiveCountry: string
): Corridor | undefined {
  return corridors.find(
    (c) => c.sendCountry === sendCountry && c.receiveCountry === receiveCountry
  );
}

export type CountryOption = { code: string; name: string };

// Distinct send countries across all corridors with real data -- used to
// seed the picker's first dropdown. Order follows corridors[] (JSON file
// order), matching how listCorridors() already behaves.
export function getAvailableSendCountries(): CountryOption[] {
  const seen = new Map<string, string>();
  for (const c of corridors) {
    if (!seen.has(c.sendCountry)) seen.set(c.sendCountry, c.sendCountryName);
  }
  return Array.from(seen, ([code, name]) => ({ code, name }));
}

// Receive countries actually paired with the given send country -- the
// picker's second dropdown is constrained to this, not the full receive
// country list, so a user can never land on an unresearched combination.
export function getReceiveCountriesFor(sendCountry: string): CountryOption[] {
  const seen = new Map<string, string>();
  for (const c of corridors) {
    if (c.sendCountry !== sendCountry) continue;
    if (!seen.has(c.receiveCountry)) seen.set(c.receiveCountry, c.receiveCountryName);
  }
  return Array.from(seen, ([code, name]) => ({ code, name }));
}

export async function getRankedProviders(
  sendCountry: string,
  receiveCountry: string,
  tier: Tier
): Promise<RankedProvidersResult> {
  const corridor = findCorridor(sendCountry, receiveCountry);
  if (!corridor) {
    throw new Error(
      `Unknown corridor: ${corridorId({ sendCountry, receiveCountry })}`
    );
  }

  // Live mid-market rate for this corridor's currency pair.
  const live = await getMidMarketRate(
    corridor.sendCurrency as SupportedCurrency,
    corridor.receiveCurrency
  );

  const rows = providerRates.filter(
    (r) =>
      r.sendCountry === sendCountry &&
      r.receiveCountry === receiveCountry &&
      r.tier === tier
  );

  const { providers, costAnomaly, lagAllowed, benchmarkSource } = rankRows(
    rows.map((r) => ({
      provider: r.provider,
      sendAmount: r.sendAmount,
      amountReceived: r.amountReceived,
      basis: "verified" as const,
      dateChecked: r.dateChecked,
      source: r.source,
    })),
    live
  );

  return {
    sendCountry,
    receiveCountry,
    tier,
    liveRate: live.rate,
    asOf: live.asOf,
    rateStale: live.stale,
    rateAnomaly: live.anomaly,
    costAnomaly,
    lagAllowed,
    benchmark: {
      source: benchmarkSource,
      wiseConfigured: usesWiseBenchmark(corridor.receiveCurrency),
    },
    providers,
  };
}

type UnscoredRow = Omit<RankedProvider, "costPercent" | "rank" | "benchmarkReference">;

// The one place rows get scored, ranked, and checked for anomalies -- used
// by both the preset tiers and custom amounts so the two can never rank
// differently for the same inputs.
function rankRows(
  rows: UnscoredRow[],
  live: { rate: number; source?: "wise" | "frankfurter" },
  today: string = todayInRowTimezone()
): {
  providers: RankedProvider[];
  costAnomaly: CostAnomalyProvider[] | undefined;
  lagAllowed: { provider: string; costPercent: number }[] | undefined;
  benchmarkSource: "wise" | "frankfurter";
} {
  const benchmarkSource = live.source ?? "frankfurter";
  const scored = rows.map((r) => ({
    ...r,
    // Fraction of the mid-market value lost to fees + FX margin.
    costPercent: 1 - r.amountReceived / (r.sendAmount * live.rate),
  }));
  const isReference = (p: { provider: string }) =>
    benchmarkSource === "wise" && p.provider === "Wise";

  const ranked: RankedProvider[] = scored
    .filter((p) => !isReference(p))
    .sort((a, b) => a.costPercent - b.costPercent)
    .map((p, i) => ({ ...p, rank: i + 1 }));
  const references: RankedProvider[] = scored
    .filter(isReference)
    .map((p) => ({ ...p, rank: 0, benchmarkReference: true }));

  const costAnomaly: CostAnomalyProvider[] = ranked
    .filter((p) => p.costPercent < 0 && !withinFixingLagAllowance(p, today))
    .sort((a, b) => a.costPercent - b.costPercent)
    .map((p) => ({
      provider: p.provider,
      costPercent: p.costPercent,
      dateChecked: p.dateChecked,
      basis: p.basis,
    }));

  const lagAllowed = ranked
    .filter((p) => p.costPercent < 0 && withinFixingLagAllowance(p, today))
    .map((p) => ({ provider: p.provider, costPercent: p.costPercent }));

  return {
    providers: [...ranked, ...references],
    costAnomaly: costAnomaly.length > 0 ? costAnomaly : undefined,
    lagAllowed: lagAllowed.length > 0 ? lagAllowed : undefined,
    benchmarkSource,
  };
}

// Custom-amount bounds. Fee structures (fixed minimums, markup caps) stop
// being roughly linear well outside the verified amounts, so estimates aren't
// defensible past these limits: from half the Everyday tier (so the Everyday
// amount itself stays selectable) up to 3x the Large tier.
export function customAmountRange(c: Pick<Corridor, "everydayAmount" | "largeAmount">) {
  return { min: Math.ceil(c.everydayAmount * 0.5), max: c.largeAmount * 3 };
}

export class CustomAmountRangeError extends Error {
  constructor(public min: number, public max: number) {
    super(`Amount must be between ${min} and ${max}`);
  }
}

// Ranking for an arbitrary amount. Wise/PayPal/Western Union get a live
// quote at exactly this amount; every other provider is linearly
// interpolated (or extrapolated, near the edges of the allowed range)
// between its own two verified tier rows and tagged "estimated". If the live
// call fails, the live providers fall back to the same labeled estimates.
export async function getCustomAmountRanking(
  sendCountry: string,
  receiveCountry: string,
  requestedAmount: number
): Promise<RankedProvidersResult> {
  const corridor = findCorridor(sendCountry, receiveCountry);
  if (!corridor) {
    throw new Error(`Unknown corridor: ${corridorId({ sendCountry, receiveCountry })}`);
  }

  // Whole currency units only: bounds the number of distinct cache keys a
  // client can force on the upstream API.
  const amount = Math.round(requestedAmount);
  const { min, max } = customAmountRange(corridor);
  if (!Number.isFinite(amount) || amount < min || amount > max) {
    throw new CustomAmountRangeError(min, max);
  }

  const [live, liveQuotes] = await Promise.all([
    getMidMarketRate(corridor.sendCurrency as SupportedCurrency, corridor.receiveCurrency),
    fetchLiveQuotes(corridor.sendCurrency, corridor.receiveCurrency, amount),
  ]);

  const corridorRows = providerRates.filter(
    (r) => r.sendCountry === sendCountry && r.receiveCountry === receiveCountry
  );
  const providerNames = Array.from(new Set(corridorRows.map((r) => r.provider)));
  const today = new Date().toISOString().slice(0, 10);

  const rows: UnscoredRow[] = [];
  const notEstimated: string[] = [];
  let liveCapable = 0;
  let liveGot = 0;

  for (const provider of providerNames) {
    const isLiveProvider = LIVE_PROVIDERS.includes(provider);
    if (isLiveProvider) liveCapable++;

    const liveAmount = isLiveProvider ? liveQuotes?.get(provider) : undefined;
    if (liveAmount !== undefined) {
      liveGot++;
      rows.push({
        provider,
        sendAmount: amount,
        amountReceived: liveAmount,
        basis: "live",
        dateChecked: today,
        source: `wise.com live comparison API, queried at ${amount} ${corridor.sendCurrency} -> ${corridor.receiveCurrency} just now.`,
      });
      continue;
    }

    const lo = corridorRows.find((r) => r.provider === provider && r.tier === "Everyday");
    const hi = corridorRows.find((r) => r.provider === provider && r.tier === "Large");
    if (!lo || !hi || lo.sendAmount === hi.sendAmount) {
      notEstimated.push(provider);
      continue;
    }
    const slope = (hi.amountReceived - lo.amountReceived) / (hi.sendAmount - lo.sendAmount);
    const estimated = lo.amountReceived + slope * (amount - lo.sendAmount);
    if (!(estimated > 0)) {
      notEstimated.push(provider);
      continue;
    }
    rows.push({
      provider,
      sendAmount: amount,
      amountReceived: Math.round(estimated * 100) / 100,
      basis: "estimated",
      // The older of the two checks the estimate rests on.
      dateChecked: lo.dateChecked < hi.dateChecked ? lo.dateChecked : hi.dateChecked,
      source:
        `Estimated, not checked at this amount: linear ` +
        `${amount >= lo.sendAmount && amount <= hi.sendAmount ? "interpolation" : "extrapolation"} ` +
        `between the verified ${lo.sendAmount} (${lo.dateChecked}) and ${hi.sendAmount} (${hi.dateChecked}) quotes.`,
    });
  }

  const { providers, costAnomaly, lagAllowed, benchmarkSource } = rankRows(rows, live);
  const nearestTier: Tier =
    Math.abs(amount - corridor.everydayAmount) <= Math.abs(amount - corridor.largeAmount)
      ? "Everyday"
      : "Large";

  return {
    sendCountry,
    receiveCountry,
    tier: nearestTier,
    liveRate: live.rate,
    asOf: live.asOf,
    rateStale: live.stale,
    rateAnomaly: live.anomaly,
    costAnomaly,
    lagAllowed,
    custom: {
      amount,
      min,
      max,
      anchors: [corridor.everydayAmount, corridor.largeAmount],
      extrapolated: amount < corridor.everydayAmount || amount > corridor.largeAmount,
      liveStatus:
        liveCapable === 0 || liveGot === 0
          ? "unavailable"
          : liveGot < liveCapable
            ? "partial"
            : "live",
      notEstimated,
    },
    benchmark: {
      source: benchmarkSource,
      wiseConfigured: usesWiseBenchmark(corridor.receiveCurrency),
    },
    providers,
  };
}

// --- Directory support (send-region grouping, freshness, cheapest teaser) ---
// Added for the home-page directory redesign -- corridors[] itself is
// unchanged; everything below derives from it or from providerRates.

export type Region = "North America" | "Europe" | "Gulf" | "Asia-Pacific" | "Other";

// Manual map, not a geo library -- only a handful of send countries exist
// today (see getAvailableSendCountries), and a new one added without a
// region entry here falls into "Other" rather than crashing (same
// fail-open philosophy as dynamicParams defaulting true elsewhere).
const SEND_REGIONS: Record<string, Region> = {
  US: "North America",
  CA: "North America",
  GB: "Europe",
  // Eurozone corridors are keyed by currency ("EUR"), not by member
  // country -- see the Corridor.sendCountry comment above.
  EUR: "Europe",
  AU: "Asia-Pacific",
};

export function getSendRegion(sendCountry: string): Region {
  return SEND_REGIONS[sendCountry] ?? "Other";
}

export type Freshness = "fresh" | "aging" | "stale";

// Shared fresh/aging/stale cutoff (7 / 30 days) for any single ISO
// "YYYY-MM-DD" dateChecked -- the one place this threshold is defined.
// getCorridorFreshness (whole-corridor, keyed to the oldest row) and the
// per-provider freshness badges on the compare page (keyed to that row's
// own date) both call this rather than each hardcoding the cutoffs.
export function freshnessLevelFor(dateChecked: string): Freshness {
  const days =
    (Date.now() - new Date(dateChecked).getTime()) / (1000 * 60 * 60 * 24);
  return days <= 7 ? "fresh" : days <= 30 ? "aging" : "stale";
}

// Tailwind utility class per level, generated by the --color-fresh/aging/
// stale tokens in app/globals.css's @theme inline block. Centralized here
// so the directory cards and the compare-page provider rows render the
// same dot color for the same level instead of two components each
// hand-rolling the mapping.
export const FRESHNESS_DOT_CLASS: Record<Freshness, string> = {
  fresh: "bg-fresh",
  aging: "bg-aging",
  stale: "bg-stale",
};

export type CorridorFreshness = {
  // The OLDEST dateChecked among this corridor's provider rows, not the
  // newest -- a corridor is only as trustworthy as its stalest row, and
  // surfacing the freshest one would overstate it (the same mistake the
  // "As-of column fix" in docs/provider-data-sourcing.md already corrected
  // once for the live FX timestamp vs. provider dates).
  oldestDateChecked: string;
  level: Freshness;
};

export function getCorridorFreshness(
  corridor: Pick<Corridor, "sendCountry" | "receiveCountry">
): CorridorFreshness | null {
  const rows = providerRates.filter(
    (r) =>
      r.sendCountry === corridor.sendCountry &&
      r.receiveCountry === corridor.receiveCountry
  );
  if (rows.length === 0) return null;

  // ISO "YYYY-MM-DD" strings sort correctly with plain string comparison.
  const oldestDateChecked = rows.reduce((oldest, r) =>
    r.dateChecked < oldest.dateChecked ? r : oldest
  ).dateChecked;

  return { oldestDateChecked, level: freshnessLevelFor(oldestDateChecked) };
}

export type CorridorTeaser = {
  cheapestProvider: string;
  costPercent: number;
  // Cheaper-looking rows skipped because they read below mid-market, which
  // no real provider does -- never headline those (see getCorridorTeaser).
  underReview: number;
} | null;

// Best (lowest-cost) Everyday-tier provider for a corridor, for the
// directory card teaser. Network-backed (live FX rate) like
// getRankedProviders itself -- wrapped so one corridor's FX fetch failing
// (e.g. a cold instance with no cached fallback yet, see lib/fx.ts) shows
// that one card without a teaser rather than failing the whole directory.
export async function getCorridorTeaser(corridor: Corridor): Promise<CorridorTeaser> {
  try {
    const result = await getRankedProviders(
      corridor.sendCountry,
      corridor.receiveCountry,
      "Everyday"
    );
    // The card headlines the cheapest provider whose rate is credible: a
    // row reading negative (better than mid-market) is a data problem, not
    // a deal, so it is skipped -- and counted, so the card can say so.
    const ranked = result.providers.filter((p) => !p.benchmarkReference);
    const top = ranked.find((p) => p.costPercent >= 0);
    if (!top) return null;
    return {
      cheapestProvider: top.provider,
      costPercent: top.costPercent,
      underReview: ranked.filter((p) => p.costPercent < 0).length,
    };
  } catch {
    return null;
  }
}

export type DirectoryEntry = {
  corridor: Corridor;
  region: Region;
  freshness: CorridorFreshness | null;
  teaser: CorridorTeaser;
};

// All corridors, grouped for the home-page directory. Teasers are fetched
// concurrently (Promise.all) rather than one-by-one -- with 12+ corridors
// sharing a handful of send currencies, Next's fetch cache/ISR window
// (lib/fx.ts's revalidate: 3600) means most of these resolve from cache
// rather than hitting the network independently.
export async function getDirectoryEntries(): Promise<DirectoryEntry[]> {
  const all = listCorridors();
  const teasers = await Promise.all(all.map((c) => getCorridorTeaser(c)));
  return all.map((c, i) => ({
    corridor: c,
    region: getSendRegion(c.sendCountry),
    freshness: getCorridorFreshness(c),
    teaser: teasers[i],
  }));
}
