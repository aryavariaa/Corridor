# Design system

Last revised 2026-10-22 (coral palette, light and dark themes, home hero scene, tunnel logo, circle flags, accessible
country dropdown). This file describes what the code does now; the history of how it got here is at the end.

## Themes

Two themes, **light** and **dark**, swapped by tokens only: everything reads CSS variables, and nothing else branches
on the theme. (This reverses the 2026-10-07 single-light-theme decision; see History.)

- `:root` holds the light tokens; `:root[data-theme="dark"]` holds the dark ones. A second copy of the dark tokens sits
  in a `@media (prefers-color-scheme: dark)` block that applies only while no theme is set, so a visitor with
  JavaScript off still gets the OS theme. **Keep the two dark blocks in sync.**
- `app/layout.tsx` has an inline script in `<head>` that sets `data-theme` before first paint: the stored choice
  (`localStorage` key `theme`, every access in try/catch), else the OS preference. It also preloads the right hero
  image (below). There is no flash (checked: the theme is correct at first contentful paint with a stored choice,
  with only the OS preference, and with both disagreeing).
- Pages stay static: nothing reads cookies or headers; the theme is applied in the browser.
- `app/ThemeToggle.tsx` (in `SiteHeader`) is a real button, 44px, labelled with the action ("Switch to dark theme"),
  with sun/moon icons. It reads `data-theme` through `useSyncExternalStore`, so server and first client render match.
- `.scope-light` re-declares the light tokens on any element that must stay light inside a dark page. The hero's
  form bar uses it (see Hero).

## Tokens

Token **names are from the green version and were kept** (`--lime`, `--forest`, `--mint`). Read them as roles.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--bg` | `#ffffff` | `#0b1220` | page |
| `--bg-soft` | `#f6f9fc` | `#101828` | quiet surfaces |
| `--card` / `--card-border` | `#ffffff` / `#e3e8ee` | `#131c2e` / `#243049` | cards and their borders |
| `--forest` (class `brand`) | `#0a2540` | `#f2f5f9` | **ink**: headings, wordmark, text on tints |
| `--surface-strong` | `#0a2540` | `#1a2a4a` | the dark cards (head-to-head verdict, compare bar) |
| `--on-strong-accent` | `#ffa58c` | `#ffa58c` | emphasis text on a strong surface |
| `--lime` (class `accent`) | `#ff6b4a` | `#ff6b4a` | the coral accent fill: buttons, Best value, Live |
| `--lime-hover` | `#ff8a6a` | `#ff8a6a` | hover for the fill (lighter than the fill in both themes) |
| `--on-accent` | `#0a2540` | `#0a2540` | text on the accent fill: **navy, never white** |
| `--mint` / `--mint-deep` | `#fff1ec` / `#ffd9cc` | `#1b2438` / `#26324d` | soft tints (hover, selected, pills) |
| `--text` / `--text-dim` / `--text-faint` | `#0a2540` / `#425466` / `#5b6b80` | `#f2f5f9` / `#aab6c6` / `#8d9bb0` | text hierarchy |
| `--link`, `--cost` | `#b93815` | `#ffa58c` | links; the cost percentage (and nothing else) |
| `--ring` | `#0a2540` | `#f2f5f9` | focus ring |
| `--warn-text` / `-bg` / `-bg-strong` / `-border` | `#78350f` / `#fffbeb` / `#fef3c7` / `#fcd34d` | `#fcd34d` / `#2b2511` / `#3a3114` / `#6b5a1d` | "Under review", estimates, notices |
| `--danger` / `-bg` / `-border` | `#b91c1c` / `#fef2f2` / `#fca5a5` | `#ff7a95` / `#2d1519` / `#6b2a31` | errors |
| `--logo-tile` / `--logo-arch` | `#0a2540` / `#ffffff` | `#ffffff` / `#0a2540` | the logo |
| `--hero-top`, `--hero-top-bar`, `--hero-em`, `--hero-sub` | `#76c0fc`, a gradient sampled from the scene's top edge, `#b93815`, `#425466` | `#0a1d41`, its night counterpart, `#ff8a6a`, `#d3dbe7` | hero only |

**The `--forest` split.** `--forest` used to be both text ink and a navy card background. In dark, ink must be light
and the card must stay dark, so the card role is `--surface-strong` (`bg-surface-strong`) and `--forest` is ink only
(`text-brand`, `bg-brand` for small ink dots). Text on a strong surface is white (`text-white`, `text-white/85`) or
`--on-strong-accent`.

**The coral rule.** White on the coral fill is 2.82 and fails; coral as text on a light surface is also 2.82. So text
on the fill is navy, and link/cost text in the light theme is the darker `#b93815`. In dark, coral works as text.

