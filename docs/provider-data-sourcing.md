# Provider data sourcing

`data/provider-data.json`'s `providerRates` is a static, manually-researched snapshot for
every provider — there is no automated fetch pipeline for provider fees/rates anywhere in
this app. (The one live-fetched number in Corridor is the mid-market FX rate in `lib/fx.ts`,
used only to compute each provider's `costPercent` for ranking — it is not provider-specific.)

The original six providers (Wise, Revolut, Remitly, Western Union, PayPal, XE) were added in
one commit as "verified provider seed data," all dated 2026-09-01, with no confidence/method
notes preserved. This doc exists so the next six don't lose that context.

## Confidence levels used below

- **High** — a live quote pulled directly from the provider's own calculator/send-money flow,
  at or very near the app's actual send amount.
- **Medium** — either a live quote from a third-party aggregator/comparison site, or the
  provider's own flat fee applied to the app's send amount without re-confirming the fee
  doesn't change at that amount, or a rate reconstructed from two separately-sourced official
  documents (rate page + fee schedule) rather than one single quote.
- All entries dated 2026-09-07 unless noted.

## Data quality correction — 2026-09-08

Five rows added in the original six-provider batch produced an impossible negative
`costPercent` in `lib/corridors.ts` (a provider appearing to beat the live mid-market rate,
which no real remittance provider does): Ria's C3 (USD→MXN) and C4/C5 (COP corridors,
Everyday tier), and MoneyGram's C1 (USD→INR, both tiers).

**Root cause: bad source data, not a formula bug.** `getRankedProviders()`'s cost formula
(`1 - amountReceived / (sendAmount * liveRate)`) was checked against this app's own published
methodology (`app/methodology/page.tsx`) and matches it exactly — a negative result is the
formula correctly reporting that a row's `amountReceived` is inconsistent with any real
provider margin. Diagnosis method: for every row in a corridor+tier group, compute the implied
rate (`amountReceived / sendAmount`) and compare it against the peer cluster. The five bad rows
each implied a rate 8%+ better than every other provider in the same group — outside any
realistic FX-margin range and a strong signal of bad source data, confirmed by re-sourcing
each one from a live, first-party quote (see the Ria and MoneyGram sections above for what
replaced them). A repeatable version of this check now lives in the verification step run
before every data change to this file — flag anything where one provider beats its peer
cluster's best implied rate by more than ~8%, and re-verify before trusting it.

**Methodology reminder surfaced during re-verification:** several providers show a special,
better first-transfer/promotional rate that reverts to a standard rate on repeat use. This
app's methodology already calls for the standard (non-promotional) rate, but the MoneyGram
re-check found this had actually gone wrong in the original data — the $200 quote captured was
promo-rate-tainted (95.76 INR/USD) while a $2000 quote from the same session, not promo-boosted
on rate, gave a clean standard rate (94.4681 INR/USD, i.e. 188,936.20 ÷ 2000). The corrected
$200 figure (18,893.62) is derived from that clean rate rather than the tainted raw quote.
Anywhere a provider's own site shows a struck-through "standard" rate next to a highlighted
promo rate (as Ria's does), that's the reliable signal to use — a raw top-line number by itself
isn't enough to assume it's promo-free.

## WorldRemit — high confidence

Live quotes pulled directly from worldremit.com's own send-money calculator for each corridor
(bank transfer, no account needed). C1–C5 covered. **C6 (AED→INR) not supported** — confirmed
via WorldRemit's own send-from country list; UAE isn't on it.

Flag: moneytransfers.com's WorldRemit review cites higher fees ($2.99 vs. the $0.99 captured
live) — could be a live promo or a stale review; re-check before treating fee as fixed.

## Paysend — medium confidence

Live default-quote captured from paysend.com's own per-corridor pages. Paysend's fee is
documented as flat regardless of transfer size, so the same captured fee was applied to both
tiers per corridor — not independently re-verified at the exact $200/$2000-equivalent amounts
due to a redirect bug in Paysend's interactive amount field. C1–C5 covered. **C6 (AED→INR) not
supported** — confirmed via Paysend's own supported-countries page (UAE is receive-only).

Flag: some third-party review sites cite a different flat-fee schedule ($2/£1/€1.50) than what
Paysend's live corridor pages actually showed. Treat the live per-corridor figures as more
current, but worth a spot re-check.

## MoneyGram — medium confidence, largest caveats

