// Round country flags from the circle-flags project (MIT, HatScripts), served as
// static SVG files from public/flags/ (only the countries the corridors use; the
// licence is public/flags/LICENSE.md). Rendered as a real <img>, not an emoji
// glyph: emoji flags don't render everywhere (Windows' font stack has no flag
// glyphs, so Chrome on Windows shows two plain letters, confirmed by screenshot
// 2026-10-02). It replaced the flag-icons package (rectangular flags as a CSS
// background) on 2026-10-22.
//
// Each file is its own document, so the SVGs' internal ids (<mask id="a">) can't
// clash between flags on one page, which they would if inlined. The flag is
// decoration: the country name is always written next to it, so alt is empty
// and it is hidden from assistive tech.
//
// Size follows the surrounding text (1em x 1em, circles are square); width and
// height attributes are only the intrinsic hint that stops layout shift.
// Coverage of every corridor country is checked by `npm run test:flags`.
import { flagSrc } from "./flag-code";

export function CountryFlag({ code, className = "" }: { code: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static SVGs; next/image adds nothing
    <img
      src={flagSrc(code)}
      alt=""
      aria-hidden="true"
      width={24}
      height={24}
      loading="lazy"
      decoding="async"
      className={`inline-block h-[1em] w-[1em] shrink-0 ${className}`}
    />
  );
}

// Alignment note: with the Bricolage heading face the circle's centre sits about
// 0.03em below the cap-height centre of the text next to it, so the corridor
// headings pass -translate-y-[0.03em]. Body-sized flags (Plus Jakarta Sans) are
// already centred.