**Semantic classes.** Notices and errors use `text-warn`, `bg-warn-bg`, `border-warn-border`, `text-danger`,
`bg-danger-bg`, `border-danger-border` instead of Tailwind's amber and red, so they adapt. Amber (yellow) and the coral
accent are different hues in both themes; in dark, the danger text (salmon pink) and the coral link colour are close,
and an error is told apart by its icon and wording, not hue (see ErrorMessage).

### Contrast (computed, WCAG; not eyeballed)

Light: ink/white 15.54, dim/white 7.80, faint/white 5.44, faint/bg-soft 5.15, navy/coral 5.52 (hover fill 6.73), ink/tint 14.09,
ink/tint-deep 11.87, link and cost/white 5.77 (on tint 5.23), danger/white 6.47 (on its box 5.91), warn/box 8.75,
white/surface-strong 15.54, on-strong-accent/surface-strong 8.15.

Dark: text/bg 17.12, text/card 15.57, dim/bg 9.11, dim/card 8.28, faint/bg 6.64, faint/card 6.04, navy/coral 5.52 (hover fill 6.73),
link and cost/bg 9.82 (card 8.93), danger/card 6.87 (bg 7.55, box 6.87), warn/box 10.59, white/surface-strong 14.25,
on-strong-accent/surface-strong 7.47.

The hover fill is **lighter** than the base coral in both themes (`#ff8a6a`): navy on it is 6.73, where the earlier
darker hover (`#e85a3a`) measured 4.41 and failed 4.5 for the button text. (Changed 2026-10-22.)

A DOM audit across `/`, US to India, EUR to Bangladesh, two head-to-head pages, `/methodology` and the 404, in both
themes at 1440 and 390 wide, found no text pairing under 4.5 (3.0 for large text), apart from text over the hero
artwork, which was measured separately from screenshots (below).

## Hero (home page)

Two raster scenes with the same composition, day for light and night for dark, so the toggle only changes lighting.
They live in `public/hero/`: `scene-{light,dark}-1x.webp` (1440x900), `scene-{light,dark}.webp` (2880x1800) and
`scene-{light,dark}-4k.webp` (3840x2400). The hero is a CSS background, not an `<img>`, so the headline stays real
text. `--hero-top` is the solid sky colour behind it, so there is no white flash while it loads; the header row on `/`
is painted with `--hero-top-bar` so it and the artwork meet without a seam.

**Which file loads** (one request per page; mirrored by the preload script in `app/layout.tsx`):

| Display | Width | File |
| --- | --- | --- |
| 1x | up to 1440 CSS px | 1x (1440) |
| 1x | 1441 to 2880 | 2880 |
| 1x | over 2880 | 4k |
| 2x or more | up to 1600 | 2880 |
| 2x or more | over 1600 | 4k |

Replacing a file under the same name needs no code change; only the 16:10 aspect matters.

**Layout.** From 1024px up the hero's height tracks the width (62.5vw, clamped 760 to 1400px; 900px at 1440), and the
headline block and the form bar are placed by fractions of that height, so they keep their place against the artwork
(bar at 55.6% of the height). The bar is 800px wide so it clears the village. The bottom 40px fade into `--bg`
(the night scene already ends on `#0b1220`). **Under 1024px** the copy and the stacked form fill the screen and the
full scene would put its planes and the moon behind the headline, so only the lower 500 of the 900 rows are used,
as a band under the form (road, traveller, village, coins), fading into the plain sky above it.

**Form bar.** Frosted glass (`.glass-bar`), light in both themes, carrying `.scope-light` so its text, borders and focus
ring never pick up dark tokens. Solid-ish fallback where `backdrop-filter` is missing. The Compare button is black
(`.btn-hero`) with white text and reads in both themes because it sits on the light bar.

**Honest copy.** The chip reads "Wise and Western Union refreshed daily, 06:17 UTC" and links to `/methodology`; its
tooltip adds that PayPal is refreshed where the feed carries it and hand-entered (with its date) elsewhere. The time
comes from the schedule in `aws/template.yaml` (`cron(17 6 * * ? *)`), confirmed on the deployed stack. There are no
floating "rates updated" or "best value" tabs and no computed-rate claims in the hero. "Free to use" and "No account
needed" hold site-wide (no sign-in or paywall exists).

Text over the artwork (measured on screenshots): subline at least 5.06 (light) and 6.31 (dark); headline ink at least
8.78 (light) and 9.96 (dark); the coral italic words at least 3.26 (light, large text) and 4.53 (dark).

## Logo

"Tunnel" (chosen 2026-10-21): two concentric arches and a door. `Mark` in `app/Wordmark.tsx` draws it from path data
with the tile and arches on `--logo-tile` / `--logo-arch`, so it inverts with the theme; the door is coral
`#ff6b4a`. `app/opengraph-image.tsx` uses the dark variant, hard-coded (satori cannot read CSS variables).
`app/icon.svg` is the light variant **without the inner arch**: at 16px the inner arch and the door blur together, so
the favicon is the outer arch plus a larger door. The two share one path set otherwise.

