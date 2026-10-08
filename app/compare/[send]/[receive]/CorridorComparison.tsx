"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AMOUNT_PARAM, amountQuery } from "@/lib/amount";
import { corridorId } from "@/lib/corridor-id";
import type { Corridor, RankedProvidersResult } from "@/lib/corridors";
import { trackCorridorViewed } from "@/lib/analytics";
import { trackAiInsightShown, trackAnomalyExplanationShown } from "@/lib/plausible";
import { money, rate } from "@/lib/format";
import { CountryFlag } from "@/lib/flags";
import { pairSlug } from "@/lib/provider-slug";
import ProviderRow from "./ProviderRow";
import RateAlertForm from "./RateAlertForm";
import RateTrendChart from "./RateTrendChart";
import { useCorridorResult } from "./useCorridorResult";

// Omits the parenthetical when the name and currency are already the same
// string -- true for Eurozone corridors, where sendCountryName is "EUR".
function sendSideName(name: string): string {
  return name === "EUR" ? "the Eurozone" : name;
}

// timeZone: "UTC" is load-bearing, not cosmetic: asOf is a UTC-effective
// date, and without a pinned zone the server render and the visitor's browser
// can format it to different days (a real React hydration failure on this
// site before).
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// Wording for the amber banner when a row reads below the live mid-market
// rate on a custom amount. Estimated rows and live quotes need different
// explanations: an estimate that lands below the benchmark is an artifact of
// estimating, while a live quote can simply be ahead of a reference rate that
// is only published once a day.
function customAnomalyMessage(
  extrapolated: boolean,
  anomalies: NonNullable<RankedProvidersResult["costAnomaly"]>
): string {
  const est = anomalies.filter((a) => a.basis === "estimated").map((a) => a.provider);
  const live = anomalies.filter((a) => a.basis === "live").map((a) => a.provider);
  const parts: string[] = [];
  if (est.length > 0) {
    parts.push(
      `${est.join(" and ")} ${est.length === 1 ? "is" : "are"} an estimate that reads below the live mid-market rate. ` +
        `That is most likely an artifact of estimating${extrapolated ? " beyond the two amounts we verified" : " between the two amounts we verified"}, ` +
        `not a better deal, so don't rely on ${est.length === 1 ? "that row" : "those rows"}.`
    );
  }
  if (live.length > 0) {
    parts.push(
      `${live.join(" and ")} ${live.length === 1 ? "is a live quote" : "are live quotes"} that read${live.length === 1 ? "s" : ""} below the reference rate, ` +
        `which can lag the market by up to a day.`
    );
  }
  return parts.join(" ");
}

function Notice({ children, tone = "warn" }: { children: React.ReactNode; tone?: "warn" | "info" }) {
  return (
    <div
      role="status"
      className={`mt-3 rounded-2xl px-4 py-3 text-sm ${
        tone === "warn" ? "border border-amber-300 bg-amber-50 text-amber-900" : "bg-soft text-text-dim"
      }`}
    >
      {children}
    </div>
  );
}

function RowSkeleton() {
  return (
    <li aria-hidden="true" className="animate-pulse rounded-2xl border border-card-border bg-white p-5">
      <div className="h-6 w-32 rounded bg-card-border/70" />
      <div className="mt-4 h-9 w-48 rounded bg-card-border/70" />
      <div className="mt-4 h-4 w-64 rounded bg-card-border/50" />
    </li>
  );
}

type Props = {
  corridor: Corridor;
  initialResult: RankedProvidersResult;
  initialInsight: string | null;
  initialAnomalyExplanation: string | null;
  initialCostAnomalyExplanation: string | null;
};

