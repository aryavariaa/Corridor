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

## Data quality correction — 2026-09-10 (Western Union, US→India)

The live US→India page was shipping Western Union ranked #1 with an impossible **-0.1%**
`costPercent` — the same failure class as the September 8 Ria/MoneyGram correction (a provider
appearing to beat the live mid-market rate). Root cause: the original 2026-09-01 seed data
(94.6-95.4 implied rate depending on tier) sat noticeably above the rest of the corridor's
provider cluster (93.9-94.8), and on the day this was caught, above that day's live mid-market
rate specifically.

**Re-sourcing attempt, and why WU's own public tools don't work as a source:** both of WU's
public quote surfaces were checked directly before falling back to anything else —
`westernunion.com/us/en/currency-converter/usd-to-inr-rate.html` and the send-money landing
widget at `westernunion.com/us/en/send-money.html`. Both show a rate that doesn't change when
the entered amount changes, and both carry the same disclaimer: "Exchange Rates and Fees shown
are estimates... To check current rates and other options, simply click 'Send money.'" That
"Send money" click leads into an account-creation flow, which is out of scope here. In other
words: **Western Union does not expose a real, amount-specific standard-rate quote anywhere on
its public site without creating an account.** This was also confirmed independently during the
2026-09-10 corridor batch (see below), where WU's currency-converter page was found to quote
*above* mid-market on three unrelated corridors (USD→PHP, GBP→PKR, CAD→INR) — the same tool,
the same failure mode, not a one-off.

**Fix applied:** both US→India rows re-sourced from `wise.com/gateway/v3/comparisons` — Wise's
own live comparison feed reporting Western Union's real pricing (medium confidence, same
standard applied to the other aggregator-sourced rows in this doc, e.g. MoneyGram's C3/C5).
New implied rates (93.88 Everyday, 94.92 Large) sit inside the existing peer cluster for this
corridor, comfortably below mid-market. A repository-wide outlier sweep (every provider's
implied rate vs. its corridor+tier peer cluster, the same >8%-better-than-peer-best check used
throughout this doc) was re-run after the fix and returned zero flags across all 24
corridor+tier groups currently in the dataset.

**Standing recommendation:** treat `westernunion.com`'s public currency-converter and
send-money-landing pages as unusable data sources project-wide, not just for this corridor —
see the 2026-09-10 batch section below for the cross-corridor evidence. Any future WU row
should go through the Wise comparison feed (or a real logged-in quote, if that's ever worth the
effort) rather than either of WU's own public pages.

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

## 2026-09-11 — Eurozone corridors keyed by currency, not member country

Italy → Bangladesh and Spain → Colombia were originally added with `sendCountry` set to the
specific EU member country ("IT", "ES"). That was never a meaningful distinction: the
underlying rate/fee data is SEPA-based and currency-driven, not country-specific within the
Eurozone -- a Wise/Remitly/etc. quote from Italy and the same quote from Spain are the same
quote, just labeled with a different origin country. "Italy" vs. "Spain" as the send side was
a label difference, not a different corridor.

Both corridors are now keyed `sendCountry: "EUR"` (`sendCountryName` also "EUR", so the
picker/directory show one "EUR" origin instead of two separate countries), with their
`receiveCountry` unchanged (BD, CO) -- they remain two distinct corridors, just sharing one
send origin. `providerRates` rows for both were re-keyed the same way; `sendCurrency` was
already "EUR" and is unchanged. The old `/compare/IT/BD` and `/compare/ES/CO` URLs 301-redirect
to `/compare/EUR/BD` and `/compare/EUR/CO` (see `next.config.ts`), in case either was already
indexed or shared.

**Any future Eurozone corridor (Germany, France, etc.) should follow this same pattern:
`sendCountry: "EUR"`, not the specific member country.**

## 2026-09-11 — Automated refresh: Wise, PayPal, Western Union only, everyone else stays manual

`scripts/refresh-wise-rows.mjs` (`npm run refresh:wise`) is the first (and, as of this writing,
only) piece of automation in this repo for `providerRates`. It exists because Wise's own
Comparison API (`api.wise.com/v3/comparisons`) turned out to be a real, live, no-auth data
source usable for more than just Wise's own numbers — but it is **narrowly scoped**, and that
scope is intentional, not a placeholder for "automate everything later":

- **It only ever writes rows for `provider` in `{Wise, PayPal, Western Union}`.** These are the
  only three providers the Wise Comparison API actually returns.
- **It only refreshes a row that already exists** for a given
  `(sendCountry, receiveCountry, provider, tier)`. It never adds a new provider row to a
  corridor that doesn't already offer that provider — the corridor/provider list stays exactly
  as manually curated.
