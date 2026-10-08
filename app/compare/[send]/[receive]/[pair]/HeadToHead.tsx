"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useId } from "react";
import { AMOUNT_PARAM, amountQuery } from "@/lib/amount";
import type { Corridor, RankedProvider, RankedProvidersResult } from "@/lib/corridors";
import { CountryFlag } from "@/lib/flags";
import { money, percent, rate as formatRate } from "@/lib/format";
import { pairSlug } from "@/lib/provider-slug";
import { formatDelivery } from "@/lib/row-breakdown";
import { verdict, type Verdict } from "@/lib/versus";
import { withArticle } from "@/lib/geo";
import { useCorridorResult } from "../useCorridorResult";

export type OtherCorridor = {
  corridor: Corridor;
  sendAmount: number;
  a: { amountReceived: number };
  b: { amountReceived: number };
  verdict: Verdict;
};

type Props = {
  corridor: Corridor;
  providerNames: string[];
  a: string;
  b: string;
  initialResult: RankedProvidersResult;
  others: OtherCorridor[];
};

const sendName = (c: Corridor) => withArticle(c.sendCountryName);

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {children}
    </div>
  );
}

// "Wise: fee $9.16" style cells. Unknown stays "See provider", never a guess.
function cells(p: RankedProvider, sendCurrency: string) {
  const hasFeeRate = p.fee !== undefined && p.rate !== undefined;
  const hasDelivery = p.deliveryMinMinutes !== undefined && p.deliveryMaxMinutes !== undefined;
  return {
    fee: hasFeeRate ? money(sendCurrency, p.fee!) : null,
    rate: hasFeeRate ? formatRate(p.rate!) : null,
    delivery: hasDelivery ? formatDelivery(p.deliveryMinMinutes!, p.deliveryMaxMinutes!) : null,
  };
}

