"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  corridorId,
  freshnessLevelFor,
  FRESHNESS_DOT_CLASS,
  type Corridor,
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

// Compact dot + short date, used on every provider row in the table --
// replaces the old flat "As of 9/8/2026" text column with the same
// fresh/aging/stale color language the directory cards already use (see
// lib/corridors.ts's freshnessLevelFor / FRESHNESS_DOT_CLASS), just at
// table-row density instead of the directory's wordier label.
function RowFreshnessBadge({ dateChecked }: { dateChecked: string }) {
  const level = freshnessLevelFor(dateChecked);
  return (
    <span
      className="inline-flex items-center gap-1.5 tabular-nums"
      title={new Date(dateChecked).toLocaleDateString("en-US", { timeZone: "UTC" })}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${FRESHNESS_DOT_CLASS[level]}`}
      />
      {shortDate(dateChecked)}
    </span>
  );
}

export default function CorridorComparison({
  corridor,
  initialResult,
  initialInsight,
  initialAnomalyExplanation,
}: {
  corridor: Corridor;
  initialResult: RankedProvidersResult;
  initialInsight: string | null;
  initialAnomalyExplanation: string | null;
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

  useEffect(() => {
    if (insight) trackAiInsightShown({ corridorId: id, tier });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insight]);

  useEffect(() => {
    if (anomalyExplanation) {
      trackAnomalyExplanationShown({ corridorId: id, tier });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anomalyExplanation]);

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
      fetch(`/api/insight?${query}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((json2: { insight?: string | null; anomalyExplanation?: string | null } | null) => {
          setInsight(json2?.insight ?? null);
          setAnomalyExplanation(json2?.anomalyExplanation ?? null);
        })
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
      <h1 className="text-2xl font-semibold tracking-tight">
        {corridorLabel(corridor)}
      </h1>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
        Ranks providers by how much of the live mid-market value survives fees
        and FX margin. Cheapest first.
      </p>
      <p className="mt-2 text-sm">
        <Link href="/methodology" className="text-accent hover:underline">
          How we calculate this
        </Link>
      </p>

      <div className="mt-8 space-y-1.5">
        <span className="block text-sm font-medium text-stone-700 dark:text-stone-300">
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
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-300 dark:hover:bg-stone-900"
                }`}
              >
                <span className="font-medium">{t}</span>
                <span className={active ? "opacity-80" : "text-stone-500"}>
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
        <p className="mt-6 text-sm text-stone-500">
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
          <p className="text-xs text-stone-500">
            {result.rateStale ? "Last known rate" : "Live rate"} 1{" "}
            {corridor.sendCurrency} ={" "}
            {rate(result.liveRate)}{" "}
            {corridor.receiveCurrency} &middot; as of{" "}
            {new Date(result.asOf).toLocaleDateString("en-US", { timeZone: "UTC" })}
          </p>

          {heroProvider ? (
            <div className="mt-4 rounded-xl border border-accent/30 bg-accent/5 p-5 dark:bg-accent/10">
              <span className="text-xs font-semibold uppercase tracking-wide text-accent">
                Cheapest right now
              </span>
              <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
                <div>
                  <div className="text-xl font-semibold tracking-tight">
                    {heroProvider.provider}
                  </div>
                  <div className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                    You receive{" "}
                    <span className="font-medium text-stone-900 dark:text-stone-100">
                      {money(corridor.receiveCurrency, heroProvider.amountReceived)}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-semibold tabular-nums text-accent">
                    {percent(heroProvider.costPercent)}
                  </div>
                  <div className="text-xs text-stone-500">cost vs. mid-market</div>
                </div>
              </div>
              <div className="mt-3 text-xs text-stone-500 dark:text-stone-400">
                <RowFreshnessBadge dateChecked={heroProvider.dateChecked} />
              </div>
              {insight && (
                <p className="mt-3 border-t border-accent/20 pt-3 text-sm text-stone-700 dark:text-stone-300">
                  <span className="font-medium text-accent">
                    Why {heroProvider.provider} wins:{" "}
                  </span>
                  {insight}
                </p>
              )}
            </div>
          ) : (
            <p className="mt-4 rounded-md border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-500 dark:border-stone-800 dark:bg-stone-900">
              No provider data available for this tier yet.
            </p>
          )}

          {restSorted.length > 0 && (
            <>
              <div className="mt-6 flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-stone-400">
                  Other providers ({restSorted.length})
                </span>
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="sort-by"
                    className="text-sm text-stone-600 dark:text-stone-400"
                  >
                    Sort by
                  </label>
                  <select
                    id="sort-by"
                    value={sortBy}
                    onChange={(e) =>
                      handleSortChange(e.target.value as SortField)
                    }
                    className="rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm shadow-sm outline-none focus:border-accent dark:border-stone-700 dark:bg-stone-950"
                  >
                    <option value="cost_asc">Cost % (low to high)</option>
                    <option value="cost_desc">Cost % (high to low)</option>
                    <option value="provider_az">Provider (A–Z)</option>
                  </select>
                </div>
              </div>

              {/* Deliberately quieter than the hero card above: no header
                  shading, muted text, thin dividers -- this is the "rest of
                  the field" list, not the headline number. */}
              <div className="mt-2 overflow-x-auto rounded-lg border border-stone-200 dark:border-stone-800">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-stone-400">
                    <tr>
                      <th className="px-4 py-2 font-medium">Rank</th>
                      <th className="px-4 py-2 font-medium">Provider</th>
                      <th className="px-4 py-2 font-medium text-right">
                        Amount received ({corridor.receiveCurrency})
                      </th>
                      <th className="px-4 py-2 font-medium text-right">
                        Cost %
                      </th>
                      <th className="px-4 py-2 font-medium text-right">
                        Updated
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 dark:divide-stone-800 text-stone-600 dark:text-stone-400">
                    {restSorted.map((p) => (
                      <tr key={p.provider}>
                        <td className="px-4 py-2 tabular-nums">{p.rank}</td>
                        <td className="px-4 py-2 font-medium text-stone-900 dark:text-stone-100">
                          {p.provider}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {money(corridor.receiveCurrency, p.amountReceived)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
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

          <div className="mt-6 rounded-lg border border-stone-200 bg-stone-50 p-5 dark:border-stone-800 dark:bg-stone-900">
            <h3 className="text-sm font-semibold">
              Get rate alerts for {corridorLabel(corridor)}
            </h3>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
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
                className="w-full flex-1 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-accent disabled:opacity-60 dark:border-stone-700 dark:bg-stone-950"
              />
              <button
                type="submit"
                disabled={subscribeStatus === "submitting"}
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
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

      <footer className="mt-12 border-t border-stone-200 pt-6 text-sm text-stone-500 dark:border-stone-800">
        <Link href="/methodology" className="text-accent hover:underline">
          How we calculate this
        </Link>
      </footer>
    </main>
  );
}
