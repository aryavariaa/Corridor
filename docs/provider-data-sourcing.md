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

## 2026-09-10 batch — US→Philippines, UK→Pakistan, Italy→Bangladesh, Australia→India, Canada→India

All five corridors ship. All five clear the bar (3+ providers with a real, current,
standard-rate public quote) — but three of them only get there after a methodology fix caught
mid-batch, documented below because it changes how future batches should be researched.

### Methodology finding: research agents without a JS-executing browser under-deliver

The initial research pass (one general-purpose agent per corridor, fetch-based tools only, no
JS execution) reported US→Philippines, UK→Pakistan and Canada→India as ready with 4-5 usable
providers each. On inspection, most of the non-Wise rows in that pass weren't sourced from each
provider's own site — they came from **Wise's own competitor-comparison feed**
(`wise.com/gateway/v3/comparisons`), because Western Union, Remitly, WorldRemit and MoneyGram's
own calculators are JS-rendered single-page apps that return nothing to a plain HTTP fetch.
That's real, live data (Wise queries each competitor's live pricing), but it's a materially
weaker sourcing standard than "the provider's own calculator," and stripping those rows back
out left all three corridors below the 3-provider bar.

A follow-up pass using an actual browser (JS execution, real page interaction) resolved this
for good — see the per-provider notes below. Two more corridors that the fetch-only pass had
held back (Italy→Bangladesh at 2 providers, Australia→India at 1) were then *also* rescued by
the same browser pass, using a technique the fetch-only agents couldn't discover on their own
(see the Remitly note). **Recommendation for future batches: do the research pass with a
browser-capable agent from the start**, not a fetch-only one — the fetch-only pass undercounts
real, non-promotional providers and overcounts on aggregator-sourced ones in roughly equal
measure.

### Western Union — excluded from all five corridors, systemic issue

WU's public "currency converter" pages (`westernunion.com/<market>/en/currency-converter/...`)
were checked directly for all three corridors that needed a WU quote (US→PH, UK→PK, CA→IN).
In every case the displayed rate **beat that day's mid-market rate** — impossible for a real
remittance quote and the same red flag that caught the Ria/MoneyGram bad data in the September
8 correction (see above):

- USD→PHP: converter showed 63.9788, mid-market was 62.6594 (+2.1%)
- GBP→PKR: converter showed 387.2382, mid-market was 375.2035 (+3.2%)
- CAD→INR: converter showed 70.0431, mid-market was 69.2098 (+1.2%)