function Compared({
  corridor,
  providerNames,
  a,
  b,
  initialResult,
  others,
  urlAmount,
}: Props & { urlAmount: string | null }) {
  const router = useRouter();
  const pickerId = useId();
  const { amount, isDefault, result, loading, error } = useCorridorResult(corridor, initialResult, urlAmount);
  const { sendCurrency, receiveCurrency } = corridor;

  const query = amountQuery(isDefault && !urlAmount ? null : amount);
  const rowA = result.providers.find((p) => p.provider === a && !p.benchmarkReference);
  const rowB = result.providers.find((p) => p.provider === b && !p.benchmarkReference);
  const v = rowA && rowB ? verdict(rowA, rowB) : null;

  const anomalous = (result.costAnomaly ?? []).filter((x) => x.provider === a || x.provider === b);
  const underReviewed = [rowA, rowB].filter((r): r is RankedProvider => Boolean(r?.underReview));
  const anyEstimated = rowA?.basis === "estimated" || rowB?.basis === "estimated";

  function swap(which: "a" | "b", next: string) {
    const [na, nb] = which === "a" ? [next, b] : [a, next];
    const slug = pairSlug(na, nb);
    if (slug) router.push(`/compare/${corridor.sendCountry}/${corridor.receiveCountry}/${slug}${query}`);
  }

  const selectClass =
    "mt-1.5 w-full rounded-xl border border-card-border bg-white px-3.5 py-3 text-base font-semibold text-text";
  const label = "block text-xs font-semibold uppercase tracking-wider text-text-dim";

  return (
    <main className="mx-auto w-full max-w-4xl px-6 pb-20 pt-8 sm:pt-10">
      <Link
        href={`/compare/${corridor.sendCountry}/${corridor.receiveCountry}${query}`}
        className="inline-flex items-center gap-1 py-1 text-sm font-semibold text-link hover:underline"
      >
        <span aria-hidden="true">←</span> All providers for this corridor
      </Link>

      <h1 className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 font-heading text-4xl font-extrabold leading-tight tracking-[-0.045em] text-brand sm:text-6xl">
        <span>{a}</span>
        <span className="rounded-full bg-lime px-3 py-0.5 text-2xl sm:text-3xl">vs</span>
        <span>{b}</span>
      </h1>

      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-text-dim">
        <CountryFlag code={corridor.sendCountry} className="rounded-[2px]" />
        <span>{sendName(corridor)}</span>
        <span aria-hidden="true">→</span>
        <CountryFlag code={corridor.receiveCountry} className="rounded-[2px]" />
        <span>{corridor.receiveCountryName}</span>
        <span aria-hidden="true">·</span>
        <span>
          {isDefault && !urlAmount ? "a typical" : "sending"}{" "}
          <strong className="font-bold text-text">{money(sendCurrency, amount, 0)}</strong>
        </span>
        <span aria-hidden="true">·</span>
        <Link href={`/${query}`} className="font-semibold text-link underline underline-offset-4">
          {isDefault && !urlAmount ? "Set your own amount" : "Change amount"}
        </Link>
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {([
          ["a", a, b],
          ["b", b, a],
        ] as const).map(([which, current, other]) => (
          <div key={which}>
            <label htmlFor={`${pickerId}-${which}`} className={label}>
              {which === "a" ? "First provider" : "Second provider"}
            </label>
            <select
              id={`${pickerId}-${which}`}
              value={current}
              onChange={(e) => swap(which, e.target.value)}
              className={selectClass}
            >
              {providerNames
                .filter((n) => n === current || n !== other)
                .map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
            </select>
          </div>
        ))}
      </div>

      {error && (
        <Notice>
          We couldn&rsquo;t price {money(sendCurrency, error.requested, 0)} just now, so this shows a typical{" "}
          {money(sendCurrency, amount, 0)} instead.
        </Notice>
      )}

      {loading ? (
        <div className="mt-6 space-y-4" role="status" aria-live="polite">
          <span className="sr-only">Getting quotes for {money(sendCurrency, amount, 0)}…</span>
          <div className="h-28 animate-pulse rounded-3xl bg-mint/60" />
          <div className="h-64 animate-pulse rounded-3xl bg-card-border/40" />
        </div>
      ) : !rowA || !rowB || !v ? (
        <p className="mt-6 rounded-2xl border border-card-border bg-white px-4 py-3 text-sm text-text-dim">
          One of these providers has no quote for this corridor right now.
        </p>
      ) : (
        <>
          <section
            aria-labelledby="verdict"
            className="mt-6 rounded-3xl bg-brand px-6 py-7 text-white shadow-[0_18px_50px_-18px_rgba(22,51,0,0.6)] sm:px-8 sm:py-9"
          >
            <h2 id="verdict" className="sr-only">
              Verdict
            </h2>
            {v.kind === "winner" ? (
              <>
                <p className="font-heading text-3xl font-extrabold leading-tight tracking-[-0.04em] sm:text-5xl">
                  <span className="text-lime">{v.winner}</span> sends you {money(receiveCurrency, v.diff)} more
                </p>
                <p className="mt-3 text-base text-mint sm:text-lg">
                  On {money(sendCurrency, amount, 0)} that&rsquo;s {v.diffPercent.toFixed(1)}% more of your money
                  arriving than with {v.loser}.
                </p>
              </>
            ) : (
              <>
                <p className="font-heading text-3xl font-extrabold leading-tight tracking-[-0.04em] sm:text-5xl">
                  Too close to call
                </p>
                <p className="mt-3 text-base text-mint sm:text-lg">
                  {a} and {b} are within {money(receiveCurrency, Math.max(v.diff, 0.01))} of each other on{" "}
                  {money(sendCurrency, amount, 0)}, less than quotes move by before you check out.
                </p>
              </>
            )}
          </section>

          {anomalous.length > 0 && (
            <Notice>
              {anomalous.map((x) => x.provider).join(" and ")} reads below the live mid-market rate, which usually
              means that provider&rsquo;s data is stale rather than a better deal. Treat this result with care.
            </Notice>
          )}
          {underReviewed.length > 0 && (
            <Notice>
              {underReviewed.map((x) => x.provider).join(" and ")}&rsquo;s quote is under review: it is cheaper than
              that provider&rsquo;s pricing usually is and may be a first-time promotional rate. Check their own quote
              before you send.
            </Notice>
          )}
          {anyEstimated && (
            <Notice>
              One of these is an estimate, not a quote checked at this exact amount.{" "}
              <Link href="/methodology#estimates" className="font-semibold underline underline-offset-4">
                How estimates work
              </Link>
            </Notice>
          )}

          <div className="mt-6 overflow-x-auto rounded-3xl border border-card-border bg-white">
            <table className="w-full table-fixed text-left text-sm">
              <caption className="sr-only">
                {a} compared with {b}, {fromLabel(corridor)} to {corridor.receiveCountryName}
              </caption>
              <thead>
                <tr className="border-b border-card-border">
                  <th scope="col" className="w-[27%] px-2 py-4 sm:w-[28%] sm:px-6" />
                  {[rowA, rowB].map((p) => (
                    <th key={p.provider} scope="col" className="px-2 py-4 align-bottom sm:px-6">
                      <span className="block break-words font-heading text-base font-extrabold leading-tight tracking-[-0.03em] text-brand sm:text-2xl">
                        {p.provider}
                      </span>
                      {v.kind === "winner" && v.winner === p.provider && (
                        <span className="mt-1 inline-block rounded-full bg-lime px-2.5 py-0.5 text-xs font-extrabold text-brand">
                          Better value
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border">
                <Row label="Recipient gets" strong>
                  {[rowA, rowB].map((p) => (
                    <span key={p.provider} className="font-heading text-base font-extrabold tracking-[-0.03em] text-text min-[420px]:text-xl sm:text-3xl">
                      {money(receiveCurrency, p.amountReceived)}
                    </span>
                  ))}
                </Row>
                <Row label="Total cost">
                  {[rowA, rowB].map((p) => (
                    <span key={p.provider} className="font-semibold text-cost">
                      {percent(p.costPercent)}
                    </span>
                  ))}
                </Row>
                <Row label="Fee">
                  {[rowA, rowB].map((p) => {
                    const c = cells(p, sendCurrency);
                    return <Maybe key={p.provider} value={c.fee} />;
                  })}
                </Row>
                <Row label="Rate">
                  {[rowA, rowB].map((p) => {
                    const c = cells(p, sendCurrency);
                    return <Maybe key={p.provider} value={c.rate} />;
                  })}
                </Row>
                <Row label="Delivery">
                  {[rowA, rowB].map((p) => {
                    const c = cells(p, sendCurrency);
                    return <Maybe key={p.provider} value={c.delivery} />;
                  })}
                </Row>
                <Row label="Quote">
                  {[rowA, rowB].map((p) => (
                    <span key={p.provider} className="text-text-dim">
                      {p.underReview ? "Under review. " : ""}
                      {p.basis === "live"
                        ? "Live quote"
                        : p.basis === "estimated"
                          ? "Estimated"
                          : p.autoRefreshed
                            ? "Refreshed daily"
                            : `Hand-checked ${new Date(p.dateChecked).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                timeZone: "UTC",
                              })}`}
                    </span>
                  ))}
                </Row>
                <Row label="">
                  {[rowA, rowB].map((p) =>
                    p.transferUrl ? (
                      <a
                        key={p.provider}
                        href={p.transferUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-primary w-full whitespace-normal px-2 py-2.5 text-center text-xs leading-tight sm:px-5 sm:text-base"
                      >
                        Send with {p.provider}
                        <span className="sr-only"> (opens {p.provider}&rsquo;s site in a new tab)</span>
                      </a>
                    ) : (
                      <span key={p.provider} className="text-text-faint">
                        No link available
                      </span>
                    )
                  )}
                </Row>
              </tbody>
            </table>
          </div>
        </>
      )}

      {others.length > 0 && (
        <section aria-labelledby="others" className="mt-12">
          <h2 id="others" className="font-heading text-2xl font-extrabold tracking-[-0.03em] text-brand">
            {a} vs {b} on other corridors
          </h2>
          <p className="mt-1 text-sm text-text-dim">
            At a typical amount for each corridor, against that corridor&rsquo;s own live mid-market rate.
          </p>
          <div className="mt-4 hidden overflow-x-auto rounded-3xl border border-card-border bg-white sm:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-card-border text-xs uppercase tracking-wider text-text-dim">
                  <th scope="col" className="px-4 py-3 font-semibold sm:px-6">
                    Corridor
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">
                    {a}
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">
                    {b}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold sm:px-6">
                    Better
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border">
                {others.map((o) => (
                  <tr key={`${o.corridor.sendCountry}-${o.corridor.receiveCountry}`}>
                    <td className="px-4 py-3 sm:px-6">
                      <Link
                        href={`/compare/${o.corridor.sendCountry}/${o.corridor.receiveCountry}/${pairSlug(a, b)}${query}`}
                        className="inline-flex flex-wrap items-center gap-x-1.5 font-semibold text-brand hover:underline"
                      >
                        <CountryFlag code={o.corridor.sendCountry} className="rounded-[2px]" />
                        <span aria-hidden="true" className="text-text-faint">
                          →
                        </span>
                        <CountryFlag code={o.corridor.receiveCountry} className="rounded-[2px]" />
                        <span>{o.corridor.receiveCountryName}</span>
                        <span className="text-xs font-medium text-text-dim">
                          from {money(o.corridor.sendCurrency, o.sendAmount, 0)}
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-text">
                      {money(o.corridor.receiveCurrency, o.a.amountReceived)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-text">
                      {money(o.corridor.receiveCurrency, o.b.amountReceived)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-brand sm:px-6">
                      {o.verdict.kind === "winner" ? (
                        <>
                          {o.verdict.winner}
                          <span className="block text-xs font-medium text-text-dim">
                            +{money(o.corridor.receiveCurrency, o.verdict.diff)}
                          </span>
                        </>
                      ) : (
                        <span className="font-medium text-text-dim">Too close</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-4 space-y-3 sm:hidden">
            {others.map((o) => (
              <li
                key={`${o.corridor.sendCountry}-${o.corridor.receiveCountry}`}
                className="rounded-2xl border border-card-border bg-white p-4"
              >
                <Link
                  href={`/compare/${o.corridor.sendCountry}/${o.corridor.receiveCountry}/${pairSlug(a, b)}${query}`}
                  className="inline-flex flex-wrap items-center gap-x-1.5 font-semibold text-brand hover:underline"
                >
                  <CountryFlag code={o.corridor.sendCountry} className="rounded-[2px]" />
                  <span aria-hidden="true" className="text-text-faint">
                    →
                  </span>
                  <CountryFlag code={o.corridor.receiveCountry} className="rounded-[2px]" />
                  <span>{o.corridor.receiveCountryName}</span>
                  <span className="text-xs font-medium text-text-dim">
                    from {money(o.corridor.sendCurrency, o.sendAmount, 0)}
                  </span>
                </Link>
                <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs font-semibold text-text-dim">{a}</dt>
                    <dd className="font-semibold text-text">{money(o.corridor.receiveCurrency, o.a.amountReceived)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-text-dim">{b}</dt>
                    <dd className="font-semibold text-text">{money(o.corridor.receiveCurrency, o.b.amountReceived)}</dd>
                  </div>
                </dl>
                <p className="mt-2 text-sm font-semibold text-brand">
                  {o.verdict.kind === "winner" ? (
                    <>
                      {o.verdict.winner} sends{" "}
                      <span className="text-cost">{money(o.corridor.receiveCurrency, o.verdict.diff)}</span> more
                    </>
                  ) : (
                    <span className="font-medium text-text-dim">Too close to call</span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-8 text-xs text-text-dim">
        Send buttons open the provider&rsquo;s own site in a new tab. Corridor doesn&rsquo;t process transfers, and
        the rate and fees you&rsquo;re offered there may differ from what&rsquo;s shown here.{" "}
        <Link href="/methodology" className="font-semibold text-link underline underline-offset-4">
          How the numbers work
        </Link>
      </p>
    </main>
  );
}

function fromLabel(c: Corridor) {
  return sendName(c);
}

function Maybe({ value }: { value: string | null }) {
  return value ? (
    <span className="font-semibold text-text">{value}</span>
  ) : (
    <span className="font-medium text-text-faint">See provider</span>
  );
}

// One table row: a label cell, then one cell per provider.
function Row({ label, children, strong = false }: { label: string; children: React.ReactNode[]; strong?: boolean }) {
  return (
    <tr>
      <th scope="row" className="px-2 py-4 text-left align-middle text-[0.62rem] font-semibold uppercase tracking-wider text-text-dim sm:px-6 sm:text-xs">
        {label}
      </th>
      {children.map((c, i) => (
        <td key={i} className={`px-2 align-middle sm:px-6 ${strong ? "py-5" : "py-4"}`}>
          {c}
        </td>
      ))}
    </tr>
  );
}

// useSearchParams needs a Suspense boundary around anything statically
// rendered; the fallback is the same page without a URL amount (see
// CorridorComparison for why).
function WithUrlAmount(props: Props) {
  const params = useSearchParams();
  return <Compared {...props} urlAmount={params.get(AMOUNT_PARAM)} />;
}

export default function HeadToHead(props: Props) {
  return (
    <Suspense fallback={<Compared {...props} urlAmount={null} />}>
      <WithUrlAmount {...props} />
    </Suspense>
  );
}
