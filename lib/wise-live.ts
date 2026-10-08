// Live quotes for the three API-backed providers (Wise, PayPal, Western
// Union) at an arbitrary send amount, from the same Wise Comparison API the
// daily refresh uses (scripts/lib/refresh-core.mjs). Server-side only.
//
// The fetch is cached for CACHE_SECONDS by Next's data cache, which keys on
// the full URL -- i.e. on corridor currencies + amount -- so repeated or
// nearby requests don't each hit Wise. Returns null on any failure (network,
// timeout, non-200, malformed body) so callers can fall back to labeled
// estimates instead of breaking the page.

import { parseIsoDurationMinutes } from "@/lib/row-breakdown";

export const LIVE_PROVIDERS = ["Wise", "PayPal", "Western Union"];

// What a live quote gives beyond the amount. rate/fee/delivery are absent when
// the API didn't state them (it states a delivery time only for Wise).
export type LiveQuote = {
  receivedAmount: number;
  fee?: number;
  rate?: number;
  deliveryMinMinutes?: number;
  deliveryMaxMinutes?: number;
};

const CACHE_SECONDS = 90;
const TIMEOUT_MS = 5000;

// Mirrors EUR_SOURCE_COUNTRY_PREFERENCE in scripts/lib/refresh-core.mjs: for
// EUR the API returns one quote per Eurozone origin country.
const EUR_SOURCE_COUNTRY_PREFERENCE = ["ES", "IT", "DE", "FR", "EE"];

type WiseQuote = {
  receivedAmount?: number;
  sourceCountry?: string | null;
  fee?: number;
  rate?: number;
  deliveryEstimation?: { duration?: { min?: string; max?: string } | null } | null;
};
type WiseResponse = { providers?: { name: string; quotes?: WiseQuote[] }[] };

function pickQuote(quotes: WiseQuote[], sendCurrency: string): WiseQuote | null {
  if (quotes.length === 0) return null;
  if (quotes.length === 1) return quotes[0];
  if (sendCurrency === "EUR") {
    for (const cc of EUR_SOURCE_COUNTRY_PREFERENCE) {
      const match = quotes.find((q) => q.sourceCountry === cc);
      if (match) return match;
    }
  }
  return quotes[0];
}

// provider name -> the quote (amount the recipient gets, fees included, plus
// fee / rate / delivery where given), for whichever of LIVE_PROVIDERS the API
// returned a usable quote for at this amount.
//
// targetCountry matters whenever more than one country shares a currency --
// the same issue fixed in scripts/lib/refresh-core.mjs (2026-10-01):
// omitting it for a currency like EUR doesn't return some blended quote, it
// silently returns Germany's, no matter which Eurozone corridor the caller
// actually asked about. This is a separate code path from the daily
// refresh (that one writes data/provider-data.json; this one answers a
// live request), so it needed the same fix made independently here.
export async function fetchLiveQuotes(
  sendCurrency: string,
  receiveCurrency: string,
  amount: number,
  targetCountry: string
): Promise<Map<string, LiveQuote> | null> {
  try {
    const res = await fetch(
      `https://api.wise.com/v3/comparisons/?sourceCurrency=${sendCurrency}&targetCurrency=${receiveCurrency}&sendAmount=${amount}&targetCountry=${targetCountry}`,
      { next: { revalidate: CACHE_SECONDS }, signal: AbortSignal.timeout(TIMEOUT_MS) }
    );
    if (!res.ok) throw new Error(`Wise comparison request failed: ${res.status}`);
    const data: WiseResponse = await res.json();
    if (!Array.isArray(data.providers)) throw new Error("Unexpected Wise response shape");

    const out = new Map<string, LiveQuote>();
    for (const name of LIVE_PROVIDERS) {
      const entry = data.providers.find((p) => p.name === name);
      const quote = entry ? pickQuote(entry.quotes ?? [], sendCurrency) : null;
      const received = quote?.receivedAmount;
      if (typeof received === "number" && Number.isFinite(received) && received > 0) {
        const min = parseIsoDurationMinutes(quote?.deliveryEstimation?.duration?.min);
        const max = parseIsoDurationMinutes(quote?.deliveryEstimation?.duration?.max);
        out.set(name, {
          receivedAmount: received,
          ...(typeof quote?.fee === "number" ? { fee: quote.fee } : {}),
          ...(typeof quote?.rate === "number" ? { rate: quote.rate } : {}),
          ...(min !== null && max !== null ? { deliveryMinMinutes: min, deliveryMaxMinutes: max } : {}),
        });
      }
    }
    return out;
  } catch (err) {
    console.error(
      `Live quote fetch failed for ${sendCurrency}->${receiveCurrency} @ ${amount}, falling back to estimates`,
      err
    );
    return null;
  }
}
