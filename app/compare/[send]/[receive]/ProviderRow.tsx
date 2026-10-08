"use client";

import { useId, useState } from "react";
import type { Corridor, RankedProvider } from "@/lib/corridors";
import { FRESHNESS_DOT_CLASS, freshnessLevelFor } from "@/lib/freshness";
import { money, percent, rate as formatRate } from "@/lib/format";
import { formatDelivery } from "@/lib/row-breakdown";

// One provider as a row, in the pattern SendMoneyCompare uses: the amount the
// recipient gets is the headline, with fee, exchange rate and delivery beside
// it, a Best value badge on the top pick, an expandable "Transfer details"
// panel, and a Send button to the provider's own site.
//
// Every figure is shown only when it is actually known for THIS row. Fee,
// rate and delivery come from the same quote as the amount (and the fee/rate
// pair only passes lib/row-breakdown's consistency check); where a row doesn't
// have one (an estimate, a hand-sourced quote that doesn't state it, a
// provider whose API gives no delivery time) the cell says "See provider"
// rather than inventing a figure.

// timeZone: "UTC" is load-bearing, not cosmetic: dateChecked is a date-only
// value, and without a pinned zone the server render and the visitor's
// browser can format the same string to different days (a real React
// hydration failure on this site before; see the Corridor case study).
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function Stat({
  label,
  value,
  unknown = false,
}: {
  label: string;
  value: string;
  unknown?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.7rem] font-semibold uppercase tracking-wider text-text-faint">{label}</dt>
      <dd className={`mt-0.5 text-sm font-semibold ${unknown ? "font-medium text-text-faint" : "text-text"}`}>
        {value}
      </dd>
    </div>
  );
}

