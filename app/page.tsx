"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import providerData from "@/data/provider-data.json";
import { corridorId, type Corridor, type RankedProvidersResult, type Tier } from "@/lib/corridors";
import {
  trackCorridorViewed,
  trackSignupStarted,
  trackCorridorSorted,
  getDeviceId,
  type SortField,
} from "@/lib/analytics";

const corridors = providerData.corridors as Corridor[];

function corridorLabel(c: Corridor): string {
  return `${c.sendCountryName} (${c.sendCurrency}) → ${c.receiveCountryName} (${c.receiveCurrency})`;
}

function money(currency: string, amount: number, fractionDigits = 2): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString("en-US", {
      maximumFractionDigits: fractionDigits,
    })} ${currency}`;
  }
}

function percent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

function tierAmount(c: Corridor, tier: Tier): number {
  return tier === "Everyday" ? c.everydayAmount : c.largeAmount;
}

export default function Home() {
  // A single "SEND-RECEIVE" string (see corridorId() in lib/corridors) that
  // identifies the selected corridor for this dropdown-of-known-corridors
  // UI. Not the data model itself -- the data model is keyed by the actual
  // (sendCountry, receiveCountry) pair; this is just a convenient value for
  // a single <select>, same as it's used in the URL/analytics/Buttondown.
  const [corridorKey, setCorridorKey] = useState<string>(
    corridors[0] ? corridorId(corridors[0]) : ""
  );
  const [tier, setTier] = useState<Tier>("Everyday");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RankedProvidersResult | null>(null);
  const [sortBy, setSortBy] = useState<SortField>("cost_asc");

  const corridor = useMemo(
    () => corridors.find((c) => corridorId(c) === corridorKey),
    [corridorKey]
  );

  // result.providers arrives cost-ranked from the server (cheapest
  // first) -- this re-sorts a copy for display without touching each
  // provider's original `rank`, so "Rank" always reflects true cost
  // rank even when the table is displayed in a different order.
  const sortedProviders = useMemo(() => {
    if (!result) return [];
    const arr = [...result.providers];
    switch (sortBy) {
      case "cost_desc":
        return arr.sort((a, b) => b.costPercent - a.costPercent);
      case "provider_az":
        return arr.sort((a, b) => a.provider.localeCompare(b.provider));
      case "cost_asc":
      default:
        return arr.sort((a, b) => a.costPercent - b.costPercent);
    }
  }, [result, sortBy]);

  function handleSortChange(next: SortField) {
    setSortBy(next);
    if (corridorKey) {
      trackCorridorSorted({ corridorId: corridorKey, sortField: next });
    }
  }

  const [subscribeEmail, setSubscribeEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  // Guards "Rate Alert Signup Started" so it fires once per corridor
  // view, on the first genuine focus of the email field, rather than
  // once per focus/blur cycle.
  const [signupStartTracked, setSignupStartTracked] = useState(false);
  const [subscribeStatus, setSubscribeStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [subscribeError, setSubscribeError] = useState<string | null>(null);

  async function handleSubscribe(e: React.FormEvent) {
    e.preventDefault();
    if (!corridor) return;
    setSubscribeStatus("submitting");
    setSubscribeError(null);
    // Rate Alert Signup Completed/Failed are no longer tracked from here --
    // they fire server-side (app/api/subscribe/route.ts) only after a real
    // Buttondown outcome, so a bot or a client-only failure can't record a
    // fake conversion. We still hand the server this browser's Amplitude
    // device_id so that server-fired event attaches to the same funnel
    // timeline as Corridor Viewed / Signup Started above, instead of
    // starting a disconnected one. See docs/amplitude-tracking-plan.md.
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    if (!corridor) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(
        `/api/compare?sendCountry=${encodeURIComponent(
          corridor.sendCountry
        )}&receiveCountry=${encodeURIComponent(
          corridor.receiveCountry
        )}&tier=${encodeURIComponent(tier)}`
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? `Request failed (${res.status})`);
      }
      setResult(json as RankedProvidersResult);
      setSortBy("cost_asc");
      trackCorridorViewed({
        corridorId: corridorId(corridor),
        sendCountry: corridor.sendCountryName,
        receiveCountry: corridor.receiveCountryName,
        sendCurrency: corridor.sendCurrency,
        receiveCurrency: corridor.receiveCurrency,
        tier,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">
        Remittance provider comparison
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Ranks providers by how much of the live mid-market value survives fees
        and FX margin. Cheapest first.
      </p>
      <p className="mt-2 text-sm">
        <Link
          href="/methodology"
          className="text-blue-600 hover:underline dark:text-blue-400"
        >
          How we calculate this
        </Link>
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-8 space-y-5 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800"
      >
        <div className="space-y-1.5">
          <label
            htmlFor="corridor"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Corridor
          </label>
          <select
            id="corridor"
            value={corridorKey}
            onChange={(e) => {
              // Reset the subscribe form's status when the viewed corridor
              // changes, so a stale "subscribed!" message doesn't linger.
              setCorridorKey(e.target.value);
              setSubscribeStatus("idle");
              setSubscribeError(null);
              setSignupStartTracked(false);
              setSortBy("cost_asc");
            }}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950"
          >
            {corridors.map((c) => (
              <option key={corridorId(c)} value={corridorId(c)}>
                {corridorLabel(c)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Amount tier
          </span>
          <div className="flex gap-2">
            {(["Everyday", "Large"] as Tier[]).map((t) => {
              const active = t === tier;
              const amountLabel = corridor
                ? money(corridor.sendCurrency, tierAmount(corridor, t), 0)
                : "";
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTier(t)}
                  aria-pressed={active}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                    active
                      ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                      : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  }`}
                >
                  <span className="font-medium">{t}</span>
                  {amountLabel && (
                    <span
                      className={active ? "opacity-80" : "text-zinc-500"}
                    >
                      {" · "}
                      {amountLabel}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Comparing…" : "Compare providers"}
        </button>
      </form>

      {error && (
        <div
          role="alert"
          className="mt-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </div>
      )}

      {loading && (
        <p className="mt-6 text-sm text-zinc-500">Fetching live rate and ranking providers…</p>
      )}

      {result && corridor && !loading && (
        <section className="mt-8">
          {result.rateStale && (
            <div
              role="status"
              className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
            >
              We couldn&rsquo;t reach the live rate feed just now, so this is
              the last rate we successfully fetched, not a live one.
            </div>
          )}
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">
              {corridorLabel(corridor)}
            </h2>
            <p className="text-xs text-zinc-500">
              {result.rateStale ? "Last known rate" : "Live rate"} 1{" "}
              {corridor.sendCurrency} ={" "}
              {result.liveRate.toLocaleString("en-US", {
                maximumFractionDigits: 4,
              })}{" "}
              {corridor.receiveCurrency} &middot; as of{" "}
              {new Date(result.asOf).toLocaleDateString("en-US")}
            </p>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <label
              htmlFor="sort-by"
              className="text-sm text-zinc-600 dark:text-zinc-400"
            >
              Sort by
            </label>
            <select
              id="sort-by"
              value={sortBy}
              onChange={(e) => handleSortChange(e.target.value as SortField)}
              className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm shadow-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="cost_asc">Cost % (low to high)</option>
              <option value="cost_desc">Cost % (high to low)</option>
              <option value="provider_az">Provider (A–Z)</option>
            </select>
          </div>

          <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Rank</th>
                  <th className="px-4 py-2.5 font-medium">Provider</th>
                  <th className="px-4 py-2.5 font-medium text-right">
                    Amount received ({corridor.receiveCurrency})
                  </th>
                  <th className="px-4 py-2.5 font-medium text-right">Cost %</th>
                  <th className="px-4 py-2.5 font-medium text-right">As of</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {sortedProviders.map((p) => (
                  <tr
                    key={p.provider}
                    className={
                      p.rank === 1 ? "bg-green-50/60 dark:bg-green-950/30" : ""
                    }
                  >
                    <td className="px-4 py-2.5 tabular-nums">{p.rank}</td>
                    <td className="px-4 py-2.5 font-medium">{p.provider}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {money(corridor.receiveCurrency, p.amountReceived)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {percent(p.costPercent)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500">
                      {new Date(p.dateChecked).toLocaleDateString("en-US")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="text-sm font-semibold">
              Get rate alerts for {corridorLabel(corridor)}
            </h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              We&rsquo;ll email you when the cheapest provider or the live rate
              for this corridor moves.
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
                    trackSignupStarted({ corridorId: corridorKey });
                    setSignupStartTracked(true);
                  }
                }}
                disabled={subscribeStatus === "submitting"}
                className="w-full flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950"
              />
              <button
                type="submit"
                disabled={subscribeStatus === "submitting"}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                {subscribeStatus === "submitting" ? "Subscribing…" : "Notify me"}
              </button>
            </form>
            {subscribeStatus === "success" && (
              <p className="mt-2 text-sm text-green-700 dark:text-green-400">
                You&rsquo;re subscribed — check your inbox to confirm.
              </p>
            )}
            {subscribeStatus === "error" && subscribeError && (
              <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
                {subscribeError}
              </p>
            )}
          </div>
        </section>
      )}

      <footer className="mt-12 border-t border-zinc-200 pt-6 text-sm text-zinc-500 dark:border-zinc-800">
        <Link
          href="/methodology"
          className="text-blue-600 hover:underline dark:text-blue-400"
        >
          How we calculate this
        </Link>
      </footer>
    </main>
  );
}
