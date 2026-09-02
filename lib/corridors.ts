import providerData from "@/data/provider-data.json";
import { getMidMarketRate, type SupportedCurrency } from "@/lib/fx";

export type Tier = "Everyday" | "Large";

export type Corridor = {
  id: string;
  sourceCountry: string;
  sourceCurrency: string;
  destCountry: string;
  destCurrency: string;
  everydayAmount: number;
  largeAmount: number;
};

export type ProviderRate = {
  corridorId: string;
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
  corridorId: string;
  tier: Tier;
  liveRate: number;
  asOf: string;
  providers: RankedProvider[];
};

const corridors = providerData.corridors as Corridor[];
const providerRates = providerData.providerRates as ProviderRate[];

export function listCorridors(): Corridor[] {
  return corridors;
}

export function findCorridor(corridorId: string): Corridor | undefined {
  return corridors.find((c) => c.id === corridorId);
}

export async function getRankedProviders(
  corridorId: string,
  tier: Tier
): Promise<RankedProvidersResult> {
  const corridor = findCorridor(corridorId);
  if (!corridor) {
    throw new Error(`Unknown corridor: ${corridorId}`);
  }

  // Live mid-market rate for this corridor's currency pair.
  const live = await getMidMarketRate(
    corridor.sourceCurrency as SupportedCurrency,
    corridor.destCurrency
  );

  const rows = providerRates.filter(
    (r) => r.corridorId === corridorId && r.tier === tier
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
    corridorId,
    tier,
    liveRate: live.rate,
    asOf: live.asOf,
    providers,
  };
}