- **Every other provider — XE, Remitly, Revolut, WorldRemit, Paysend, MoneyGram, Ria, Al
  Ansari, TransferGo — is completely out of scope for this script and always will be**, not
  because of a technical limitation that might get lifted, but because the Wise API simply does
  not return them. This was confirmed directly, across multiple corridors, at both the $300 and
  $3000 tier amounts, during the 2026-09 sessions that built this script and fixed the EUR→CO
  WU row. **Do not assume this script (or a future one built the same way) can be extended to
  cover these providers without a completely different data source.** They keep going through
  the existing manual/browser-verified sourcing process described everywhere else in this doc,
  indefinitely.
- **Not every corridor+tier returns all three target providers either.** PayPal in particular is
  frequently absent from the Wise API response even for corridors where PayPal has a manually-
  sourced row in this dataset (e.g. it's missing entirely from `USD→INR` at any tested amount).
  When a target provider is missing from the API response, the script leaves that row exactly as
  it was and reports the gap — it never deletes or blanks a row it can't refresh.
- **A fetched value that would beat its corridor+tier's peer cluster by more than 8% is refused
  by default** (the same "probably bad data" signal behind every manual correction documented
  above), requiring an explicit `--force` to write it after a human looks at it.
- **Dry-run by default.** `npm run refresh:wise` only prints a diff; nothing is written unless
  `--write` is passed. This is deliberate — the blast radius of a bad batch write across ~15
  automatable rows is much larger than any single manual correction in this doc, so a run should
  be reviewed before it's applied, not trusted blind.

**Eurozone quote selection:** for a EUR-denominated corridor, the Wise API returns one quote per
Eurozone origin country instead of one blended figure (this is the same multi-country structure
that motivated re-keying Italy/Spain corridors to `sendCountry: "EUR"` — see the section above).
The script picks deterministically by a fixed preference order (`ES, IT, DE, FR, EE`, first
match wins) so repeated runs are stable. `ES` was the country used when this pattern was first
established, in the EUR→CO Western Union fix below.

**Corridors this script can touch, as of 2026-09-11** (has ≥1 of Wise/PayPal/WU already):
AE→IN, EUR→CO, GB→IN, US→CO, US→IN, US→MX (all three providers present); AU→IN, CA→IN, EUR→BD,
GB→PK, US→PH (Wise only — PayPal/WU aren't offered on these corridors in the current dataset).

**Network requirement — this script cannot run from inside a network-sandboxed environment.**
`api.wise.com` is unreachable from the sandbox this repo has been edited from throughout this
project (confirmed via both `curl` and Node's `fetch` — both fail with a 403 from the sandbox's
own egress proxy, "organization policy"). The script itself is correct and has been verified
against fixture data shaped exactly like the real API response (fixed provider-name matching,
EUR multi-country quote selection, the not-found skip path, the outlier-refusal path, and
`--write` actually persisting only the intended rows — all independently exercised), but an
actual live run needs to happen somewhere with normal outbound HTTPS: the user's own machine
outside this sandbox, or a CI job with unrestricted egress. It is not something Claude can run
end-to-end and verify live from this environment.

### Data quality correction — EUR→Colombia Western Union, 2026-09-11

Same failure class as every other correction in this doc: both EUR→CO Western Union rows
(Everyday, Large) implied a rate above that day's live mid-market rate — impossible for a real
remittance quote. Re-sourced from `wise.com/gateway/v3/comparisons`, `sourceCountry=ES`, per the
selection rule above. New implied rates land inside the corridor's peer cluster and comfortably
below mid-market (Everyday ≈4.6% below, Large ≈3.4% below).

A full outlier sweep (negative `costPercent`, and >8%-beats-peer-cluster) was re-run across all
22 corridor+tier groups in the dataset after this fix. EUR→CO is clean. The sweep also surfaced
several **pre-existing** negative-`costPercent` rows outside EUR→CO — mostly in US→CO and
US→MX — that are **not** part of this fix and haven't been corrected here; they most likely
reflect live mid-market rate drift since those rows were dated (2026-09-01 through 2026-09-08)
rather than bad sourcing at the time, but that's exactly the kind of thing this script's peer
sweep exists to catch going forward. Flagging here rather than silently expanding this fix's
scope — worth a dedicated pass.

## 2026-09-11 — COP genuinely moved; re-sourced the Wise/PayPal/WU rows it broke

Following the `lib/fx.ts` investigation above: COP moved ~3.2% between 2026-09-01 (when the
original "six providers" batch was dated) and today, which pushed several of that batch's
thin-margin rows on `US→CO`, `EUR→CO`, and (much more marginally) `US→MX` to an impossible
negative `costPercent`. Re-sourced everything the Wise Comparison API could cover:

- **US→CO**: Wise (both tiers), Western Union (both tiers).
- **EUR→CO**: Wise (both tiers).
- **US→MX**: Western Union and PayPal (Large tier — the only negative row there; Everyday was
  already fine).

All now sit inside their corridor's peer cluster and comfortably below live mid-market.

**Left un-fixed, still flagged negative — cannot be re-sourced through the Wise API:**

- **XE** on both `US→CO` (-2.3%) and `EUR→CO` (-2.07%) — same implied rate on both (XE's
  original source doesn't vary by send currency the way this API does), consistently ~2% above
  today's live COP mid-market. Needs a fresh xe.com quote.
- **Remitly** on `US→CO` (-0.97% Everyday, -1.15% Large).
- **Revolut** on `US→CO` Large only (-0.4%).
- **Paysend** on `EUR→CO` (-0.065%, both tiers — barely negative, effectively noise-level, but
  technically still fails the ≥0-cost sanity check).
- **PayPal** on `US→CO` Large (-0.17%) and `EUR→CO` (both tiers, ~-0.1%) — not a coverage gap in
  the usual sense: PayPal was queried at the correct corridor+tier amounts and is genuinely
  absent from the Wise API response for `USD→COP` and `EUR→COP` at every amount tried, matching
  the same pattern documented elsewhere in this file (PayPal is also absent from `USD→INR`
  entirely).

None of these five are in `{Wise, PayPal, Western Union}` scope for `scripts/refresh-wise-rows.mjs`
except PayPal, and PayPal specifically doesn't come back from the API for either COP corridor —
so this script cannot close the remaining gap on its own. XE, Remitly, Revolut, and Paysend need
their standard manual/browser-verified sourcing process; Remitly in particular will likely need
the promo-cap-reveal technique (see above), which requires a JS-capable browser tool.

## 2026-09-13 — Wise's own Comparison API documentation, read directly

Everything this doc previously said about `wise.com/gateway/v3/comparisons` /
`api.wise.com/v3/comparisons` (only ever returns Wise/PayPal/Western Union, one row per
Eurozone origin country, etc.) was reverse-engineered from the response shape — the endpoint
turned out to have real published docs (`docs.wise.com/api-reference/comparison`). Read them
directly; a few things confirm what we'd inferred, a couple are genuinely new and actionable.

**Confirms, and explains the COP fix more precisely.** Wise's own methodology: they collect
real third-party quotes (rate + fee) for each provider roughly once an hour, compute that
quote's markup over mid-market *at collection time*, then reapply that markup to *today's*
mid-market rate on every request. That's why re-running `refresh-wise-rows.mjs` after COP's
~3.2% move fixed the broken rows cleanly with zero code changes: Wise's feed was already
re-basing itself to current mid-market on its own schedule, so pulling from it again was
sufficient. Our own `providerRates` JSON has no such auto-rebasing — it's why a stale snapshot
and a live comparison feed drift apart after a real market move in exactly the way this dataset
did in September.

**Confirms the multi-quote-per-provider behavior**, and gives it a name: a provider can expose
several quotes for the same currency route, differentiated by target country (their example:
one GBP→EUR quote for GB→ES, a different one for GB→DE). This is the documented reason the
Eurozone quote-selection logic exists at all (fixed country-preference order `ES, IT, DE, FR,
EE`, first match wins — see the automated-refresh section above) — not a workaround for
undocumented behavior, the API working as designed.

**New: the endpoint path in this repo may be stale.** The docs' own example request hits
`api.wise.com/2026Q3/comparisons` — a quarterly-versioned path — not the `v3` path
`scripts/refresh-wise-rows.mjs` currently calls (`fetchWiseComparison`, line 69:
`https://api.wise.com/v3/comparisons/...`). Whether `v3` is still a live alias or has been
retired in favor of date-versioned paths isn't something that can be checked from here — the
sandbox this repo is edited from can't reach `api.wise.com` at all (see the automated-refresh
section above). **Needs a live check from a machine with real egress** (the same constraint
already noted for actually running the refresh script) before trusting `v3` still works.

**New: the API takes several parameters the script doesn't use yet**, visible in the docs'
full example request — `payInMethod`, `providers`, `sourceCountry`/`targetCountry`,
`excludePartners`, `includeWise`, `numberOfProviders`, `filter`. Two are worth a follow-up pass
on the script itself (not done here, this is a doc update, not a code change):
- `payInMethod` would let the script request bank-transfer pricing explicitly instead of
  relying on it being the undocumented default — directly relevant to the bank-transfer-only
  caveat below.
- `sourceCountry`/`targetCountry` would let it ask for a specific Eurozone origin directly,
  replacing the current client-side "try ES, then IT, then DE..." preference-order fallback
  with an actual request parameter.

Also noted: the example request includes an `X-External-Correlation-Id` header, which the
script doesn't currently send — likely fine (no auth requirement is documented), but worth
adding if Wise's side ever needs to trace a specific request.

**New caveat, not previously in this doc: bank-transfer-only scope.** Wise's docs state plainly
that today the comparison API "only provide[s] estimations for FX transactions with a Bank
Transfer pay-in and pay-out option," and that fees/rates can differ significantly for
card/cash. `refresh-wise-rows.mjs` never sends a payment-method parameter, so every row it
writes is implicitly whatever Wise defaults to — presumed bank transfer, now checkable via the
`payInMethod` param above rather than assumed. What's still unconfirmed is whether every
*manually*-sourced row elsewhere in this dataset (WorldRemit, Paysend, MoneyGram, Ria, Al
Ansari, TransferGo) was captured from each provider's bank-transfer flow specifically, rather
than a default card/cash quote where bank transfer isn't the first option shown. **Flagging for
a future pass**: re-check each manual row's capture method against "was this bank-transfer
pricing," not just "was this the standard non-promo rate."

**Spot-checked `refresh-wise-rows.mjs` against the docs' stated request contract** ("you must
provide either `sendAmount` or `recipientGetsAmount`, but not both") — the script only ever
sends `sendAmount` (`fetchWiseComparison`, line 68-69), never both. No change needed, noting it
here since it's now a documented requirement rather than an assumption.

Escalation path also newly documented: Wise takes data-accuracy reports at
`comparison@wise.com`, with their collection methodology and disclaimer at
`wise.com/gb/compare/disclaimer` — worth citing directly if a future outlier can't be resolved
by re-sourcing (e.g. the still-open XE/Remitly/Revolut/Paysend/PayPal gaps on `US→CO`/`EUR→CO`
listed above).

## 2026-09-14 — Phase 1 of corridor expansion: drop Colombia, add EUR→India and US→Vietnam

Net corridor count is unchanged at 10 (−2 Colombia, +2 new), just a different mix. This phase's
own environment turned out to have real outbound network access (unlike every earlier session
documented in this file) — `curl`/`fetch` to `api.wise.com` succeeded directly, so the Wise
rows below were pulled live rather than left for a human to run `refresh-wise-rows.mjs`
outside the sandbox. Worth re-checking in future sessions rather than assuming the network
restriction documented above still holds everywhere.

**Colombia removed.** Both `US→CO` and `EUR→CO`, and all 40 associated `providerRates` rows,
are gone — this was a deliberate risk-reduction call (see the case study and the COP sections
above for the real incident this corridor caused: a ~3.2% swing that produced impossible
negative-cost readings and originally motivated the swing-guard in `lib/fx.ts`), not a data
quality problem with the corridor itself. `lib/corridors.ts`'s `SEND_REGIONS` map never had a
`CO` entry (Colombia was always a receive-side country, never a send-side one, so nothing there
needed cleanup — same conclusion as the earlier AE cleanup). The one dead reference that did
need removing: `next.config.ts` had a `/compare/ES/CO → /compare/EUR/CO` redirect from the
2026-09-11 Eurozone re-keying, now pointing at a corridor that no longer exists — removed rather
than left to redirect into the "not available yet" state one hop later.

Per this repo's own precedent (the AE/AED cleanup left historical AE mentions throughout this
file untouched), the historical COP/Colombia narrative elsewhere in this doc and in
`lib/fx.ts`'s comments is left as-is — it documents *why* the swing-guard mechanism exists and
remains accurate engineering history, not a claim that the corridor still exists today.

**EUR→India added** (`sendCountry: "EUR"`, `everydayAmount`/`largeAmount` 200/2000, matching
the existing `US→IN`/`GB→IN` convention exactly, per the brief). **US→Vietnam added**
(`receiveCountryName: "Vietnam"`, `receiveCurrency: "VND"`, 300/3000, matching `US→PH`'s tier
amounts as the more comparable-sized remittance market).

**Provider coverage: 9 of this dataset's 10 current providers, both corridors, both tiers (18
rows each, 36 total).** Note the dataset currently has exactly 10 providers, not 11 — Al Ansari
Exchange (UAE-only) was already removed from the active provider list as part of the earlier AE
corridor cleanup, so it was never a candidate here regardless.