// What backs the number, in the badge position: "Live quote" or "Estimated"
// where that applies, plus the check date for any row that is NOT rewritten
// daily by the refresh job (p.autoRefreshed). Hand-sourced rows keep their date,
// with the aging/stale dot, even when the number is an estimate: it is the only
// visible sign of how old that row's data is. API-refreshed rows drop it (it
// carries no information), so a verified, auto-refreshed row shows nothing here.
function Basis({ p }: { p: RankedProvider }) {
  const level = freshnessLevelFor(p.dateChecked);
  return (
    <>
      {p.basis === "live" && (
        <span
          title={p.source}
          className="inline-flex items-center gap-1.5 rounded-full bg-mint px-2.5 py-1 text-xs font-bold text-brand"
        >
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-brand" />
          Live quote
        </span>
      )}
      {p.basis === "estimated" && (
        <span
          title={p.source}
          className="inline-flex items-center rounded-full border border-dashed border-amber-600 px-2.5 py-1 text-xs font-bold text-amber-800"
        >
          Estimated
        </span>
      )}
      {p.underReview && (
        <span
          title="This quote looks unusually cheap for PayPal and is being confirmed"
          className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900"
        >
          Under review
        </span>
      )}
      {!p.autoRefreshed && (
        <span
          title={new Date(p.dateChecked).toLocaleDateString("en-US", { timeZone: "UTC" })}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-text-dim"
        >
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${FRESHNESS_DOT_CLASS[level]}`} />
          <span className="sr-only">Checked </span>
          {shortDate(p.dateChecked)}
        </span>
      )}
    </>
  );
}

// Plain-language provenance for the details panel.
function sourceNote(p: RankedProvider): string {
  if (p.basis === "live") {
    return "A live quote for exactly this amount, fetched just now from Wise's public comparison feed.";
  }
  if (p.basis === "estimated") {
    return "An estimate: this amount wasn't checked directly. It is read off a straight line between the two amounts we did verify, so treat it as rougher.";
  }
  if (p.autoRefreshed) {
    return `Refreshed daily from Wise's public comparison feed. Last checked ${shortDate(p.dateChecked)}.`;
  }
  const via = p.transferUrl?.includes("xoom.com") ? " from Xoom, PayPal's money transfer service" : " from the provider's own site";
  return `Entered by hand${via} on ${shortDate(p.dateChecked)}. Hand-sourced rows aren't refreshed automatically, which is why the date is shown.`;
}

const UNDER_REVIEW_NOTE =
  "Under review: this quote is cheaper than PayPal's pricing usually is, which can mean it was a first-time promotional rate rather than the standard one. We're confirming it, so check PayPal's own quote before you send.";

export default function ProviderRow({
  provider: p,
  corridor,
  best,
  midRate,
  showCompare,
  selected,
  selectDisabled,
  onToggleCompare,
}: {
  provider: RankedProvider;
  corridor: Pick<Corridor, "sendCurrency" | "receiveCurrency">;
  best: boolean;
  midRate: number;
  showCompare: boolean;
  selected: boolean;
  selectDisabled: boolean;
  onToggleCompare: (provider: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const { sendCurrency, receiveCurrency } = corridor;

  const hasFeeRate = p.fee !== undefined && p.rate !== undefined;
  const hasDelivery = p.deliveryMinMinutes !== undefined && p.deliveryMaxMinutes !== undefined;
  const allInRate = p.amountReceived / p.sendAmount;
  const bestLabel = p.basis === "estimated" ? "Best value (estimated)" : "Best value";

  return (
    <li
      className={`relative rounded-2xl bg-white p-4 sm:p-5 ${
        best
          ? "border-2 border-lime shadow-[0_10px_30px_-14px_rgba(22,51,0,0.45)]"
          : "border border-card-border"
      }`}
    >
      {best && (
        <span className="absolute -top-3 left-4 rounded-full bg-lime px-3 py-1 text-xs font-extrabold text-brand shadow-sm">
          {bestLabel}
        </span>
      )}

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)_auto] sm:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h3 className="font-heading text-xl font-extrabold tracking-[-0.03em] text-brand sm:text-2xl">
              {p.provider}
            </h3>
            <Basis p={p} />
          </div>
          {p.benchmarkReference && (
            <p className="mt-1 text-xs text-text-dim">Benchmark reference, not ranked</p>
          )}
          {p.underReview && (
            <p className="mt-1 text-xs text-amber-900">Cheaper than PayPal usually is. Check PayPal&rsquo;s own quote.</p>
          )}
          <div className="mt-3">
            <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-text-faint">Recipient gets</p>
            <p className="font-heading text-3xl font-extrabold leading-tight tracking-[-0.03em] text-text sm:text-[2rem]">
              {money(receiveCurrency, p.amountReceived)}
            </p>
            {!p.benchmarkReference && (
              <p className="text-xs text-text-dim">
                <span className="font-semibold text-cost">{percent(p.costPercent)}</span> total cost vs.
                mid-market
              </p>
            )}
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-x-3 gap-y-3 border-t border-card-border pt-4 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
          <Stat
            label="Fee"
            value={hasFeeRate ? money(sendCurrency, p.fee!) : "See provider"}
            unknown={!hasFeeRate}
          />
          <Stat
            label="Rate"
            value={hasFeeRate ? formatRate(p.rate!) : "See provider"}
            unknown={!hasFeeRate}
          />
          <Stat
            label="Delivery"
            value={hasDelivery ? formatDelivery(p.deliveryMinMinutes!, p.deliveryMaxMinutes!) : "See provider"}
            unknown={!hasDelivery}
          />
        </dl>

        <div className="flex flex-col gap-2 sm:items-end">
          {p.transferUrl ? (
            <a
              href={p.transferUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary w-full px-6 py-3 sm:w-auto"
            >
              Send with {p.provider}
              <svg
                aria-hidden="true"
                viewBox="0 0 12 12"
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4.5 2.5h5v5M9.5 2.5l-7 7" />
              </svg>
              <span className="sr-only"> (opens {p.provider}&rsquo;s site in a new tab)</span>
            </a>
          ) : (
            <span className="text-sm text-text-faint">No transfer link available</span>
          )}
          {showCompare && !p.benchmarkReference && (
            <label
              className={`inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-text-dim ${
                selectDisabled && !selected ? "cursor-not-allowed opacity-50" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={selected}
                disabled={selectDisabled && !selected}
                onChange={() => onToggleCompare(p.provider)}
                className="h-4 w-4 rounded border-card-border accent-[#163300]"
              />
              Compare
              <span className="sr-only"> {p.provider} with another provider</span>
            </label>
          )}
        </div>
      </div>

      <div className="mt-3 border-t border-card-border pt-2.5">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-md py-1 text-sm font-semibold text-link hover:underline"
        >
          Transfer details
          <svg
            aria-hidden="true"
            viewBox="0 0 12 12"
            className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2.5 4.5 6 8l3.5-3.5" />
          </svg>
        </button>

        {open && (
          <div id={detailsId} className="mt-2 rounded-xl bg-soft p-4">
            <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-semibold text-text-dim">You send</dt>
                <dd className="text-text">{money(sendCurrency, p.sendAmount, 0)}</dd>
              </div>
              <div>
                <dt className="font-semibold text-text-dim">Fee</dt>
                <dd className="text-text">
                  {hasFeeRate ? money(sendCurrency, p.fee!) : "Not available for this quote"}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-text-dim">Provider&rsquo;s exchange rate</dt>
                <dd className="text-text">
                  {hasFeeRate
                    ? `1 ${sendCurrency} = ${formatRate(p.rate!)} ${receiveCurrency}`
                    : "Not available for this quote"}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-text-dim">Mid-market rate</dt>
                <dd className="text-text">
                  1 {sendCurrency} = {formatRate(midRate)} {receiveCurrency}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-text-dim">What you effectively get</dt>
                <dd className="text-text">
                  1 {sendCurrency} = {formatRate(allInRate)} {receiveCurrency}, after fees
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-text-dim">Delivery</dt>
                <dd className="text-text">
                  {hasDelivery
                    ? formatDelivery(p.deliveryMinMinutes!, p.deliveryMaxMinutes!)
                    : "Not stated by this provider's feed. Check their site."}
                </dd>
              </div>
            </dl>
            <p className="mt-3 border-t border-card-border pt-3 text-sm text-text-dim">{sourceNote(p)}</p>
            {p.underReview && <p className="mt-2 text-sm font-medium text-amber-900">{UNDER_REVIEW_NOTE}</p>}
          </div>
        )}
      </div>
    </li>
  );
}
