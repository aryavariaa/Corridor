"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  corridorId,
  freshnessLevelFor,
  FRESHNESS_DOT_CLASS,
  type Corridor,
  type Freshness,
  type RankedProvider,
  type RankedProvidersResult,
  type Tier,
} from "@/lib/corridors";
import {
  trackCorridorViewed,
  trackSignupStarted,
  trackCorridorSorted,
  getDeviceId,
  type SortField,
} from "@/lib/analytics";
import { trackAiInsightShown, trackAnomalyExplanationShown } from "@/lib/plausible";
import { money, percent, rate } from "@/lib/format";

// Omits the parenthetical when the name and currency are already the same
// string -- true for Eurozone corridors, where sendCountryName is "EUR"
// (see lib/corridors.ts). Without this, those corridors would read
// "EUR (EUR) -> ..." instead of just "EUR -> ...".
function sendSideLabel(name: string, currency: string): string {
  return name === currency ? name : `${name} (${currency})`;
}

function corridorLabel(c: Corridor): string {
  return `${sendSideLabel(c.sendCountryName, c.sendCurrency)} → ${c.receiveCountryName} (${c.receiveCurrency})`;
}

// timeZone: "UTC" is load-bearing, not cosmetic. dateChecked/asOf are
// date-only or UTC-effective values (see lib/corridors.ts/lib/fx.ts), and
// this app statically prerenders these pages (generateStaticParams +
// ISR). Without a pinned timeZone, toLocaleDateString renders in
// whatever timezone the *runtime* happens to be in -- Vercel's build/SSR
// environment (UTC) vs. a visitor's browser (their local zone) -- so the
// same ISO string can format to two different calendar dates one day
// apart, producing a text mismatch between the server-rendered HTML and
// the client's hydration render. That's a real, reproduced hydration
// failure (React error #418), not a hypothetical: confirmed by building
// under TZ=UTC and hydrating in a Pacific-time browser, where e.g.
// "2026-08-31" rendered "Aug 31" server-side and "Aug 30" client-side.
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function tierAmount(c: Corridor, tier: Tier): number {
  return tier === "Everyday" ? c.everydayAmount : c.largeAmount;
}

// The normal --fresh/--aging/--stale dot colors (FRESHNESS_DOT_CLASS) are
// tuned against --card/--bg -- inside the solid --accent hero panel they
// measure as low as 1.0:1 (aging, effectively invisible), since neither
// this brief's token list nor brief-7's covered "freshness dot sitting on
// a solid brand-color fill." tone="onAccent" swaps in increasing opacity
// steps of --accent-contrast instead, the same color already used for
// emphasized text on that panel, confirmed to contrast well against both
// themes' --accent.
const ON_ACCENT_DOT_CLASS: Record<Freshness, string> = {
  fresh: "bg-accent-contrast/40",
  aging: "bg-accent-contrast/70",
  stale: "bg-accent-contrast",
};

function RowFreshnessBadge({
  dateChecked,
  tone = "default",
}: {
  dateChecked: string;
  tone?: "default" | "onAccent";
}) {
  const level = freshnessLevelFor(dateChecked);
  const dotClass = tone === "onAccent" ? ON_ACCENT_DOT_CLASS[level] : FRESHNESS_DOT_CLASS[level];
  return (
    <span
      className="inline-flex items-center gap-1.5 tabular-nums"
      title={new Date(dateChecked).toLocaleDateString("en-US", { timeZone: "UTC" })}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
      {shortDate(dateChecked)}
    </span>
  );
}

