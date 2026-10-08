# Design system (2026-10-07)

One light theme. Dark mode, its toggle, the `[data-theme]` attribute and the pre-hydration theme script were removed
on purpose: one theme designed properly beats two that each got half the attention.

## Direction

Bright, simple and catchy (the "Wise" end of the brief, not the Revolut end): **lime on deep forest green, with mint
tints**. Inspiration only; the wordmark, mark and every asset are Corridor's own.

| Token | Value | Use |
| --- | --- | --- |
| `--forest` / `brand` | `#163300` | wordmark, headings, text on lime |
| `--lime` / `accent` | `#9fe870` | primary buttons, Best value, Live badge |
| `--mint` | `#e2f6d5` | soft fills, hero wash |
| `--text` / `--text-dim` / `--text-faint` | `#0e0f0c` / `#454745` / `#6a6d66` | text hierarchy |
| `--link` | `#1a5c00` | links |
| `--cost` | `#17700a` | the cost percentage, and nothing else |

Contrast was computed, not eyeballed. Lowest text pairing: faint on soft background, 4.9:1 (AA is 4.5).
ink/white 19.2, dim/white 9.4, forest/lime 9.5, forest/mint 12.2, link/white 8.2, cost/white 6.3.

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
silently beat the utilities. `hero-wash` is the homepage's mint/lime background, pure CSS.

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
