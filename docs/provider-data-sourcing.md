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

**Scheduled runs (AWS Lambda):** the same refresh logic now also runs daily on AWS and commits
safe changes to GitHub. The refresh/guard code lives in `scripts/lib/refresh-core.mjs`, shared by
the CLI and the Lambda. The guard is a *peer* check, not a deviation-from-previous-value check;
the Lambda adds a stricter change-from-current check on top. See `docs/aws-automation.md`.

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

## 2026-09-22 — Phase 2: 20-corridor major-currency expansion

Added 10 corridors to fill CAD, GBP, EUR, and AUD out to 4 receive markets each:
CA→PH, CA→VN, CA→NG, GB→NG, GB→BD, EUR→PH, EUR→NG, AU→PH, AU→VN, AU→NG.
Wise, PayPal, and Western Union rows were seeded via `scripts/refresh-wise-rows.mjs`
(API-backed, unchanged process). The remaining 7 providers were sourced manually per
corridor/tier using each provider's own established reveal method from this doc. Totals:
281 new `providerRates` rows (Wise 20, Western Union 20, XE 20, Paysend 20, Ria 20,
Revolut 18, WorldRemit 14, Remitly 12, MoneyGram 9, PayPal 6).

**Deliberate exclusions (no standard rate could be revealed — no row recorded rather than
guessed):**
- WorldRemit: CA→PH, AU→PH, AU→NG — the "First Transfer Rate" promo persists to the
  maximum amount the calculator allows (CAD 8999 / AUD 9989), with no threshold that
  reveals a standard rate.
- Remitly: Everyday tier is under that corridor's promo cap on CA→PH, CA→VN, CA→NG,
  EUR→PH, EUR→NG, AU→PH, AU→VN, AU→NG (promo caps range CAD/AUD/EUR 500–2,000) — Large
  tier clears the cap on all of these and was recorded normally.
- MoneyGram: Everyday tier is blocked by an unconditional promo on all 10 corridors.
  AU→VN is excluded on both tiers — the promo persists at every amount tested (AUD 300,
  3,000, 10,000), with no reveal threshold found.

**Confidence notes:**
- Ria: all 10 corridors read cleanly as either a standard rate shown against a crossed-out
  first-transfer promo, or (EUR→NG, AU→VN, AU→NG) no promo shown at all.
- Paysend: clean direct reads on all corridors; AU corridors carry a real 2.90 AUD flat fee
  (deducted before conversion), so `amountReceived` was taken from the live "recipient
  gets" field rather than computed as `sendAmount × rate`.
- WorldRemit's clean reads used each corridor's dedicated destination-country page
  (`worldremit.com/en/<destination>`), not the homepage's universal calculator, which
  shows an unconditional promo badge regardless of amount.

> **Historical — Nigeria was removed from the dataset on 2026-09-23** (see "Nigeria removed, South Africa added" below). What follows is kept as a record of what was tried and why it was reverted; none of these corridors exist any more.

**Nigeria FX-benchmark divergence:** all four new Nigeria corridors (CA/GB/EUR/AU→NG) show
negative-cost teasers on the homepage, implying the cheapest provider beats the live
mid-market rate. Independently re-fetched live Frankfurter mid-market rates for all four
send currencies→NGN and recomputed each corridor's cheapest-provider cost% by hand; both
reconciled exactly with the app's displayed values. This reflects a genuine, real-time FX
benchmark divergence for NGN — a volatile, thinly-traded currency — consistent with the
COP precedent above, not a sourcing error. **(Explanation superseded 2026-09-23 — the
divergence is structural, not a market move; see the section below.)** The existing costAnomaly UI correctly surfaces
this without generating false AI narration.

No changes were made to `scripts/lib/refresh-core.mjs`, the AWS Lambda, or its SAM
template. `TARGET_PROVIDERS` (Wise/PayPal/Western Union) is corridor-agnostic, so the
existing scheduled automation will now also refresh those rows on the 10 new corridors —
expected behavior from adding them via the shared mechanism, not a scope change. All 7
manually-sourced providers remain untouched by automation on every corridor, old and new.

## 2026-09-23 — Negative-cost audit: stale manual rows re-sourced; Nigeria diagnosed

**Problem 1 — stale manual rows (fixed).** Live audit of all 20 corridors against Frankfurter
found manual rows 9–22 days old going negative as the mid-market drifted. Re-sourced from each
provider's own calculator, dated 2026-09-23, both tiers (28 rows), in the four affected corridors:
- CA→IN: XE (67.7096), Remitly (standard 67.57)
- GB→PK: XE (366.9588; fee now GBP3 at Everyday), Remitly (standard 367.60)
- GB→IN: Revolut, Remitly (standard 126.50), XE, WorldRemit, Paysend, MoneyGram (standard 127.08)
- EUR→IN: Revolut, Remitly (standard 108.29), XE, WorldRemit
The audit found more negative rows than the original report because rates kept moving (e.g.
GB→IN had five providers negative, not one). Remitly GB→IN/EUR→IN use `(sendAmount − base fee)
× rate`, per this dataset's documented Remitly convention. After the fix, none of the four
corridors has any negative row on either tier and none renders the cost-anomaly banner.

**Still stale/negative, out of this pass's scope (flagged, not fixed):**
- Negative today: EUR→BD Paysend (−1.4%, 13d) and Remitly Large (−1.1%); AU→IN XE (−0.3%) and
  Remitly Large (−0.6%) — all 13 days old, same failure mode, re-source next.
- Marginal negatives on 1-day-old rows (≤0.2%, inside the ±0.4% Frankfurter-vs-Wise daily-fixing
  noise, not stale): AU→PH/CA→PH/EUR→PH XE Large; GB→BD Remitly/MoneyGram Large/Ria; AU→VN
  Remitly Large/Ria.
- Near-failure (≥9 days old, thin margin): US→PH Remitly (+0.14%, 13d), US→PH XE (+0.83%),
  EUR→IN MoneyGram/Ria (9d, not re-sourced — positive), GB→IN Ria (16d, positive).
- Very old but comfortably positive: US→IN and US→MX manual rows (15–22 days).
A ~10-day re-source cadence for XE/Remitly/Revolut (the providers that price closest to
mid-market) would prevent recurrence.

> **Historical — Nigeria was removed from the dataset on 2026-09-23** (see "Nigeria removed, South Africa added" below). What follows is kept as a record of what was tried and why it was reverted; none of these corridors exist any more.

**Problem 2 — Nigeria: benchmark mismatch, not a sourcing error.** Findings:
1. Frankfurter's NGN comes from central-bank sources (its NGN provider list includes CBN), i.e.
   the official reference rate. Three independent aggregators agree with it (USD→NGN 1328.02
   Frankfurter, 1328.37 open.er-api / exchangerate-api, 1324.9 fawazahmed0) — so it is not a
   Frankfurter glitch; it is the published official rate.
2. Wise, Western Union and all seven manual providers price at a rate ~3.1% higher (Wise's CAD→NGN
   974.7 implies USD→NGN ≈ 1370). Across the other 16 corridors, Frankfurter and Wise's rate agree
   within ±0.4%; on the four NGN corridors the gap is −3.10 / −3.09 / −3.09 / −3.35% — the same
   regardless of send currency, so it lives in the NGN leg.