export default function CorridorComparison({
  corridor,
  initialResult,
  initialInsight,
  initialAnomalyExplanation,
  initialCostAnomalyExplanation,
}: {
  corridor: Corridor;
  initialResult: RankedProvidersResult;
  initialInsight: string | null;
  initialAnomalyExplanation: string | null;
  initialCostAnomalyExplanation: string | null;
}) {
  const id = corridorId(corridor);

  const [tier, setTier] = useState<Tier>(initialResult.tier);
  const [result, setResult] = useState<RankedProvidersResult>(initialResult);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortField>("cost_asc");

  // AI Rate Insights: both narrations are LLM-generated from numbers
  // already computed above (see lib/ai.ts) and both render always-visible
  // rather than behind an expand click, so a change in either fires a
  // page-level "shown" event below, not an "expanded" one. Fetched
  // alongside /api/compare on every tier switch, but never blocks it --
  // a slow or failed insight/anomaly call just leaves these null.
  const [insight, setInsight] = useState<string | null>(initialInsight);
  const [anomalyExplanation, setAnomalyExplanation] = useState<string | null>(
    initialAnomalyExplanation
  );
  // Distinct from anomalyExplanation above: that one covers a rejected
  // FX-rate fetch (result.rateAnomaly); this one covers one or more
  // providers showing an impossible negative cost against a perfectly
  // fresh live rate (result.costAnomaly) -- see lib/ai.ts's
  // getCostAnomalyExplanation. getPickExplainer already refuses to run
  // when this applies, so `insight` is null whenever this is set.
  const [costAnomalyExplanation, setCostAnomalyExplanation] = useState<
    string | null
  >(initialCostAnomalyExplanation);

  useEffect(() => {
    if (insight) trackAiInsightShown({ corridorId: id, tier });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insight]);

  useEffect(() => {
    if (anomalyExplanation || costAnomalyExplanation) {
      trackAnomalyExplanationShown({ corridorId: id, tier });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anomalyExplanation, costAnomalyExplanation]);

  // Fires once for the page's initial (server-rendered) tier on mount --
  // this component fully remounts on every corridor navigation, so an
  // empty dependency array is the right "once per corridor view" trigger.
  // Tier switches fire their own Corridor Viewed from handleTierChange
  // below instead of re-running this effect.
  useEffect(() => {
    trackCorridorViewed({
      corridorId: id,
      sendCountry: corridor.sendCountryName,
      receiveCountry: corridor.receiveCountryName,
      sendCurrency: corridor.sendCurrency,
      receiveCurrency: corridor.receiveCurrency,
      tier: initialResult.tier,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rank 1 (the cheapest provider) is pulled out into its own hero card
  // below, always -- regardless of how the table underneath is sorted --
  // so "cheapest first" stays visually true even when the table itself is
  // sorted A-Z or worst-first. Everything else renders in the table.
  const heroProvider: RankedProvider | undefined = result.providers.find(
    (p) => p.rank === 1
  );

  const restSorted = useMemo(() => {
    const rest = result.providers.filter((p) => p.rank !== 1);
    switch (sortBy) {
      case "cost_desc":
        return [...rest].sort((a, b) => b.costPercent - a.costPercent);
      case "provider_az":
        return [...rest].sort((a, b) => a.provider.localeCompare(b.provider));
      case "cost_asc":
      default:
        return [...rest].sort((a, b) => a.costPercent - b.costPercent);
    }
  }, [result, sortBy]);

  function handleSortChange(next: SortField) {
    setSortBy(next);
    trackCorridorSorted({ corridorId: id, sortField: next });
  }

  async function handleTierChange(next: Tier) {
    if (next === tier || loading) return;
    setLoading(true);
    setError(null);
    try {
      const query =
        `sendCountry=${encodeURIComponent(corridor.sendCountry)}` +
        `&receiveCountry=${encodeURIComponent(corridor.receiveCountry)}` +
        `&tier=${encodeURIComponent(next)}`;

      const res = await fetch(`/api/compare?${query}`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? `Request failed (${res.status})`);
      }
      setResult(json as RankedProvidersResult);
      setTier(next);
      setSortBy("cost_asc");
      trackCorridorViewed({
        corridorId: id,
        sendCountry: corridor.sendCountryName,
        receiveCountry: corridor.receiveCountryName,
        sendCurrency: corridor.sendCurrency,
        receiveCurrency: corridor.receiveCurrency,
        tier: next,
      });

      // Fire-and-forget relative to the ranking update above: the AI
      // narration is a nice-to-have layered on top, never a blocker. A
      // slow LLM call or a missing ANTHROPIC_API_KEY just leaves these
      // null rather than delaying or failing the tier switch itself.
      setInsight(null);
      setAnomalyExplanation(null);
      setCostAnomalyExplanation(null);
      fetch(`/api/insight?${query}`)
        .then((r) => (r.ok ? r.json() : null))
        .then(
          (
            json2: {
              insight?: string | null;
              anomalyExplanation?: string | null;
              costAnomalyExplanation?: string | null;
            } | null
          ) => {
            setInsight(json2?.insight ?? null);
            setAnomalyExplanation(json2?.anomalyExplanation ?? null);
            setCostAnomalyExplanation(json2?.costAnomalyExplanation ?? null);
          }
        )
        .catch(() => {
          // Already null from the reset above -- nothing more to do.
        });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const [subscribeEmail, setSubscribeEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  // Guards "Rate Alert Signup Started" so it fires once per corridor view,
  // on the first genuine focus of the email field, rather than once per
  // focus/blur cycle.
  const [signupStartTracked, setSignupStartTracked] = useState(false);
  const [subscribeStatus, setSubscribeStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [subscribeError, setSubscribeError] = useState<string | null>(null);

  async function handleSubscribe(e: React.FormEvent) {
    e.preventDefault();
    setSubscribeStatus("submitting");
    setSubscribeError(null);
    // Rate Alert Signup Completed/Failed fire server-side only (see
    // app/api/subscribe/route.ts) after a real Buttondown outcome, so a bot
    // or a client-only failure can't record a fake conversion. We still
    // hand the server this browser's Amplitude device_id so that
    // server-fired event attaches to the same funnel timeline as Corridor
    // Viewed / Signup Started above. See docs/amplitude-tracking-plan.md.
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: subscribeEmail,
          sendCountry: corridor.sendCountry,
          receiveCountry: corridor.receiveCountry,
          company: honeypot,
          deviceId: getDeviceId(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? `Request failed (${res.status})`);
      }
      setSubscribeStatus("success");
      setSubscribeEmail("");
    } catch (err) {
      setSubscribeStatus("error");
      setSubscribeError(
        err instanceof Error ? err.message : "Something went wrong"
      );
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight">
        {corridorLabel(corridor)}
      </h1>
      <p className="mt-2 text-sm text-text-dim">
        Ranks providers by how much of the live mid-market value survives fees
        and FX margin. Cheapest first.
      </p>
      <p className="mt-2 text-sm">
        <Link href="/methodology" className="text-link hover:underline">
          How we calculate this
        </Link>
      </p>

      <div className="mt-8 space-y-1.5">
        <span className="block text-xs font-bold uppercase tracking-widest text-text-dim">
          Amount tier
        </span>
        <div className="flex gap-2">
          {(["Everyday", "Large"] as Tier[]).map((t) => {
            const active = t === tier;
            const amountLabel = money(
              corridor.sendCurrency,
              tierAmount(corridor, t),
              0
            );
            return (
              <button
                key={t}
                type="button"
                onClick={() => handleTierChange(t)}
                disabled={loading}
                aria-pressed={active}
                className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  active
                    ? "border-accent bg-accent text-accent-contrast"
                    : "border-card-border bg-card text-text hover:bg-accent-tint/20"
                }`}
              >
                <span className="font-medium">{t}</span>
                <span className={active ? "opacity-80" : "text-text-dim"}>
                  {" · "}
                  {amountLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </div>
      )}

      {loading && (
        <p className="mt-6 text-sm text-text-dim">
          Fetching live rate and ranking providers…
        </p>
      )}

      {!loading && (
        <section className="mt-8">
          {result.rateStale && (
            <div
              role="status"
              className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
            >
              {/* AI-generated only when a real rejected reading is behind
                  the staleness (see lib/ai.ts's getAnomalyExplanation) --
                  otherwise this is a plain upstream fetch failure and the
                  generic message below still applies. */}
              {anomalyExplanation ??
                "We couldn't reach the live rate feed just now, so this is the last rate we successfully fetched, not a live one."}
            </div>
          )}
          {/* Independent of rateStale above: the live FX rate can be
              perfectly fresh while a provider's own manually-sourced row
              has simply gone stale against it (see lib/corridors.ts's
              costAnomaly). Only one of these two banners shows at once --
              a rejected rate fetch is the more fundamental problem, so it
              takes priority when both happen to apply. */}
          {!result.rateStale && result.costAnomaly && result.costAnomaly.length > 0 && (
            <div
              role="status"
              className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
            >
              {costAnomalyExplanation ??
                "One or more providers here currently show a cost below the live mid-market rate, which usually means that provider's own rate data is stale rather than a genuinely better deal. We're holding off on the \"why this pick\" explanation until it's re-verified."}
            </div>
          )}
          <p className="text-xs text-text-dim">
            {result.rateStale ? "Last known rate" : "Live rate"} 1{" "}
            {corridor.sendCurrency} ={" "}
            {rate(result.liveRate)}{" "}
            {corridor.receiveCurrency} &middot; as of{" "}
            {new Date(result.asOf).toLocaleDateString("en-US", { timeZone: "UTC" })}
          </p>

          {heroProvider ? (
            // Solid accent-filled panel, deliberate departure from the
            // brief-7 tinted-border-card treatment: the top pick is now a
            // block of pure --accent, not a wash of it. cost% keeps using
            // --cost (not --accent-contrast) even against this fill --
            // the brief is explicit --cost must stay visually distinct
            // from --accent everywhere, this panel included, and #2dd4a0/
            // #0f7a4f still read clearly against both themes' accent fill.
            <div className="mt-4 rounded-[14px] bg-accent p-6 sm:p-7">
              <span className="text-xs font-bold uppercase tracking-widest text-accent-tint">
                Cheapest right now
              </span>
              <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
                <div>
                  <div className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight text-accent-contrast">
                    {heroProvider.provider}
                  </div>
                  <div className="mt-1 text-sm text-accent-tint">
                    You receive{" "}
                    <span className="font-medium text-accent-contrast">
                      {money(corridor.receiveCurrency, heroProvider.amountReceived)}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-heading text-[38px] font-extrabold leading-none tabular-nums text-cost">
                    {percent(heroProvider.costPercent)}
                  </div>
                  <div className="mt-1 text-xs text-accent-tint">cost vs. mid-market</div>
                </div>
              </div>
              <div className="mt-3 text-xs text-accent-tint">
                <RowFreshnessBadge dateChecked={heroProvider.dateChecked} tone="onAccent" />
              </div>
              {insight && (
                <p
                  className="mt-3 border-t pt-3 text-sm text-accent-tint"
                  style={{ borderColor: "var(--hero-divider)" }}
                >
                  <span className="font-bold text-accent-contrast">
                    Why {heroProvider.provider} wins:{" "}
                  </span>
                  {insight}
                </p>
              )}
            </div>
          ) : (
            <p className="mt-4 rounded-md border border-card-border bg-card px-4 py-3 text-sm text-text-dim">
              No provider data available for this tier yet.
            </p>
          )}

          {restSorted.length > 0 && (
            <>
              <div className="mt-6 flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-widest text-text-dim">
                  Other providers ({restSorted.length})
                </span>
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="sort-by"
                    className="text-sm text-text-dim"
                  >
                    Sort by
                  </label>
                  <select
                    id="sort-by"
                    value={sortBy}
                    onChange={(e) =>
                      handleSortChange(e.target.value as SortField)
                    }
                    className="rounded-md border border-card-border bg-card px-2.5 py-1.5 text-sm outline-none focus:border-link"
                  >
                    <option value="cost_asc">Cost % (low to high)</option>
                    <option value="cost_desc">Cost % (high to low)</option>
                    <option value="provider_az">Provider (A–Z)</option>
                  </select>
                </div>
              </div>

              {/* Dense, grid-lined container per this brief's item 5 --
                  one bordered box, hairline top-border dividers between
                  rows, no shadow and no per-row background/rounding
                  (that per-row "floating card" look was brief-7's
                  approach; this pass deliberately moves away from it). */}
              <div className="mt-2 overflow-x-auto rounded-lg border border-card-border bg-card">
                <table className="w-full text-sm">
                  <thead className="bg-card-border/40 text-left text-xs font-bold uppercase tracking-widest text-text-dim">
                    <tr>
                      <th className="px-4 py-2 font-bold">Rank</th>
                      <th className="px-4 py-2 font-bold">Provider</th>
                      <th className="px-4 py-2 font-bold text-right">
                        Amount received ({corridor.receiveCurrency})
                      </th>
                      <th className="px-4 py-2 font-bold text-right">
                        Cost %
                      </th>
                      <th className="px-4 py-2 font-bold text-right">
                        Updated
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-text-dim">
                    {restSorted.map((p) => (
                      <tr key={p.provider} className="border-t border-card-border">
                        <td className="px-4 py-2 tabular-nums">{p.rank}</td>
                        <td className="px-4 py-2 font-heading font-medium text-text">
                          {p.provider}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {money(corridor.receiveCurrency, p.amountReceived)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums font-medium text-cost">
                          {percent(p.costPercent)}
                        </td>
                        <td className="px-4 py-2 text-right text-xs">
                          <span className="inline-flex justify-end">
                            <RowFreshnessBadge dateChecked={p.dateChecked} />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="mt-6 rounded-lg border border-card-border bg-card p-5">
            <h3 className="text-sm font-semibold">
              Get rate alerts for {corridorLabel(corridor)}
            </h3>
            <p className="mt-1 text-sm text-text-dim">
              We&rsquo;ll email you when the cheapest provider or the live
              rate for this corridor moves.
            </p>
            <form
              onSubmit={handleSubscribe}
              className="mt-3 flex flex-col gap-2 sm:flex-row"
            >
              <label htmlFor="subscribe-email" className="sr-only">
                Email address
              </label>
              {/* Honeypot: hidden from real users, invisible to screen
                  readers. Bots that fill every field trip it server-side. */}
              <input
                type="text"
                name="company"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="hidden"
              />
              <input
                id="subscribe-email"
                type="email"
                required
                placeholder="you@example.com"
                value={subscribeEmail}
                onChange={(e) => setSubscribeEmail(e.target.value)}
                onFocus={() => {
                  // Real users only; the honeypot field is unreachable by
                  // tab/click (tabIndex=-1, aria-hidden) so a genuine focus
                  // event here can't come from the same bots that trip it.
                  if (!signupStartTracked) {
                    trackSignupStarted({ corridorId: id });
                    setSignupStartTracked(true);
                  }
                }}
                disabled={subscribeStatus === "submitting"}
                className="w-full flex-1 rounded-md border border-card-border bg-card px-3 py-2 text-sm outline-none focus:border-link disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={subscribeStatus === "submitting"}
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-contrast hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {subscribeStatus === "submitting"
                  ? "Subscribing…"
                  : "Notify me"}
              </button>
            </form>
            {subscribeStatus === "success" && (
              <p className="mt-2 text-sm text-green-700 dark:text-green-400">
                You&rsquo;re subscribed — check your inbox to confirm.
              </p>
            )}
            {subscribeStatus === "error" && subscribeError && (
              <p
                role="alert"
                className="mt-2 text-sm text-red-700 dark:text-red-400"
              >
                {subscribeError}
              </p>
            )}
          </div>
        </section>
      )}

      <footer className="mt-12 border-t border-card-border pt-6 text-sm text-text-dim">
        <Link href="/methodology" className="text-link hover:underline">
          How we calculate this
        </Link>
      </footer>
    </main>
  );
}
