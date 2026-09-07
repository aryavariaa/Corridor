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
  sendCountry: string; // ISO 3166-1 alpha-2, e.g. "US"
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