This isn't a one-off bad row, it's the tool: WU's own currency-converter widget appears to
serve a marketing/indicative rate distinct from what its own checkout would actually offer,
and it does so consistently across corridors and currencies. **Treat WU's currency-converter
page as unusable as a data source going forward** — a real quote would need WU's actual
send-money checkout flow (which requires an account and wasn't attempted here), not this page.

### Remitly — the "select an amount above the promo cap" technique

Remitly's default quote on every corridor page is a "Welcome rate" (first-transfer promo),
which on its own fails this app's no-promo-data rule. But Remitly's page *does* disclose the
real standard rate, in plain text, the moment the entered amount exceeds the promotional cap
for that corridor — e.g. "Applied to first 500 EUR of your transfer. Standard rate 1 EUR =
142.24 BDT applies to the rest of the transfer." Selecting a large enough quick-amount button
reveals this cleanly, with no login needed. This worked on every corridor checked this batch,
including the two that the fetch-only pass had marked as failing on provider count:

- US→PH (cap $1,000): standard rate 62.50 PHP, $0 fee
- UK→PK (cap £500): standard rate 374.61 PKR, £0 fee
- IT→BD (cap €500): standard rate 142.24 BDT, base fee €0.99 shown alongside a "-€0.99"
  first-transfer fee discount — treated the €0.99 as the real standard fee and excluded the
  discount as promotional, but this is inferred, not confirmed by creating an account. No
  Everyday-size (~€300) reading exists for Remitly on this corridor — €300 is under the cap, so
  below it the page only ever shows the promo rate.
- AU→IN (cap AUD 3,000): standard rate 68.31 INR, base fee AUD 0.99 (same discount caveat as
  above). No Everyday-size (~AUD 300) reading exists here either — the cap is much higher than
  a typical Everyday amount.
- CA→IN (cap CAD 2,000): standard rate 68.77 INR, CAD 0 fee, no discount ambiguity (fee shown
  as flatly zero, not a discounted non-zero fee)

Medium confidence on IT→BD and AU→IN specifically, because of the fee-discount ambiguity;
high confidence on US→PH, UK→PK and CA→IN, where the fee was unambiguous.

### Per-corridor summary

**US → Philippines — ready, 3 providers.** Wise (high — wise.com live comparison API, its own
quote), XE (high — xe.com's own send-money product page, rate 62.0659, $0 fee), Remitly (high
— see above, rate 62.50, $0 fee). Excluded: Western Union (see above), PayPal/Xoom (only shows
a "First Time Rate," no toggle or higher-amount trick reveals a standard rate without creating
an account).

**UK → Pakistan — ready, 3 providers.** Wise (high), XE (high — xe.com product page, rate
373.9271, £0 fee), Remitly (high — see above, rate 374.61, £0 fee). Excluded: Western Union
(see above), WorldRemit (its page always labels the output "First Transfer Rate" and the
blended figure doesn't cleanly separate into a standard-only number even at high amounts — no
reliable non-promo reading), MoneyGram (the `/pakistan` URL silently redirected to an India
quote instead of erroring, and a corrected URL returned an empty shell page — broken, not
merely unsupported).

**Italy → Bangladesh — ready, 3 providers** (upgraded from a 2-provider hold in the fetch-only
pass). Wise (high — both its own compare page and its comparisons API agree on ~142.83),
Paysend (medium — same caveat as the original batch: fee applied without independently
re-verifying it holds at each exact tier amount), Remitly (medium — see fee-discount caveat
above). Excluded: XE (this specific corridor's XE page has no rate/fee box at all, unlike every
other corridor checked — an FAQ-only page), Western Union/WorldRemit/MoneyGram/Ria (JS-only
calculators, no static reading, not re-attempted with the browser pass for this corridor since
the bar was already met), PayPal (Xoom doesn't send from Italy at all), Revolut (its own
calculator errored live — "Qualcosa è andato storto").

**Australia → India — ready, 3 providers** (upgraded from a 1-provider hold in the fetch-only
pass). Wise (high), XE (high — xe.com product page, rate 68.0657, AUD 0 fee), Remitly (medium
— see fee-discount caveat above). Excluded: everyone else from the original 10-provider
check (XE was actually already usable and just needed the direct product-page URL rather than
the generic converter the fetch-only agent tried; Remitly, Ria, Paysend, Revolut required
login for a real quote; Western Union, WorldRemit, MoneyGram had broken/non-rendering
calculators; PayPal has no AUD→INR remittance product).

**Canada → India — ready, 3 providers.** Wise (high), XE (high — rate 68.7126, CAD 0 fee),
Remitly (high — see above, rate 68.77, CAD 0 fee, no fee-discount ambiguity). Western Union
excluded (see above); WorldRemit/MoneyGram not independently re-checked directly since the bar
was already met with three high-confidence sources.

### Open items from this batch

- Two Remitly rows (IT→BD, AU→IN) carry a fee-discount ambiguity — confirm with a real account
  or a support query whether the "-€0.99"/"-AUD0.99" line is first-transfer-only before relying
  on this data past casual ranking use.
- Western Union is now excluded from eight corridors total (this batch's three, plus whatever
  it was already missing from before) purely because its public currency-converter tool
  produces an above-mid-market rate. Worth periodically re-checking whether that's still true,
  in case it's a temporary bug on WU's end rather than a permanent characteristic of that page.
- `lib/fx.ts`'s `SupportedCurrency` type gained `AUD` and `CAD` for this batch.
