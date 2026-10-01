// SVG country flags via the flag-icons package (CSS + bundled SVGs, MIT,
// no JS -- https://github.com/lipis/flag-icons), rendered as a
// background-image on a <span class="fi fi-xx">, not an emoji glyph.
// Emoji flags don't render everywhere: Windows' font stack has no flag
// glyphs, so Chrome on Windows shows the raw two-letter code as plain text
// instead of a picture (confirmed by screenshot, 2026-10-02) -- a
// long-standing platform gap, not something fixable in this app's own
// code. The stylesheet is imported once, globally, in app/globals.css.

// Eurozone corridors are keyed by the literal string "EUR" as sendCountry,
// not a member country (see the Corridor.sendCountry comment in
// lib/corridors.ts) -- flag-icons ships a dedicated "eu" flag for exactly
// this case.
const SPECIAL_CODES: Record<string, string> = { EUR: "eu" };

export function flagIconClass(code: string): string {
  const iso = (SPECIAL_CODES[code] ?? code).toLowerCase();
  return `fi fi-${iso}`;
}

export function CountryFlag({
  code,
  className = "",
}: {
  code: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`${flagIconClass(code)}${className ? ` ${className}` : ""}`}
    />
  );
}