3. Recomputing every Nigeria row against a Wise-derived mid-market removes the anomaly: 0 of 16
   (CA), 0 of 15 (EUR), 0 of 14 (AU) and 2 of 16 (GB, worst −0.15%) rows are negative, with the
   cheapest providers at ~0.6–0.7% cost. The provider rows are mutually consistent and accurate;
   the benchmark is the outlier for this one currency. The gap (~3%) is far smaller than the
   historical 20–40% official/parallel spread, consistent with the 2023–24 CBN unification.
Conclusion: do not re-source Nigeria provider rows. The fix belongs in how the NGN benchmark is
chosen or presented (pending decision).

**Problem 2 fix (2026-09-23).** NGN corridors now benchmark against Wise's own mid-market rate
(`getWiseMidMarketRate` in `lib/fx.ts`, Wise comparison API, 1h revalidate) with Frankfurter as the
fallback. Wise keeps a separate last-known-good cache, because Wise and Frankfurter differ by ~3% for
NGN and sharing one cache would trip the 3% swing guard on a source switch. On these corridors Wise's
own row is flagged `benchmarkReference`, excluded from ranking, the hero card and the directory
teaser, pinned last in the table with a "Ref" label and no cost figure (its cost is measured against
itself), and each page carries a footnote explaining the benchmark. If the Wise fetch fails with no
cache, the page falls back to Frankfurter and the footnote says so. The list of Wise-benchmarked
currencies is `WISE_BENCHMARK_TARGETS` in `lib/fx.ts`; add a currency there if another shows the same
official-vs-executable gap.

Nigeria rows also move fast: GBP→NGN dropped ~0.4% within a day, pushing three GB→NG rows sourced
on 2026-09-22 slightly past the benchmark. Re-sourced 2026-09-23: Ria (standard 1825.00), Remitly
(standard 1812.47, above the GBP250 promo cap), MoneyGram Large (1816.02). **Residual:** Ria's
freshly verified GB→NG quote still beats Wise's live mid-market by ~0.3%, so that page keeps the
cost-anomaly banner. The quote is real and current, not stale; NGN has no single agreed mid-market
rate. Treat NGN rows as needing a re-source every 1–2 days, not the ~10-day cadence used elsewhere.

## 2026-09-23 — Nigeria removed, South Africa added

**Why Nigeria was dropped.** After the benchmark override (Wise's mid-market for NGN, Wise row shown as
reference) shipped, GB→NG still tripped the anomaly banner: Ria's fresh, verified quote sat 0.3% above
Wise's own live rate. NGN has no single agreed mid-market rate, so a genuine current quote can
legitimately land on either side of any one benchmark. That is a property of the currency, not a bug to
keep chasing, so the four NG corridors and all 61 of their rows were removed. The investigation above
stays as the record of the finding (official reference rate ~3% below the executable rate, and the
residual noise even after fixing the benchmark). The only Nigeria-specific code was the entry in
`WISE_BENCHMARK_TARGETS`; the mechanism itself (`lib/fx.ts` Wise benchmark with its own cache, the
`benchmarkReference` row handling in `lib/corridors.ts`, the reference label and footnote in
`CorridorComparison.tsx`) is keyed by currency, so it stays in place, dormant, with the set now empty.
(A "0.5% noise tolerance" was floated as an option but never built.)

**Why South Africa.** ZAR has floated freely since the financial-rand dual rate ended in 1995, so
there is no official-vs-executable split. Checked against live data before building: Frankfurter's
ZAR agrees with Wise's own rate within +0.13% to −0.30% for CAD/GBP/EUR/AUD (the usual noise band).

**Corridors.** CA→ZA, GB→ZA, EUR→ZA, AU→ZA, tiers 300 / 3,000 in the send currency (same as the
other emerging-market corridors). Wise Comparison API confirmed to return ZAR for all four: Wise and
Western Union for CAD/GBP/AUD, **Wise only for EUR→ZA** (no Western Union, no PayPal on any ZA
corridor — not invented). The refresh script only updates rows that already exist, so Wise/WU rows
were seeded as placeholders at ~3% below mid-market (so the 8% peer guard compares against something
realistic rather than being forced past) and then written by `refresh-wise-rows.mjs --write`. Rows the
script touched on other corridors were left out of this change. The Lambda's `TARGET_PROVIDERS` is
provider-scoped with no corridor allowlist, so it refreshes these rows on its next run with no code
change.

