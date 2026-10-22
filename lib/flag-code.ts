// Which flag file in public/flags/ a corridor country code uses. Plain module (no
// JSX, no Next aliases) so lib/flags.test.mjs can check coverage against the data.
//
// Eurozone corridors are keyed by the literal string "EUR" as sendCountry, not a
// member country (see the Corridor.sendCountry comment in lib/corridors.ts), and
// circle-flags ships a dedicated "eu" flag for exactly this case.
const SPECIAL_CODES: Record<string, string> = { EUR: "eu" };

export function flagFile(code: string): string {
  return (SPECIAL_CODES[code] ?? code).toLowerCase();
}

export function flagSrc(code: string): string {
  return `/flags/${flagFile(code)}.svg`;
}
