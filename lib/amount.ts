// The amount a visitor wants to send: the one place its limits, parsing and
// error wording live. Pure (no data, no fetch, no Next aliases) so the
// homepage, the corridor page and the API route can all share it, and so it
// can be unit-tested directly (lib/amount.test.mjs).
//
// The range is flat, not per corridor: every send currency is one of
// USD/GBP/EUR/AUD/CAD, close enough in value that one range fits them all.
// $10 is the lowest amount the live feed quotes the enabled providers at (at
// $1 it returns none for USD or AUD sends). $50,000 is where Wise's quote still
// exists on every corridor probed; PayPal and some Western Union quotes drop
// out well before it, and those rows are then left out rather than estimated.
// Details: lib/corridors.ts (CUSTOM_AMOUNT_MIN / getCustomAmountRanking).

export const AMOUNT_MIN = 10;
export const AMOUNT_MAX = 50000;

// The query parameter that carries the amount from the homepage to a corridor
// page and back ("/compare/US/IN?amount=500").
export const AMOUNT_PARAM = "amount";

export type ParsedAmount =
  | { ok: true; value: number }
  | { ok: false; empty: boolean; message: string | null };

function whole(currency: string, n: number): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${n.toLocaleString("en-US")} ${currency}`;
  }
}

// Accepts "500", "1,500", " 1 500 ". Rounds to a whole unit (fees are quoted
// to the unit, and a cached quote keyed on 500.4 helps nobody).
export function parseAmount(text: string, currency: string): ParsedAmount {
  const cleaned = text.replace(/[,\s]/g, "");
  if (cleaned === "") return { ok: false, empty: true, message: null };
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, empty: false, message: "Enter a positive number." };
  }
  const rounded = Math.round(value);
  if (rounded < AMOUNT_MIN || rounded > AMOUNT_MAX) {
    return {
      ok: false,
      empty: false,
      message: `Enter an amount between ${whole(currency, AMOUNT_MIN)} and ${whole(currency, AMOUNT_MAX)}.`,
    };
  }
  return { ok: true, value: rounded };
}

// "?amount=500" for a valid amount, "" otherwise. Used to build links.
export function amountQuery(amount: number | null): string {
  return amount !== null && amount >= AMOUNT_MIN && amount <= AMOUNT_MAX
    ? `?${AMOUNT_PARAM}=${Math.round(amount)}`
    : "";
}

// The amount in a URL's query string, or null when absent or out of range.
// Takes the raw search string ("?amount=500&x=1") so callers can pass
// window.location.search without pulling in useSearchParams (which would
// force a Suspense boundary around statically rendered pages).
export function amountFromSearch(search: string): number | null {
  const raw = new URLSearchParams(search).get(AMOUNT_PARAM);
  if (raw === null) return null;
  const parsed = parseAmount(raw, "USD");
  return parsed.ok ? parsed.value : null;
}