## Flags

Round flags from the circle-flags project (MIT, HatScripts), served as static SVGs from `public/flags/` (only the 19
the corridors use; licence in `public/flags/LICENSE.md`). `CountryFlag` in `lib/flags.tsx` renders a lazy `<img>` sized
`1em x 1em`, with empty alt (the name is always next to it). `lib/flag-code.ts` maps a corridor country code to its file
(`EUR` is `eu`). `npm run test:flags` fails if any corridor country has no file or a file has active content. The
`flag-icons` package is gone. Headings with the Bricolage face nudge the flag up `0.03em` so the circle's centre matches
the text's cap-height centre.

## Country dropdown

`app/CountrySelect.tsx` replaces the native From and To `<select>` on the home form: a select-only combobox per
WAI-ARIA APG. Trigger `role="combobox"` with `aria-expanded`, `aria-controls` and `aria-haspopup="listbox"`; a
`role="listbox"` of `role="option"` items with `aria-selected`; focus stays on the trigger and
`aria-activedescendant` names the highlighted option. Keys: Enter, Space, Up or Down open; Up, Down, Home, End,
PageUp, PageDown move; Enter or Space chooses; Escape closes (focus stays on the trigger); Tab closes and moves on
without changing the value; letters jump to the next country that starts with them. The visible `<label>` is bound to
the trigger and clicking it focuses without opening. A pointer-down outside closes it. Each option shows its circle
flag and name, and the first option, "Select", clears the choice. The list layers above the hero (`z-50`, max height
with scroll, selected option scrolled into view) and is a light surface in both themes because the bar is
`.scope-light`. **Small screens:** the custom list was tested at 390px with touch (opens on tap, fits the screen,
scrolls, selects, no horizontal page scroll), so there is **no native fallback**. What "To" offers (only countries that
pair with the chosen "From") and the reset of a stale "To" when "From" changes live in `HomeDirectory`, unchanged.

## ErrorMessage

`app/ErrorMessage.tsx`: error text never relies on colour alone. It shows an alert icon and a visually hidden "Error:"
and uses `--danger`. Used for the home form's amount error, the "Set your own amount" error, the rate-alert signup
error and the "couldn't reach the live rate feed" box; notices about something that failed (couldn't price an amount,
stale rate, rate history unavailable) carry the same icon and "Error:" via a `failure` flag.

## Fonts

- **Bricolage Grotesque** (headings, big numbers, wordmark): a variable face with real weight up to 800.
- **Plus Jakarta Sans** (body, labels, table cells).

Numerals matter in a rates app, so tabular figures were **measured in the browser, not assumed** (render
"1111111111" and "0000000000" with `tabular-nums` and compare widths). DM Sans was the first body pick and failed:
125px vs 274px, so columns of amounts would not line up. Plus Jakarta Sans measures 240px for both. If you change
the body font, repeat that measurement.

## Components

`app/globals.css` holds the button classes (`btn-primary`, `btn-secondary`) in `@layer components`, so Tailwind
utilities on the same element (`px-6`, `whitespace-normal`) override them as you'd expect. Unlayered rules would
silently beat the utilities. `.btn-hero` (black, for the hero bar) is unlayered on purpose so it wins over `.btn-primary`.

## Layout rules that came out of the work

- The amount lives on the homepage and rides to every corridor as `?amount=`; corridor and head-to-head pages
  price it live. State is derived (amount wanted vs amount held), so a skeleton shows while loading instead of
  default-amount numbers under the wrong label.
- Statically rendered pages that read the URL use `useSearchParams` inside Suspense, with the *same page without a
  URL amount* as the fallback, so the static HTML still contains the whole page.
- Client components import small values from pure modules (`lib/amount`, `lib/corridor-id`, `lib/freshness`,
  `lib/row-breakdown`, `lib/provider-slug`, `lib/versus`), never from `lib/corridors.ts`, which carries the data
  file. A build check confirms no data strings reach a client chunk.
- "Live" on the corridor page means the benchmark rate is live. Each row says what backs its own number (Live quote,
  Estimated, or a hand-check date). Hand-sourced rows always keep their date.

## History

- 2026-10-07: one light theme; dark mode, its toggle and the theme script removed ("one theme designed properly beats
  two that each got half the attention"). Direction was lime on forest green with mint tints.
- 2026-10-22: recoloured to Stripe-style indigo, colours only.
- 2026-10-22: **reversed the single-theme decision** at the owner's request. Coral palette, a day scene and a night
  scene on the home page, so both themes are back as a token swap. Logo changed from the indigo "route" mark to the
  tunnel, flags from rectangular `flag-icons` to circle-flags, and the From/To `<select>` to the accessible dropdown.