MoneyGram's own site blocks automated access entirely (no working authenticated flow available
in this session). 10 of 12 entries remain third-party sourced:
- C3 (USD→MXN), C5 (EUR→COP): live aggregator quotes.
- C2 (GBP→INR), C4 (USD→COP), C6 (AED→INR): **estimated** — today's live mid-market rate
  combined with MoneyGram's FX margin from World Bank Remittance Prices Worldwide data that is
  12–30 months old, assuming the margin has stayed roughly stable. This is the weakest data in
  the new set.
- **C1 (USD→INR): replaced 2026-09-08, now high confidence.** The original aggregator-sourced
  figures produced an impossible negative `costPercent` (implying MoneyGram beat the live
  mid-market rate) — see "Data quality correction" below. Re-sourced directly from
  moneygram.com's own send-money flow.

Flag: comparing today's live rate against the ~13-month-old World Bank baseline showed 10–15%
swings for C3/C5 (consistent with real currency movement, but large enough to want a live
re-check if these numbers matter for a real decision). C2/C4/C6 are pure estimates — recommend
getting an actual live MoneyGram quote before trusting them for anything beyond rough ranking.

## Ria Money Transfer — medium confidence, partial coverage

**Replaced 2026-09-08 for C3 (USD→MXN) and C4 (USD→COP)/C5 (EUR→COP)** — see "Data quality
correction" below. The original World Bank RPW-sourced figures (Q3 2025 survey, ~1 year old)
implied a rate meaningfully better than every competitor, an impossible result for a real
remittance provider. All three corridors are now sourced from live quotes taken directly on
riamoneytransfer.com, cross-checked against Ria's own displayed standard rate (not the
promotional first-transfer rate — see the MoneyGram section for why that distinction matters).

- **Both tiers now covered for C3/C4/C5.** Ria's own site does publish Large-tier ($2000/
  €2000-equivalent) quotes directly — the earlier "Everyday tier only" limitation was a
  property of the World Bank RPW survey (which only shops the $200-equivalent tier), not of
  Ria itself.
- **C6 (AED→INR) not included** — Ria has no online AED-origination channel (no `en-ae`
  locale on their site); UAE customers appear to be served via in-person agents only, not a
  quotable online channel.

## Al Ansari Exchange — manually-derived, needs confirmation

UAE-only sender, confirmed — no US/UK/Spain presence, so **only C6 (AED→INR) applies**; C1–C5
are genuinely not offered by this provider, not a data gap.

For C6, Al Ansari's own converter deliberately withholds an all-in quote ("rates are
indicative... contact branch for latest rates") — there is no automatable path here, by
design on their end. The two C6 figures in the dataset are computed from two separate official
Al Ansari documents (their published transfer rate + their Key Fact Statement fee schedule),
not one live quote. This is exactly the manual-fallback case the app expects for a provider
like this — flagged here, and via each row's own `dateChecked` (see below), rather than with
a separate UI treatment.

**This should be manually re-confirmed periodically** — it's the one entry in this batch built
by combining sources rather than reading a real quote.

## TransferGo — excluded from this batch

TransferGo does not support sending from the US or UAE at all (confirmed via their own site
and multiple reviews) — that rules out C1, C3, C4, C6 entirely. It does nominally support
GBP→INR (C2) and EUR→COP (C5), but **no usable figure could be obtained for either**:
TransferGo's own amount-input field is broken for programmatic entry (the page displays its
own error — "this amount placeholder is shown due to an error in the calculator" — and won't
accept a changed value even via direct browser interaction), and TransferGo is absent from
every third-party comparison table checked (Wise's own comparison page explicitly says it has
"no reliable information from this provider" for GBP→INR).

One real data point was captured — TransferGo's default 1000 GBP→India quote (fee 3.99 GBP,
rate 1 GBP = 127.82 INR) — but that's an off-tier amount, not the app's $200/$2000-equivalent
tiers, and there's no confirmation the flat fee holds at those amounts. Rather than
extrapolate from a single point, TransferGo is left out of `provider-data.json` for now.
**Needs manual entry for C2 and C5 (both tiers) if it's going to be added** — the fastest path
is probably checking TransferGo's app directly, since the web calculator itself is broken.

## As-of column fix

`app/page.tsx`'s results table used to show the live FX rate's timestamp for every row,
which overstated freshness — it implied every provider's fee data was as current as the FX
rate. It now shows each provider's own `dateChecked`, so all of the above (new and original
six alike) is honestly dated in the UI, not just Al Ansari.
