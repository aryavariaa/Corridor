import providerData from "@/data/provider-data.json";
import { getMidMarketRate, type SupportedCurrency } from "@/lib/fx";

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
  rank: number;
  dateChecked: string;
  source: string;
};

export type RankedProvidersResult = {
  sendCountry: string;
  receiveCountry: string;
  tier: Tier;
  liveRate: number;
  asOf: string;
  // True when liveRate/asOf came from a cached fallback because the live
  // FX fetch failed, not from a fresh request.
  rateStale?: boolean;
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

  const providers: RankedProvider[] = rows
    .map((r) => ({
      provider: r.provider,
      sendAmount: r.sendAmount,
      amountReceived: r.amountReceived,
      // Fraction of the mid-market value lost to fees + FX margin.
      costPercent: 1 - r.amountReceived / (r.sendAmount * live.rate),
      dateChecked: r.dateChecked,
      source: r.source,
    }))
    .sort((a, b) => a.costPercent - b.costPercent)
    .map((p, i) => ({ ...p, rank: i + 1 }));

  return {
    sendCountry,
    receiveCountry,
    tier,
    liveRate: live.rate,
    asOf: live.asOf,
    rateStale: live.stale,
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
  AE: "Gulf",
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
    const top = result.providers[0];
    if (!top) return null;
    return { cheapestProvider: top.provider, costPercent: top.costPercent };
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
