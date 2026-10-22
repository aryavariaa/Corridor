# Design system (2026-10-07)

One light theme. Dark mode, its toggle, the `[data-theme]` attribute and the pre-hydration theme script were removed
on purpose: one theme designed properly beats two that each got half the attention.

## Direction

Recoloured 2026-10-22 from green to a Stripe-style **indigo**: white text on an indigo accent, deep navy ink, cool
grey surfaces, pale indigo tints. The green read as another site's brand. Layout, type, spacing and shapes did not
change. Inspiration only; the wordmark, mark and every asset are Corridor's own.

**Token names are the green version's and were kept on purpose** (`--lime`, `--forest`, `--mint`) to keep the change
small. Read them as roles: `--lime` is the indigo accent fill, `--forest` the navy brand ink, `--mint` the pale tint.

| Token | Value | Use |
| --- | --- | --- |
| `--forest` / `brand` | `#0a2540` | wordmark, headings, navy cards |
| `--lime` / `accent` | `#635bff` | primary buttons, Best value, Live badge (hover `#5048e5`) |
| `--on-accent` / `accent-contrast` | `#ffffff` | text on the accent fill |
| `--mint` / `--mint-deep` | `#efedff` / `#dad7ff` | soft tints, hero wash; `--mint-deep` is also emphasis text on navy |
| `--bg-soft` / `--card-border` | `#f6f9fc` / `#e3e8ee` | cool grey surfaces and borders |
| `--text` / `--text-dim` / `--text-faint` | `#0a2540` / `#425466` / `#5b6b80` | text hierarchy |
| `--link` | `#4338ca` | links |
| `--cost` | `#4338ca` | the cost percentage, and nothing else |

Contrast was computed, not eyeballed: ink/white 15.5, dim/white 7.8, faint/white 5.4, faint/soft 5.1, white/accent
4.7 (hover 6.2), ink/tint 13.5, link/white 7.9, cost/white 7.9. **White on the accent (4.7) is the tightest pairing,
so keep text on the accent fill to bold button and badge text.** Dark ink on the accent is only 3.3, so never put it
there. On navy cards use white or `--mint-deep` (11.2); the accent itself is 3.3 on navy.

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
silently beat the utilities. `hero-wash` is the homepage's pale-indigo background with an accent glow, pure CSS.

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