**Manual providers (sourced 2026-09-23 from each provider's own calculator).** XE (all four), Revolut
(GB, EUR, AU — **no CA row**: Revolut has no Canadian transfer calculator, `/en-CA/` redirects to the
UK site), Remitly (standard rate above the promo cap, `(send − base fee) × rate`), WorldRemit (dedicated
`worldremit.com/en/south-africa`, Bank Transfer, no promo shown), Paysend (AU carries a real AUD2.90
fee deducted before conversion), MoneyGram (standard rate struck through beside the first-transfer
promo; Everyday derived from the same standard rate as the Large read), Ria (standard rate; single
rate at Large). Total: 14 Wise/WU rows + 54 manual rows = 68 ZA rows. Peer sweep: no provider beats its
corridor+tier cluster by more than 8%.

**Known caveats.** Remitly CA→ZA Large reads −0.1% against Frankfurter (its 11.59 standard rate is
0.24% above Frankfurter's 11.5621, but inside the ±0.3% Frankfurter-vs-Wise noise band — against
Wise's own rate it is not negative), so that tier can show the cost-anomaly banner. The existing
CA→PH/CA→VN Revolut rows could not be re-checked from today's tooling for the same reason as the
missing CA→ZA row.

## 2026-09-23 — Removed corridors now 404

Before this change the corridor route left `dynamicParams` at its default (`true`), so a pair not in
`generateStaticParams` (any removed corridor, any typo) still rendered a "not available yet"
placeholder with an HTTP **200** — a soft 404 that search engines can keep indexing, and a path where
a cached pre-removal render could linger. Now `app/compare/[send]/[receive]/page.tsx` sets
`dynamicParams = false` (unlisted pairs return a real 404 without rendering) and also calls
`notFound()` if the corridor isn't in the data; both fall through to `app/not-found.tsx`. The static
params, sitemap and homepage directory all derive from `corridors[]`, so **removing a corridor from
`data/provider-data.json` is the whole job** — its URL 404s on the next deploy with no per-route
cleanup. (Redirects in `next.config.ts` are only for corridors that were re-keyed, not removed.)
On 2026-09-23 the removed NG and CO URLs were checked on production and were already showing the
placeholder rather than stale rates; the earlier stale render was most likely a window before the
swap deploy finished, and this change removes the soft-404 behavior for good.

## 2026-09-23 — Custom amounts (live vs. estimated)

The corridor page now takes any amount, on top of the two verified preset tiers (which are unchanged:
static, dated, verified, still served by `/api/compare`). What a number means depends on its source,
and the UI labels it:
- **Wise, PayPal, Western Union — "Live quote".** `/api/custom-amount` queries the Wise Comparison API
  server-side at exactly the entered amount (`lib/wise-live.ts`, fetch-cached 90s; the cache key is the
  URL, i.e. currencies + amount, and the amount is rounded to whole units so a client can't mint
  unlimited cache keys). If the call fails or times out (5s), or the API doesn't return a provider at
  that amount, that provider falls back to an estimate, tagged as one. PayPal is not returned for
  every corridor (e.g. USD->INR, EUR->INR), so it is often an estimate there even when the call works.
- **The seven manual providers — "Estimated".** No live source exists, so each row is a straight line
  through the provider's own two verified tier rows (`getCustomAmountRanking` in `lib/corridors.ts`).
  Rows are never silently interpolated: the tag, the row tooltip and a banner say so. A provider with
  only one verified tier (e.g. Remitly/MoneyGram where the Everyday tier was unavailable because of an
  unrevealable promo) has no line to interpolate, so it is listed as "not shown" instead of invented.
- **Range.** Custom amounts are limited to 0.5x the Everyday tier up to 3x the Large tier. The brief
  asked for 0.5x-3x the Large tier, but that lower bound (e.g. 1,500 on a 300/3,000 corridor) would have
  rejected the Everyday preset amount itself, so the lower bound is anchored to the Everyday tier
  instead. Between the two tiers estimates interpolate; outside them (down to 0.5x Everyday, up to 3x
  Large) they extrapolate the same line and the banner says to treat them as rougher. Out-of-range input
  is rejected with an explanation (client-side, and again in the API), never silently clamped.
- **AI insight is preset-only.** `lib/ai.ts` grounds its narration in each row's sourcing notes and
  caches per corridor+tier+day, both wrong for an interpolated amount, and narrating an estimate as
  fact is exactly what this product avoids. Custom amounts show a note instead of an explanation.
- Ranking, sorting and the cost-anomaly check run through one shared function (`rankRows`), so presets
  and custom amounts can't diverge.

## 2026-09-23 — CA→ZA Remitly re-sourced; the residual negative is benchmark lag, not a stale row

Remitly CA→ZA (both tiers) was re-quoted from remitly.com/ca/en/south-africa: standard rate 11.60
(was 11.59), base fee CAD3.99, `(send − fee) × rate`. The row was not stale — the earlier quote was
hours old and the new one moved by 0.09%. The Large tier still reads slightly negative against
Frankfurter (−0.19%, was −0.11%) because Frankfurter's CAD→ZAR is its once-daily fixing, dated the
previous day and 0.39% below the live market (Wise's live mid was 11.6077 vs Frankfurter 11.5621).
Against Wise's live mid the same row is **+0.20%**. So a freshly sourced live quote can read marginally
negative until Frankfurter publishes the next fixing (~16:00 CET); re-sourcing cannot fix that and
should not be tried repeatedly. If it keeps recurring, the options are a small negative-cost tolerance
or extending the (currently empty) Wise-benchmark set to ZAR — both are product decisions, not data fixes.

## 2026-09-23 — Same-day fixing-lag allowance on the cost-anomaly banner (methodology)

**Finding.** Frankfurter publishes one reference rate a day, while live quotes (the Wise API, and any
provider page read today) track the market continuously. At the survey time (2026-09-24 00:27 UTC, ~10h
after the fixing, i.e. the worst point in the cycle) every corridor's fixing was dated 2026-09-23 and
Wise's live rate differed from it by more than 0.3% on 11 of 20 corridors (max 1.17%, USD->MXN). So a
row that is accurate right now can read slightly negative against the fixing. The survey split:
- **Live-queried** (92 quotes at both tier amounts): 1 negative, US->MX Wise Large at -0.32%, inside
  the 0.5% band and +0.85% against Wise's live mid, i.e. fully explained by lag. 0 outside.
- **Stored rows** (all 20 corridors, both tiers): 18 negative, 14 inside the band and 4 outside. Only
  1 of the 18 (CA->ZA Remitly Large) turned positive against Wise's live mid; the other 17 stayed
  negative, most more so. Their ages: the 12 small ones are 1-2 days old (ordinary market drift since
  quoting, a mild real staleness), the outside-band four and two more are 14 days old. So most stored
  negatives were **not** fixing lag, and a blanket tolerance would hide real (small) staleness.

**Rule implemented** (`COST_ANOMALY_TOLERANCE` in `lib/corridors.ts`, generic, not currency-keyed): a
negative cost within 0.5% is not raised as a banner anomaly **only if** the row is a live quote or was
quoted on the same local calendar date as the check. Local means the operator's zone (America/Los_Angeles),
matching how manual rows are dated; rows written by the daily refresh carry the UTC date, so a
disagreement just means no allowance (the safe direction). Older rows get no allowance and still flag.
Tolerated rows are never silent: the page notes them under the live rate ("reads slightly below the
reference ... usually the reference lagging").

**Checked against the real ranking code** (scratch dev server, real data file restored afterwards,
checksum verified): a synthetic Nigeria-scale incident (-1.4/-2.0/-2.6/-3.0/-3.4%, five providers, same
direction, all dated today) on GB->ZA still raised all five, so the same-day allowance does not apply to
large anomalies. Edge cases: -0.3% today -> exempt; -0.3% yesterday -> flagged; -0.49% today -> exempt;
-0.6% today -> flagged; a same-day -0.3% row next to a 3-day-old -0.3% row -> only the old one flagged.
**Known residual:** a corridor whose fixing lags by more than 0.5% (USD->MXN was 1.17%) can still flag a
correct live row at large amounts. That is a wider-band or Wise-benchmark decision, not made here.

## 2026-09-23 — Stale rows re-sourced; PayPal EUR->IN explained; AU->PH XE checked; cards fixed

- **Re-sourced (dated 2026-09-23):** EUR->BD Paysend (both tiers, 139.8113, was 142.6250), EUR->BD
  Remitly Large (standard 139.21, was 142.24), AU->IN Remitly Large (standard 67.34, was 68.31). All four
  were 13-14 days old; they now read +0.6% to +1.1%. This is a stale-row fix, separate from the
  fixing-lag allowance above.
- **PayPal EUR->IN "checked within a month" is not a guard or badge bug.** The Wise API never returns
  PayPal for EUR->INR (or USD->INR), so `refresh-wise-rows.mjs` lists those rows as not found and leaves
  them; the outlier guard skipped 0 rows. The rows are a manual Xoom quote dated 2026-09-14. The
  directory badge shows the corridor's OLDEST row, which is that date (MoneyGram and Ria EUR->IN share
  it). PayPal is only API-refreshed on corridors where the API returns it (currently GB->IN, US->MX,
  CA->PH, EUR->PH, AU->PH). Re-sourcing the three 09-14 EUR->IN rows is the remaining cleanup.
- **AU->PH XE "0.0%"** is real: Everyday implied 44.3828 vs fixing 44.403 = +0.0455% (a genuine,
  near-flat quote, displayed to one decimal), not a rounded negative. Its Large tier is a real -0.21%.
  XE's fee is an add-on outside amountReceived, so its cost understates total cost slightly.
- **Directory cards** headlined negative rows unflagged. `getCorridorTeaser` now skips any row reading
  negative and shows "N rate(s) under review" when it did, regardless of the tolerance above.
- **Custom-amount banner** reused stale-data wording. For custom amounts it now says an estimated row
  reading below mid-market is most likely an artifact of estimating (between or beyond the two verified
  amounts), and a live row may be the reference rate lagging.

## 2026-09-23 — Open items and known limitation (logged, not urgent)

**Next re-sourcing pass (not urgent).** These still read stale and keep the cost-anomaly banner or an
old date; none was in the last pass's scope:
- Rows dated 2026-09-10 (14 days): AU->IN XE (both tiers, -0.29%).
- Rows dated 2026-09-22 that fell outside the same-day allowance and read -0.03% to -0.21%: GB->BD
  Remitly (both tiers), Ria (both), MoneyGram Large; AU->VN Ria (both) and Remitly Large; AU->PH XE
  Large; CA->PH XE Large; EUR->PH XE Large. (These 9 corridor/tier combinations show the banner.)
- EUR->IN PayPal (Xoom), MoneyGram and Ria, all dated 2026-09-14: not negative, but they keep the
  corridor's freshness badge at "checked within a month" and PayPal currently leads that corridor.
- Also aging: the US->IN, US->MX, US->PH and US->VN manual rows (15-22 days old at last count).

**Known, accepted limitation of the 0.5% band.** The allowance assumes a fixing-vs-market gap under
0.5%. Measured 2026-09-24 00:27 UTC (worst point in the daily cycle), USD->MXN was 1.17% (Wise live
17.568 vs fixing 17.3629), and 11 of 20 corridors exceeded 0.3%. On a corridor like that a correct live
Wise/PayPal/Western Union quote at a large amount (where the fee is a small share of cost) can read
below -0.5% and raise the banner even though the row is accurate. Not fixed on purpose: the options are a
wider band (which would hide more real staleness), a per-corridor band, or benchmarking against Wise's
live rate; each is a product decision. Recorded so it isn't rediscovered as a bug.

**Convention: Xoom labelled "PayPal".** On corridors where the Wise API does not return PayPal, the
"PayPal" row is a manual quote from Xoom (PayPal's remittance service): currently US->IN, US->VN and
EUR->IN. Everywhere the API does return PayPal (GB->IN, US->MX, CA->PH, EUR->PH, AU->PH) the row is
API-refreshed by the Lambda. So EUR->IN is not special; it is one of three Xoom-sourced corridors.

## 2026-09-23 — Re-sourcing pass (the "next pass" logged above)

Re-quoted from each provider's own page, dated 2026-09-23, both tiers unless noted (20 rows):
- **XE:** AU->IN (67.0682, was 68.0657), AU->PH (43.6672 / 43.7772), CA->PH (44.0848 / 44.1959),
  EUR->PH (70.9236 / 71.1022; reached via the India page's currency + destination selectors). XE quotes
  a slightly higher rate at the Large amount on the Philippines corridors.
- **Remitly:** GB->BD both tiers (standard 163.00, welcome 165.44 on the first GBP100 only), AU->VN
  Large (standard 18,175.36). **Convention note:** these rows previously treated Remitly's base fee as
  "discounted to 0" (`send x rate`); they now use the documented `(send - base fee) x rate`
  (GBP0.99 / AUD1.99), matching every other Remitly row, so their cost reads slightly higher than a
  like-for-like re-quote of the old method would.
- **Ria:** GB->BD (standard 163.11), AU->VN (single rate 18,242), EUR->IN (standard 105.86, was 107.11).
- **MoneyGram:** GB->BD Large (163.2704), EUR->IN both tiers (107.1408; Everyday derived from the same
  standard rate as the Large read).
All 20 rows now read +0.35% to +3.3% against the fixing; peer sweep clean (no row beats the next best by
more than 8%). After the pass no corridor/tier raises the anomaly banner (9 before), no directory card
carries a "rates under review" flag, and one same-day row (CA->ZA Remitly Large, -0.18%) shows the
fixing-lag note.

**PayPal (Xoom) EUR->IN — re-sourced 2026-09-27, and a ranking-scope note.** Xoom's EUR locale was
unreachable in every prior attempt (`/en-es/eur/` redirects to sign-in; the India sub-paths 404). It
turned out to be reachable a different way: `xoom.com/india/send-money?locale=es-ES&currency=EUR` lets
the currency selector switch to EUR without logging in. At EUR1,000 it showed "Mejor tarifa de Xoom"
(Best Xoom Rate, not a first-time promo) at 107.8418 INR with EUR0.00 fee on every payment method
(Bank Deposit, Debit/Credit Card, Cash Pickup). The amount field would not accept scripted or typed
input, so the rate was read at EUR1,000 and applied to both tiers, as the prior row did.

Before this was re-sourced, a user check of the live site found the EUR->IN directory card correctly
headlining XE (0.2%) with PayPal shown under "1 rate under review" -- confirmed this was the negative-
exclusion logic working as designed (PayPal's cost was -0.03%, so `getCorridorTeaser` skipped it),
not a coincidence of XE happening to be cheaper. On the corridor detail page itself, PayPal still ranked
#1 in the table at -0.0% cost with the cost-anomaly staleness banner -- **this is intentional and out of
scope for that fix**: the negative-exclusion logic (`getCorridorTeaser`, homepage cards only) was never
meant to touch `getRankedProviders`/the detail-page table, which still ranks every row including negative
ones and relies on the anomaly banner, not exclusion, to flag them. No bug here. Now that the row is
re-sourced and positive, this is moot for EUR->IN specifically, but the same detail-page/homepage split
applies to any future negative reading and should not be "fixed" without a separate decision to do so.

**Still aging:** the US->IN, US->MX, US->PH, US->VN manual rows (now 15-23 days old) are the largest
remaining staleness; they are comfortably positive so nothing flags, but they are the next candidates.

## 2026-09-23 — Re-sourcing pass, part 2: the US corridors (41 rows)

Re-quoted from each provider's own page, dated 2026-09-23: US->IN and US->MX (Revolut, Remitly, XE,
WorldRemit, Paysend, Ria, MoneyGram), US->PH (XE, Remitly), US->VN (Remitly, XE, MoneyGram, Ria, PayPal
via Xoom). These were 9-22 days old and drifting; costs moved from roughly +1% to +5% to +0.1% to +1.9%
(e.g. Ria US->IN Everyday +9.7% -> +0.2%), i.e. the old rows were materially overstating cost, not
understating it. Peer sweep clean; no anomaly banners.

**Method notes**
- Remitly US pages have wide promo caps ($6,000 India, $1,000 Mexico/Philippines, $700 Vietnam) and the
  standard rate improves slightly with amount. India's standard rate (95.75) was read above the cap
  ($6,100-$9,000, stable) and applied to both tiers, which is the documented approach but a small
  approximation for the $200 tier. Fees follow `(send - base fee) x rate`: India $3.99 at Everyday and $0
  at Large (waived), Mexico and Vietnam $1.99.
- Paysend US deducts a flat fee before conversion (India $1.49, Mexico $0.99); the fee was assumed flat
  across tiers, as on the AU corridors.
- MoneyGram US->MX: the promo badge still shows at $2,000, so the struck-through standard rate (17.27,
  displayed to 2 decimals) is used, not the promo-based Recipient-gets figure. India and Vietnam read the
  standard rate directly at the Large amount.
- XE US quotes are Direct Debit (ACH) with the usual $1-4 add-on fee below the free threshold.
- Xoom US->VN (PayPal): plain "Best Xoom Rate" with no first-time promo, fee $2.99 via bank account.
  The amount field would not accept scripted input, so the rate was read at the default $200 and applied
  to both tiers (as the previous row did); medium confidence.

**Not re-sourced (rows unchanged, still aging)**
- **PayPal (Xoom) US->IN, dated 2026-09-01:** Xoom's India page shows only a first-time promo rate
  ("First Time Rate") with no way to reveal the standard rate. This is now the oldest row on the site.
- **Revolut US->VN, dated 2026-09-14:** Revolut's US widget offers Vietnam only as a USD payout (no
  VND). The stored row described a VND payout the provider no longer shows for a US sender, so it could
  not be re-verified; removed 2026-09-23 (see below).
- **WorldRemit US->VN, dated 2026-09-14 — correction (2026-09-27):** a prior note here said this "now
  defaults to a USD Cash Pickup" and should be reviewed or removed. That was wrong, and the error was
  mine: I was testing worldremit.com directly to see whether the rate could be re-verified, and the
  receive-method I happened to test (the page's default) showed a USD payout. I never checked what the
  stored row itself renders on Corridor's own page. It has rendered a VND amount the whole time (this row
  was never touched or re-sourced) -- confirmed 2026-09-27 against a user report that /compare/US/VN
  shows WorldRemit at a VND amount and 1.4% cost, which matches this row's stored data and math exactly
  (7,671,150 VND / $300 = 25,570.5, vs. that day's live USD->VND fixing). Nothing was fixed here between
  09-23 and 09-27; the row was simply mischaracterized in the note above. It is still 13 days old as of
  2026-09-27, not currently flagged (its cost is positive), and the same review-by-2026-10-14 plan still
  applies if it can't be re-verified by then.
- **PayPal (Xoom) EUR->IN, dated 2026-09-14** (previous entry).

**After the pass:** 0 corridor/tiers raise the anomaly banner; 4 show the same-day fixing-lag note
(CA->ZA Remitly Large, US->IN Remitly Large, US->MX Revolut both tiers). The US->MX card shows
"1 rate under review" (fresh Revolut is the negative row); Wise's live MXN rate sat about 1.2% from the
fixing at survey time, the known limitation of the 0.5% band.

**GB->IN Ria (2026-09-23).** The last of the older manual rows outside the earlier passes (dated
2026-09-07, Everyday tier only) was re-quoted: standard rate 127.159 INR (promo 129.4213), fee GBP1.50.
The old row implied about 115.6, roughly 9% below the market, so it had been overstating Ria's cost
badly rather than merely aging. It now sits alongside the other GB->IN providers.

**Revolut US->VN removed (2026-09-23).** Both tiers (dated 2026-09-14, quoted a VND payout at 25,839.74)
were deleted. Revolut's US widget no longer lists a VND recipient (searching "VND" finds nothing; Vietnam
appears only as a USD payout) and its US Vietnam page 404s, so the row could not be re-verified and no
longer described something the provider shows. It is recoverable from git history if a VND route
returns. WorldRemit US->VN is kept for now: its US page quotes only a USD Cash Pickup, but its own copy
says VND is available by receive method and that could not be ruled out; remove it if it is still
unreproducible when it reaches ~30 days old (2026-10-14).

## 2026-09-27 — Re-sourcing pass 3, and the staleness cadence question

A user's independent live-site check three days after pass 2 found the anomaly-note count had gone
from 1 corridor to 8 (roughly half the directory), and flagged two inaccuracies in this doc's
"still open" notes (WorldRemit US->VN and PayPal EUR->IN -- both corrected above; neither was a code
issue, both were errors in how this doc described prior findings).

**Re-sourced (dated 2026-09-27, from each provider's own page, both tiers unless noted): 49 rows.**
- XE: CA->VN, GB->BD, AU->VN.
- Paysend: CA->PH, CA->VN, EUR->PH, GB->BD.
- Remitly: CA->PH (Large), CA->VN (Large), CA->ZA, AU->IN (Large), AU->PH (Large), AU->ZA.
- Revolut: CA->PH, CA->VN (no dedicated `/en-CA/` calculator, but the generic `revolut.com/money-transfer`
  widget's send-currency search accepts CAD even without a country-specific page -- same technique as the
  earlier CA->ZA exclusion note, except it turns out CAD *is* selectable there, just not as a bank-provided
  bank-transfer default); AU->PH, AU->VN via the `/en-AU/` page.
- Ria: GB->IN, AU->PH, AU->VN.
- WorldRemit: EUR->PH, GB->IN, AU->VN (confirmed each read against the correct origin country).
- MoneyGram: CA->PH, CA->VN, GB->BD, GB->IN, AU->PH. Several of these default to a receive currency other
  than the corridor's (USD/AUD instead of PHP/VND) -- the page has a hidden native `<select>` behind its
  custom currency picker; setting that select's value directly (native setter + `input`/`change` events)
  switches it reliably where clicking the visible picker did not.
- PayPal (Xoom) EUR->IN: see the correction above.

Peer sweep clean (0 rows beat their peer cluster by >8%). Every corridor/tier now reads positive; 0
anomaly banners, 0 same-day lag notes, 0 directory cards flagged.

**Not touched, per the brief:** Wise, PayPal (where Lambda-managed), and Western Union -- these are
refreshed by the Lambda on its own schedule and were not the source of any of the flags in this pass.

**What actually triggers "under review": there is no explicit staleness threshold.** The cost-anomaly
check (`lib/corridors.ts`) doesn't look at a row's age directly -- it only checks whether
`costPercent < 0` right now (with the 0.5% same-day exemption from the tolerance work). A row goes
negative when the *live mid-market rate has moved past the margin the row was quoted with*, which is a
function of (a) how old the quote is and (b) how much the currency pair has moved since, not a fixed
day-count. That's why the flag count went from 1 to 8 in three days: nothing about the code changed:
FX markets kept moving, thin-margin rows (many are 0.1-0.3% below their peers even when fresh) crossed
zero first, and the 0.5% same-day exemption stopped applying the moment each row turned one day old.

**Recommendation on cadence: manual, roughly weekly, is the right call for now -- don't build a
scheduled job for this.** Reasoning:
- The volume is bounded and known: 7 manually-sourced providers x up to 20 corridors x 2 tiers is at
  most 280 rows, and in practice each pass only touches the ones that actually drifted negative (this
  pass was 49; the prior one was 47; both were a similar few hours of browser-driven sourcing).
- A scheduled job doesn't remove the human step here the way the Lambda does for Wise/PayPal/WU. Those
  three have a real, documented API this pipeline can call unattended and a peer-outlier guard that can
  reject a bad read automatically. The 7 manual providers have no such API by definition -- "automating"
  their re-sourcing would mean automating the same browser-scraping this pass just did by hand, against
  sites with no stability contract (see this pass's MoneyGram currency-selector workaround, or the
  recurring promo-cap/receive-currency quirks throughout this doc). That's a scraper to build and
  maintain against providers who owe it nothing, for a payoff of saving a few hours every week or two --
  a worse trade than it looks at first, and exactly the kind of "automate what's actually verifiable, not
  what's convenient" tradeoff this project's own case study argues for elsewhere.
- What *would* be worth adding, cheaply: a periodic reminder (a calendar hold, a cron that just emails
  "check the homepage for under-review counts," nothing that touches data) on roughly a 7-10 day cadence,
  since that's the interval at which the count climbed from 1 to 8 this time. That closes the actual gap
  (nobody was watching) without building infrastructure the provider landscape doesn't support.

## 2026-10-01 — Corridor expansion: 12 currency-pair corridors + 8 Eurozone countries; 6 corridors removed

Scope: add corridors the earlier feasibility pass confirmed as real 3/3 (Wise + PayPal + Western
Union) comparisons, and remove the corridors that the 2026-10-01 provider-toggle (`ENABLED_PROVIDERS` in
`lib/corridors.ts`) left showing only one provider -- the "a comparison with one entry isn't one" rule
applied to existing corridors, not just prospective ones.

**12 new direct currency-pair corridors**, all 3 providers live via the Wise Comparison API (no manual
rows, same as every pre-existing API-backed corridor): every ordered pair among USD/GBP/AUD/CAD receiving
into the matching single-currency country -- US->GB, US->AU, US->CA, GB->AU, GB->CA, GB->US, AU->GB,
AU->CA, AU->US, CA->GB, CA->AU, CA->US. Tier amounts follow the existing split by send currency: USD/GBP
senders at 200/2000, AUD/CAD senders at 300/3000 -- the same scaling the US/GB/EUR-vs-AU/CA split for
India already uses in this file, not a new convention.

**32 new Eurozone corridors**: Germany, France, Spain, Italy, Netherlands, Portugal, Austria, Ireland,
each receiving from USD, GBP, AUD, and CAD (8 countries x 4 send currencies). Wise and Western Union are
live via the API for all 32. **PayPal is manually sourced for all 32, including Germany** -- see the new
convention note below, this is a deliberate exception to "if the API returns it, let it auto-refresh."

**Architecture fix required first: `targetCountry` was never passed to the Wise API.**
`scripts/lib/refresh-core.mjs`'s `fetchWiseComparison` only ever sent `sourceCurrency`/`targetCurrency`/
`sendAmount` -- never `targetCountry`. That was invisible until now because every existing corridor's
receive currency maps to exactly one country (INR -> India, PHP -> Philippines, etc.), so there was never
an ambiguity for the API to resolve one way or the other. Confirmed by direct testing: querying
`targetCurrency=EUR` with no `targetCountry` doesn't return some Eurozone-wide blended quote -- it
silently returns **Germany's** quote, no matter which Eurozone corridor is actually being refreshed.
Left unfixed, the very first scheduled Lambda run after these 8 Eurozone countries went live would have
quietly overwritten France's, Spain's, Italy's, Netherlands', Portugal's, Austria's, and Ireland's
Wise/Western Union rows with Germany's numbers -- a silent, self-inflicted version of exactly the kind of
mix-up this doc exists to catch. Fixed: `fetchWiseComparison` and `computeRefresh` now thread
`corridor.receiveCountry` through as `targetCountry` on every call, for every corridor, not just the new
ones. Verified harmless for existing corridors (identical API response with or without it, checked on
US->IN) and confirmed it correctly disambiguates all 8 Eurozone countries (Western Union's fee/rate
genuinely differ by country -- see the Xoom note below for the cross-country numbers). All 18 existing
`aws/test/handler.test.mjs` tests still pass unchanged after this fix.

**New convention: Xoom-manual PayPal now also covers a case where the Wise API *does* return PayPal.**
Of these 8 Eurozone countries, Wise's API only returns a PayPal quote for Germany (confirmed independently
two ways: the public `api.wise.com/v3/comparisons` endpoint and `wise.com/gateway/v4/comparisons`, the
richer endpoint the live wise.com site itself calls, which lists every country each provider actually
covers -- PayPal: Germany only; Western Union: all 8). Rather than let Germany be the one Eurozone
corridor where PayPal is API-refreshed while its 7 siblings are Xoom-manual (a split that would be its own
source of future confusion), Germany's PayPal row is **also** sourced from Xoom -- which happens to be a
better rate anyway (Xoom: 1 USD = 0.8576 EUR, $0 fee; Wise's feed for the same corridor: 0.8436, $4.99
fee). Because the Wise API *does* have an answer for `EUR->DE PayPal`, the refresh pipeline needed an
explicit instruction not to use it: `scripts/lib/refresh-core.mjs` now has a `MANUAL_OVERRIDE` set
(four entries, `"US|DE|PayPal"`, `"GB|DE|PayPal"`, `"AU|DE|PayPal"`, `"CA|DE|PayPal"` -- keys are
`send|receive|provider`; the first version used `"EUR|DE|PayPal"`, which matched nothing, see the 2026-10-02
incident below) that `computeRefresh` checks before fetching, skipping it
exactly like "provider not in this response." Without this, the next unmodified refresh run would have
silently reverted Germany's PayPal row back to Wise's worse quote. The other 7 countries need no such
override -- Wise's API returns nothing for them, so the existing "row exists but provider absent from
response" skip already protects them.

**Xoom's rate, confirmed flat across all 8 countries, captured per send currency (2026-10-01, by
intercepting the live page's own `wapi/guest-app/remittance` request at xoom.com/<country>/send-money,
switching the page's own currency selector -- no login, no API replay):**
- USD: 1 USD = 0.8576 EUR, $0 fee
- GBP: 1 GBP = 1.1335 EUR, £0 fee
- AUD: 1 AUD = 0.6117 EUR, A$0 fee
- CAD: 1 CAD = 0.6064 EUR, C$0 fee

Confirmed identical across France, Spain, Italy, Netherlands, Portugal, Austria, Ireland, and Germany for
each currency -- this really is one flat Eurozone rate on Xoom's side, not 8 independently-verified
numbers. (Western Union, by contrast, genuinely does vary by country on the same corridor -- e.g. USD
sending $1,000: Germany fee $0.99/rate 0.8742, Spain fee $1.99/rate 0.8698, France fee $0.99/rate 0.8831.
Don't assume Wise/WU rows can be copied across these 8 countries the way the PayPal row can.)

This Xoom quote is **not safely callable outside a real browser session** -- replaying the same POST
request with matching parameters returns a generic 400 rejection, and digging further into why was out of
scope (not something to reverse-engineer around). Treat these 32 PayPal rows exactly like the existing
Xoom-manual rows (US->IN, US->VN, EUR->IN): periodic manual re-check, never Lambda automation. Because the
rate reads as one flat number across all 8 countries rather than a per-country figure, a re-check pass
likely only needs to verify it once per send currency, not 8 times -- but don't assume it never moves;
verify it each time rather than assuming today's number is still current.

**6 corridors removed** (full deletion -- there is no soft-hide mechanism for corridors in this codebase,
only for providers via `ENABLED_PROVIDERS`; recoverable from git history if live 3-provider data ever
exists for them again): AU->IN, CA->IN, EUR->BD, EUR->ZA, GB->PK, US->PH. These were the 6 of the original
20 that had only Wise live among the 3 API-backed providers (no PayPal or Western Union row ever existed
for them) -- after the provider-toggle hid the 7 manually-sourced providers, each one degraded to a single
visible provider, the same "one entry isn't a comparison" problem flagged for prospective new corridors
applied retroactively.

**Verification**: `tsc --noEmit` and `eslint` clean; `next build` generated all 58 static corridor pages
(20 - 6 + 12 + 32); removed corridors 404, new corridors 200. Full sweep of all 44 new corridors x both
tiers via `/api/compare`: every one returns exactly Wise/PayPal/Western Union, no leaks, no gaps, no row
beating its peer cluster by more than the 8% guard threshold. 25 Large-tier rows across the new corridors
read a hair negative (all within the existing 0.5% `COST_ANOMALY_TOLERANCE`, all dated today) -- these
render as the existing, intentional "reads slightly below mid-market, likely the reference rate lagging
the market" note, not an anomaly banner, confirmed on `/compare/US/DE` Large tier. The homepage directory
never shows this at all for these rows regardless, since `getCorridorTeaser` only ever evaluates the
Everyday tier, and every new corridor's Everyday-tier teaser is clean. Final corridor count: 58. Final
provider-rate row count: 506.

**Side note, not acted on**: `getCorridorTeaser` (the homepage card's `underReview` count) checks raw
`costPercent < 0` without the `withinFixingLagAllowance` tolerance that `rankRows`'s `costAnomaly`/
`lagAllowed` split uses elsewhere. It never fires today because the teaser only evaluates the Everyday
tier and no new Everyday-tier row is negative -- but it's a latent inconsistency between the homepage and
the detailed corridor page that predates this pass and wasn't introduced by it. Worth a look if an
Everyday-tier row ever lags the benchmark by a hair on a fresh same-day quote; out of scope here.

## 2026-10-02 -- Incident: stale Lambda overwrote every Eurozone corridor; override key matched nothing

**What happened.** The 2026-10-01 Eurozone expansion depended on two fixes to `scripts/lib/refresh-core.mjs`
(pass `targetCountry`; the Germany-PayPal `MANUAL_OVERRIDE`). The fixes were committed and tested, but **the
deployed Lambda was never redeployed** -- it was still the 2026-09-21 build. Its 2026-10-02 06:17 UTC run
(commit `73e9907`, 330 rows, `blocked: 0`) fetched EUR quotes without a country, which silently means
Germany, and wrote them into all 32 Eurozone-receive corridors:
- 168 of 168 non-Germany Eurozone Wise/Western Union/PayPal rows became identical to Germany's values;
- all 64 Eurozone PayPal rows lost their Xoom source and took Wise's (worse) PayPal quote.
Neither guard fired: each individual change was under the 8% thresholds. Custom-amount quotes were partly right
(the live-quote path was already fixed and deployed on Vercel) but PayPal was estimated from the corrupted
stored rows. The 12 currency-pair and 14 older corridors were unaffected (one country per receive currency).

**A second bug found while repairing.** The first `MANUAL_OVERRIDE` entry was `"EUR|DE|PayPal"`. Keys are
`send|receive|provider` and no Eurozone-receive corridor has `EUR` as its send country, so the override matched
nothing and would have kept overwriting Germany's PayPal. The tests never exercised a Eurozone-receive corridor.
Found by a dry-run that proposed `US->DE PayPal 165.16 -> 165.2`. Fixed (four real keys) and covered by three new
tests in `aws/test/handler.test.mjs`; confirmed each new test fails if the broken key is put back.

**Repair (2026-10-02).** Lambda redeployed twice (first with the code fix, then with the corrected override; same
six stack parameters, change set checked to modify only the function's `Code`). Eurozone PayPal rows restored
verbatim from `4c613fc` (Xoom, **dated 2026-10-01** -- not re-sourced today, so they age on the normal manual
cadence); Wise/Western Union for the 32 corridors re-fetched per country through the same shared code
(`computeRefresh`, peer guard on, 0 blocked, 0 errors); a check confirmed nothing outside the Eurozone-receive
corridors changed. Deployed-Lambda dry-run after: 266 proposed / 70 skipped, 0 Germany PayPal proposals.

**Rules this adds.**
- Any change to `scripts/lib/refresh-core.mjs` (or the handler) is **not live until the Lambda is redeployed**;
  see "Redeploying after a code change" in `docs/aws-automation.md`.
- A new override or guard needs a test that fails when it is broken, not only one that passes when it works.
- After adding corridors whose receive currency is shared by several countries, dry-run the refresh and look at
  the per-country values before the next scheduled run.

## Outbound "Go to <provider>" links (2026-10-02)

Every provider row (and the "Cheapest right now" card) carries a plain link to that provider's own site, opened
in a new tab (`target="_blank" rel="noopener noreferrer"`). Corridor does not handle transfers, there is no
redirect through our backend, and the link says nothing about the freshness of the quote beside it (it appears on
verified, live and estimated rows alike).

- **Where the URLs come from:** `lib/provider-links.ts`, one builder per provider. Deep-linked to the corridor
  where the provider's URL scheme supports it (Wise, Remitly, XE, Revolut, Ria, WorldRemit, Xoom, and Paysend for
  GB/CA/AU senders); Western Union also takes the compared amount. MoneyGram, Paysend (US/Eurozone senders) and
  PayPal's own pages are the sender country's general send-money page, because their corridor URLs don't work
  (MoneyGram redirects unknown paths home; Paysend serves a "United Kingdom to China" 200 page for anything it
  doesn't recognise).
- **PayPal rows sourced from Xoom** (the 32 Eurozone-receive corridors, EUR->IN and US->VN; US->IN is PayPal-sourced, so it links to PayPal) link to the matching
  `xoom.com/<country>/send-money` page, because that is where the quote can be reproduced. The Xoom check reads the
  stored data row's `source`, not the ranked row's (which is rewritten on custom amounts).
- **Eurozone senders** (`sendCountry` = `EUR`) use Ireland's English-language site for every provider, since the
  Eurozone has no single sender country.
- **Known soft spots:** Revolut has no Canadian site (`/en-CA/` is a 404), so Canadian senders get the unprefixed
  page, which is Revolut's destination page with the UK as the sender. PayPal Ireland has no international-transfer
  page, so the one EUR->PH PayPal row links to PayPal Ireland's send-money page.
- **Re-verifying:** `node scripts/check-provider-links.mjs` builds every link the data can produce and fetches it,
  failing on non-200s and on deep links whose page title doesn't name the destination. Providers that bot-block
  plain HTTP (Revolut, Ria) or render client-side (Western Union) come back `UNCHECKED` and need a browser pass.
  Re-run it after adding a corridor or provider, and when a provider redesigns its site.

## Hand-sourced PayPal sanity check (2026-10-05)

**Why it exists.** Xoom's public guest calculator tags every quote `FIRST_TIME_RATE`, so a hand-entered PayPal row
can be a first-time promotional quote without anyone noticing. The 2026-10-04 audit found two such suspects among
the 35 hand-sourced PayPal corridors: **US->IN at 0.23%** below mid-market (dated 2026-09-01, source just
`Paypal (Xoom)`) and **all eight AU->Eurozone corridors at 0.34%** (dated 2026-10-01). Every other row sits at
1.2-3.2%, and Xoom's real-world cost is 1.2-4.9% (World Bank RPW, Q3 2025).

**The rule.** For each hand-sourced PayPal row (provider PayPal, `source` not the Wise comparison API), compute

    spread = 1 - (amountReceived / sendAmount) / mid-market(row.dateChecked)      # fees included

using Frankfurter's mid for the row's own date, and **flag anything under 1%**. A spread that thin is almost
certainly a promotional quote caught by accident, not a legitimate rate.

**Required step.** After hand-entering or re-sourcing ANY PayPal row, run:

    npm run check:paypal-spread

It exits 0 when every row passes, 1 when a row is flagged, 2 when a row couldn't be checked (no mid available).
Don't commit a flagged row unless you have re-sourced it from a standard-rate quote (logged-in or
returning-customer) -- or, if the thin spread is real and you can show it, add an entry to
`data/paypal-spread-allowlist.json` with `sendCountry`, `receiveCountry`, `dateChecked`, `verifiedOn` and `reason`.
An entry only applies to that exact `dateChecked`: re-sourcing the row ends the exemption and needs a fresh one.
The check is not part of the Lambda (the refresh job never touches these rows) and there is no CI in this repo, so
it is a manual gate. Logic: `scripts/lib/spread-check.mjs`; offline tests: `npm run test:spread-check`.

**"Under review" label.** A flagged row stays in the data exactly as entered (we don't correct it without a real
logged-in rate), but the site marks it so visitors aren't shown a probable promotional quote with no caveat: an
"Under review" badge and note on the corridor page row, and a notice plus "Under review." in the Quote row on the
head-to-head page. Which rows get it is `data/under-review.json` (corridor, provider, `dateChecked`, `reason`;
logic in `lib/under-review.ts`). Like the allowlist, an entry only applies to that exact `dateChecked`, so
re-sourcing the row removes the label by itself. `npm run check:paypal-spread` prints any flagged corridor that has
no entry; `npm run test:under-review` fails if an entry no longer matches a real row. As of 2026-10-09 the label is on
US->IN and the eight AU->Eurozone corridors. When a row is re-sourced, also delete its entry. Labelled rows are still
ranked normally (US->IN PayPal currently ranks second, not Best value).

**What it does not prove.** It only catches quotes that are too good to be true. A row above 1% is not thereby
verified as a standard rate. The mid is Frankfurter's daily reference rate, not Xoom's intraday rate, so expect
~0.3% of noise either way (the 1% threshold leaves margin for that). Both rows and mid are daily snapshots.

**Audit of the AU->Eurozone rows (2026-10-05).** The 16 rows (8 countries x 2 tiers) are one observation copied
across the eight countries, not eight independent ones: a single `1 AUD = 0.6117 EUR`, AUD 0.00 fee, which the
source note says was cross-checked as identical across the eight countries. That is **0.34%** below the 2026-10-01
mid, and 0.50-0.52% against the 2026-09-30 and 2026-10-02 mids, so it fails the 1% test under any nearby date. The
same page and the same "Best Xoom Rate" label give 2.34% for CAD, 2.84% for USD and 3.15% for GBP. One independent
third-party data point (SendMoneyCompare, 2026-10-05, provenance unverified) has Xoom AUD->EUR at 0.6145 with a
13.29 AUD fee on 1,000 AUD, about 1.9% all-in against that day's mid. Verdict: the AU rows are very likely a
first-time quote with the fee waived, same as US->IN. They have NOT been changed; they need a standard-rate
re-source. US->IN is also unchanged pending a real logged-in rate.

**Current state:** `npm run check:paypal-spread` flags 9 corridors (US->IN and the 8 AU->Eurozone) and exits 1
until they are re-sourced. That is the intended result, not a bug.

## Fee, rate and delivery fields on rows (2026-10-07)

Rows may carry four optional fields describing the same quote as `amountReceived`: `rate` (the provider's
exchange rate, receive per 1 send), `fee` (in the send currency), and `deliveryMinMinutes` / `deliveryMaxMinutes`
(the window the provider states). They feed the "recipient gets / fee / rate / delivery" rows on the corridor
page. Rules:

- **API-backed rows** get them from the Wise comparison API on every refresh (`quoteBreakdown` in
  `scripts/lib/refresh-core.mjs`). The keys are always written, undefined when the API doesn't give them, so a field
  the API stops providing is *removed*, never left stale beside a fresh amount. The API gives fee and rate for all
  three providers, but a delivery time **only for Wise**; Western Union and PayPal have none, so none is stored.
- **Hand-sourced PayPal (Xoom) rows** carry `rate`/`fee` only where the row's source note states them explicitly
  (`1 AUD = 0.6117 EUR`, `AUD0.00 fee`) and they reproduce `amountReceived`. US->IN's legacy `Paypal (Xoom)` row
  states neither, so it has neither. Nothing is estimated.
- **Display guard.** `consistentBreakdown` (`lib/row-breakdown.ts`) shows fee and rate only when
  `(sendAmount - fee) * rate` is within 1% of `amountReceived`; otherwise the UI says "see provider" instead of
  showing a number that contradicts the amount beside it. Estimated rows never show them.
- **The Lambda was redeployed 2026-10-08** (code hash `6AQ60j/kD2ydYxo8dMRdrVTUFnv8zra62eWajKxhW/w=`; the handler's
  integrity check now allows these fields) so the daily run keeps them current. Any future change to
  `refresh-core.mjs` or the handler needs the same redeploy ("Redeploying after a code change" in
  `docs/aws-automation.md`). If a run ever happens on older code, it refreshes amounts but leaves these fields as
  they were; the display guard then hides any whose amount has drifted by more than 1%.

## 2026-10-08: custom-amount range, and no estimates where the feed said no

**Range is now $10 to $50,000** (was $100 to $10,000), set from probing the Wise comparison feed on USD/GBP/AUD/CAD
corridors rather than from provider limits. At $1 the feed returns none of Wise, PayPal or Western Union for USD or AUD
sends; from $10 up it does. At $50,000 Wise still quotes everywhere, but PayPal drops out above roughly $10,000 and Western
Union on some corridors above roughly $25,000. (An earlier draft justified $50,000 as the Western Union and PayPal
personal-transfer limit. The feed contradicts that, so the comment was rewritten to say what was measured.)

**Rule change in `getCustomAmountRanking`.**
- A live-capable provider that the feed *answered without* is left out and named on the page ("has no quote at this
  amount"), not estimated. Drawing a line from the two verified amounts would invent a quote the provider never made.
  Estimates fill in for live providers only when the live call itself failed.
- Estimated rows (hand-sourced providers, e.g. Xoom PayPal; or live providers while the feed is down) are only drawn
  between 0.5x the lower and 5x the higher verified amount (`ESTIMATE_BELOW` / `ESTIMATE_ABOVE`). Outside that, left out.
- `liveStatus` is now `live` or `unavailable`; `partial` no longer exists.

**Homepage example** ("send $200 ... X delivers ...") is computed at render time by `app/page.tsx` from the US->IN
Everyday rows (`lib/home-example.ts`), regenerated hourly. Rows labelled "Under review" are excluded, and nothing is shown
if fewer than two rows remain or the top is a tie. It was briefly hardcoded; do not reintroduce literal figures there.