- **Wise, Western Union** — live `api.wise.com/v3/comparisons` pulls (same endpoint/logic as
  `scripts/refresh-wise-rows.mjs`, including the `ES` EUR-source-country preference for
  Western Union's EUR→INR quote). PayPal was queried too and, consistent with this doc's
  existing PayPal-absence pattern (e.g. `USD→INR`), the API returned nothing for PayPal on
  either new corridor at either tier.
- **PayPal** — the Wise API's silence doesn't mean PayPal doesn't offer these corridors (see
  the existing `USD→INR` PayPal row, which is real despite the same API gap), so it was sourced
  directly from `xoom.com` instead. Both corridors returned a real, non-promotional "Best Xoom
  Rate" quote (Bank Deposit for EUR→India, Bank Account for US→Vietnam) with no first-transfer
  promo badge — notably *different* from `xoom.com`'s plain `/en-us/usd/` India flow, which only
  ever shows a "First Time Rate" with no way to reveal a standard rate (matching this doc's
  existing PayPal/Xoom exclusion on other India-bound corridors); the `/en-es/eur/` locale for
  the same India destination did not have this restriction.
- **Revolut** — live `revolut.com/money-transfer` widget quotes, both corridors/tiers directly
  read off the page (no promo distinction shown on this provider's widget). The same widget
  also confirmed `EUR→Vietnam` is a real corridor Revolut supports — noted here only in case
  it's useful for a future batch, not added now (out of scope for this phase).
- **Remitly** — promo-cap-reveal technique (see the 2026-09-10 batch section above): standard
  rate disclosed in on-page text once the entered amount exceeds the promo cap (EUR→India cap
  €1,000; US→Vietnam cap $700). `amountReceived` computed as `(sendAmount − fee) × rate` per
  this dataset's established Remitly convention (see the `EUR→BD` row) rather than read directly
  off the blended promo+standard total the page shows below full confirmation.
- **XE** — live `xe.com` send-money product page quotes, both corridors/tiers, direct reads
  (Wire Transfer for EUR→India, Direct Debit/ACH for US→Vietnam).
- **WorldRemit** — live `worldremit.com` quotes. EUR→India via Bank Transfer (Spain origin,
  consistent with this dataset's `ES` EUR-preference convention). US→Vietnam via **Cash
  Pickup** — Bank Transfer isn't offered as a receive method into `VND` on this corridor
  (only Cash Pickup and Airtime Top-up are), so Cash Pickup was used instead of leaving the
  provider out.
- **MoneyGram** — live `moneygram.com` quotes (`.com/mgo/us/en` and `.com/mgo/es/en` locales).
  Same struck-through-standard-vs-highlighted-promo pattern as this doc's other MoneyGram
  corrections: used the standard rate (108.57 EUR→INR, 25688.70 USD→VND), confirmed independently
  by the fact that at the Large tier amount the page stops showing a promo badge at all and
  displays that same standard rate directly ("Great rates, every time"). `amountReceived =
  sendAmount × rate`, matching this dataset's existing MoneyGram `US→IN` row convention (no fee
  subtraction).
- **Ria Money Transfer** — live `riamoneytransfer.com` quotes (`en-us` and `es-es` locales).
  Same struck-through standard-vs-promo pattern; standard fee was €0.00/$2.90 respectively
  (not promotional artifacts — the EUR→India promo fee is *also* €0.00, so no promo/standard fee
  gap exists there). `amountReceived = sendAmount × rate`.
- **Paysend — not sourced, needs manual entry.** `paysend.com` served a Cloudflare
  "verify you are human" bot-detection challenge for this session, which was not attempted
  (bypassing bot-detection is out of policy). Unlike TransferGo's exclusion elsewhere in this
  doc, this isn't a "provider doesn't support the corridor" gap — it's simply unattempted.
  Needs a real browser session (or a human) that Cloudflare doesn't challenge.

**Outlier/negative-cost sweep**, same method as every other correction in this file (implied
rate = `amountReceived / sendAmount`, flag anything beating its corridor+tier peer cluster by
more than ~8%, and flag anything beating the live Frankfurter mid-market rate at all): run
across all 20 corridor+tier groups in the updated dataset (10 corridors × 2 tiers). Zero flags.
Both new corridors' implied rates cluster within roughly a 2–4% band per corridor+tier, and
every row sits comfortably below that day's live mid-market rate (EUR→INR 110.88, USD→VND
25,862 on 2026-09-14).
