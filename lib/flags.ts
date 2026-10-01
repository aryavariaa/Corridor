// Flag emoji are two Unicode regional-indicator symbols, one per ISO
// 3166-1 alpha-2 letter -- computed rather than hand-typed so there's no
// risk of pasting the wrong flag for a country (every past review pass in
// docs/provider-data-sourcing.md has been about exactly this class of
// copy-paste mistake with data, so the same risk isn't worth taking with
// flags either).
const REGIONAL_INDICATOR_BASE = 0x1f1e6; // Unicode regional indicator 'A'

function regionalIndicator(letter: string): string {
  return String.fromCodePoint(
    REGIONAL_INDICATOR_BASE + (letter.toUpperCase().charCodeAt(0) - 65)
  );
}

// Eurozone corridors are keyed by the literal string "EUR" as sendCountry,
// not a member country (see the Corridor.sendCountry comment in
// lib/corridors.ts) -- "EU" is Unicode's own reserved, non-ISO-3166 region
// code for exactly this case, and renders as the EU flag everywhere flag
// emoji are supported.
const SPECIAL_CODES: Record<string, string> = { EUR: "EU" };

export function countryFlag(code: string): string {
  const iso = SPECIAL_CODES[code] ?? code;
  if (!/^[A-Za-z]{2}$/.test(iso)) return "";
  return regionalIndicator(iso[0]) + regionalIndicator(iso[1]);
}