function Comparison({
  corridor,
  initialResult,
  initialInsight,
  initialAnomalyExplanation,
  initialCostAnomalyExplanation,
  urlAmount,
}: Props & { urlAmount: string | null }) {
  const id = corridorId(corridor);
  const { amount, isDefault, result, loading, error } = useCorridorResult(corridor, initialResult, urlAmount);
  const { sendCurrency, receiveCurrency } = corridor;

  // The AI narration is generated for the default amount only (it is built
  // server-side from the default ranking), so it is shown only then.
  const insight = isDefault && !error ? initialInsight : null;
  const anomalyExplanation = isDefault ? initialAnomalyExplanation : null;
  const costAnomalyExplanation = isDefault ? initialCostAnomalyExplanation : null;

  useEffect(() => {
    if (insight) trackAiInsightShown({ corridorId: id, tier: initialResult.tier });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insight]);

  useEffect(() => {
    if (anomalyExplanation || costAnomalyExplanation) {
      trackAnomalyExplanationShown({ corridorId: id, tier: initialResult.tier });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anomalyExplanation, costAnomalyExplanation]);

  // One "Corridor Viewed" per amount actually shown (not while it is loading).
  useEffect(() => {
    if (loading) return;
    trackCorridorViewed({
      corridorId: id,
      sendCountry: corridor.sendCountryName,
      receiveCountry: corridor.receiveCountryName,
      sendCurrency,
      receiveCurrency,
      tier: isDefault ? initialResult.tier : "Custom",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, loading, isDefault]);

  // Up to two providers picked for a head-to-head.
  const [picked, setPicked] = useState<string[]>([]);
  function togglePick(provider: string) {
    setPicked((cur) =>
      cur.includes(provider) ? cur.filter((p) => p !== provider) : cur.length < 2 ? [...cur, provider] : cur
    );
  }

  const providers = result.providers;
  const ranked = providers.filter((p) => !p.benchmarkReference);
  const bestProvider = providers.find((p) => p.rank === 1)?.provider;
  const query = amountQuery(isDefault && !urlAmount ? null : amount);
  const pairHref =
    picked.length === 2 && pairSlug(picked[0], picked[1])
      ? `/compare/${corridor.sendCountry}/${corridor.receiveCountry}/${pairSlug(picked[0], picked[1])}${query}`
      : null;

  const anyEstimated = providers.some((p) => p.basis === "estimated");

  return (
    <main className="mx-auto w-full max-w-4xl px-6 pb-24 pt-8 sm:pt-10">
      <Link
        href={`/${query}`}
        className="inline-flex items-center gap-1 rounded-full py-1 pr-3 text-sm font-semibold text-link hover:underline"
      >
        <span aria-hidden="true">←</span> All corridors
      </Link>

      <h1 className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 font-heading text-3xl font-extrabold leading-tight tracking-[-0.04em] text-brand sm:text-5xl">
        <CountryFlag code={corridor.sendCountry} className="rounded-[3px]" />
        <span>{sendSideName(corridor.sendCountryName)}</span>
        <span aria-hidden="true" className="text-text-faint">
          →
        </span>
        <CountryFlag code={corridor.receiveCountry} className="rounded-[3px]" />
        <span>{corridor.receiveCountryName}</span>
      </h1>

      <p className="mt-3 text-base text-text-dim">
        {isDefault && !urlAmount ? "A typical" : "Sending"}{" "}
        <strong className="font-bold text-text">{money(sendCurrency, amount, 0)}</strong>
        {" · "}
        <Link href={`/${query}`} className="font-semibold text-link underline underline-offset-4">
          {isDefault && !urlAmount ? "Set your own amount" : "Change amount"}
        </Link>
      </p>

      <section aria-labelledby="providers-heading" className="mt-8" aria-busy={loading}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h2 id="providers-heading" className="font-heading text-xl font-extrabold tracking-[-0.03em] text-brand sm:text-2xl">
            {providers.length} {providers.length === 1 ? "provider" : "providers"}
          </h2>
          {result.rateStale ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-900">
              Rate delayed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-lime px-2.5 py-1 text-xs font-extrabold text-brand">
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-40 motion-reduce:hidden" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
              </span>
              Live
            </span>
          )}
          <span className="text-sm text-text-dim">
            Mid-market 1 {sendCurrency} = {rate(result.liveRate)} {receiveCurrency}, {shortDate(result.asOf)}
          </span>
        </div>

        {error && (
          <Notice>
            We couldn&rsquo;t price {money(sendCurrency, error.requested, 0)} just now, so this shows a typical{" "}
            {money(sendCurrency, amount, 0)} instead.
          </Notice>
        )}
        {result.rateStale && (
          <Notice>
            {anomalyExplanation ??
              "We couldn't reach the live rate feed just now, so this uses the last rate we fetched, not a live one."}
          </Notice>
        )}
        {!result.rateStale && result.costAnomaly && result.costAnomaly.length > 0 && (
          <Notice>
            {result.custom
              ? customAnomalyMessage(result.custom.extrapolated, result.costAnomaly)
              : (costAnomalyExplanation ??
                "One or more rows read below the live mid-market rate, which usually means that provider's data is stale rather than a better deal. We're not explaining the top pick until it's re-verified.")}
          </Notice>
        )}
        {result.lagAllowed && result.lagAllowed.length > 0 && (
          <Notice tone="info">
            {result.lagAllowed.map((l) => l.provider).join(" and ")} reads slightly below mid-market. That is
            within the allowance for a reference rate that is published once a day.
          </Notice>
        )}
        {result.custom && (anyEstimated || result.custom.liveStatus !== "live") && (
          <Notice tone="info">
            {result.custom.liveStatus === "unavailable"
              ? "Live quotes aren't available right now, so every row is an estimate. "
              : result.custom.liveStatus === "partial"
                ? "Some live quotes failed, so those rows fell back to estimates. "
                : ""}
            {anyEstimated && "Rows tagged Estimated weren't checked at this exact amount. "}
            <Link href="/methodology#estimates" className="font-semibold text-link underline underline-offset-4">
              How estimates work
            </Link>
          </Notice>
        )}

        {insight && bestProvider && (
          <div className="mt-4 rounded-2xl bg-mint px-4 py-3.5 text-sm text-brand sm:px-5">
            <span className="font-extrabold">Why {bestProvider} wins: </span>
            <span className="text-text">{insight}</span>
          </div>
        )}

        {loading ? (
          <ul className="mt-6 space-y-5" role="status" aria-live="polite">
            <li className="sr-only">Getting quotes for {money(sendCurrency, amount, 0)}…</li>
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
          </ul>
        ) : providers.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-card-border bg-white px-4 py-3 text-sm text-text-dim">
            No provider data available for this corridor yet.
          </p>
        ) : (
          <ul className="mt-7 space-y-5">
            {providers.map((p) => (
              <ProviderRow
                key={p.provider}
                provider={p}
                corridor={corridor}
                best={p.rank === 1}
                midRate={result.liveRate}
                showCompare={ranked.length >= 2}
                selected={picked.includes(p.provider)}
                selectDisabled={picked.length >= 2}
                onToggleCompare={togglePick}
              />
            ))}
          </ul>
        )}

        <p className="mt-4 text-xs text-text-dim">
          Send buttons open the provider&rsquo;s own site in a new tab. Corridor doesn&rsquo;t process transfers, and
          the rate and fees you&rsquo;re offered there may differ from what&rsquo;s shown here.{" "}
          <Link href="/methodology" className="font-semibold text-link underline underline-offset-4">
            How the numbers work
          </Link>
        </p>
      </section>

      <RateTrendChart
        key={`${sendCurrency}-${receiveCurrency}`}
        sendCurrency={sendCurrency}
        receiveCurrency={receiveCurrency}
      />

      <RateAlertForm corridor={corridor} />

      {picked.length > 0 && (
        <div
          role="region"
          aria-label="Compare two providers"
          className="fixed inset-x-4 bottom-4 z-20 mx-auto flex max-w-md items-center justify-between gap-3 rounded-full bg-brand px-5 py-3 text-white shadow-[0_14px_40px_-10px_rgba(22,51,0,0.7)]"
        >
          <span className="min-w-0 truncate text-sm font-semibold">
            {picked.length === 1 ? `${picked[0]} selected. Pick one more.` : `${picked[0]} vs ${picked[1]}`}
          </span>
          {pairHref ? (
            <Link href={pairHref} className="btn-primary shrink-0 px-4 py-2 text-sm">
              Compare
            </Link>
          ) : (
            <button type="button" onClick={() => setPicked([])} className="shrink-0 text-sm font-semibold underline">
              Clear
            </button>
          )}
        </div>
      )}
    </main>
  );
}

// useSearchParams needs a Suspense boundary around anything statically
// rendered. The fallback is the SAME page rendered without a URL amount, so
// the static HTML contains the full default comparison (not a blank shell);
// once hydrated, the real instance picks up "?amount=" if there is one.
function WithUrlAmount(props: Props) {
  const params = useSearchParams();
  return <Comparison {...props} urlAmount={params.get(AMOUNT_PARAM)} />;
}

export default function CorridorComparison(props: Props) {
  return (
    <Suspense fallback={<Comparison {...props} urlAmount={null} />}>
      <WithUrlAmount {...props} />
    </Suspense>
  );
}
