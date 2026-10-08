"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useId, useMemo, useState } from "react";
import { AMOUNT_PARAM, amountQuery, parseAmount } from "@/lib/amount";
import { money } from "@/lib/format";
import type { Corridor } from "@/lib/corridors";
import { CountryFlag } from "@/lib/flags";
import { inProse, withArticle } from "@/lib/geo";

// Directory sections group by send currency, not geography: every corridor
// already carries a sendCurrency, so there's no separate field to derive. A
// currency with no corridors (e.g. none left after a filter) is simply absent
// from `grouped`, not rendered as an empty section.
// The worked example under the headline, computed server-side in app/page.tsx
// from stored data (see lib/home-example.ts). Absent when it can't be.
export type HomeExampleData = {
  sendCountry: string;
  receiveCountry: string;
  sendCurrency: string;
  receiveCurrency: string;
  sendCountryName: string;
  receiveCountryName: string;
  sendAmount: number;
  best: { provider: string; amountReceived: number };
  others: { provider: string; amountReceived: number }[];
};

// "X, Y or Z": the rows that lost, in the order they ranked.
function orList(items: string[]): string {
  return items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

const SEND_CURRENCY_ORDER = ["USD", "GBP", "AUD", "EUR", "CAD"];

const fieldLabel = "block text-xs font-semibold uppercase tracking-wider text-text-dim";
const fieldControl =
  "mt-1.5 w-full rounded-xl border border-card-border bg-white px-3.5 py-3 text-base text-text";

function CorridorCard({ corridor, query }: { corridor: Corridor; query: string }) {
  return (
    <Link
      href={`/compare/${corridor.sendCountry}/${corridor.receiveCountry}${query}`}
      className="group flex items-center justify-between gap-3 rounded-2xl border border-card-border bg-white px-4 py-3.5 transition hover:border-brand hover:shadow-[0_6px_20px_-8px_rgba(22,51,0,0.35)]"
    >
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <CountryFlag code={corridor.sendCountry} className="shrink-0 rounded-[2px]" />
          <span className="text-text-faint" aria-hidden="true">
            →
          </span>
          <CountryFlag code={corridor.receiveCountry} className="shrink-0 rounded-[2px]" />
        </span>
        <span className="mt-1.5 block truncate font-heading text-[1.05rem] font-bold text-brand">
          {corridor.receiveCountryName}
        </span>
        <span className="block truncate text-xs text-text-dim">
          from {withArticle(corridor.sendCountryName)}{" "}
          · {corridor.sendCurrency} → {corridor.receiveCurrency}
        </span>
      </span>
      <span
        aria-hidden="true"
        className="text-xl text-text-faint transition group-hover:translate-x-0.5 group-hover:text-brand"
      >
        ›
      </span>
    </Link>
  );
}

// `urlAmount` is whatever "?amount=" the page was opened with (the corridor
// page's "Change amount" link sends people back with it), or null.
function Home({
  corridors,
  urlAmount,
  example,
}: {
  corridors: Corridor[];
  urlAmount: string | null;
  example: HomeExampleData | null;
}) {
  const router = useRouter();
  const formId = useId();
  const [sendCountry, setSendCountry] = useState("");
  const [receiveCountry, setReceiveCountry] = useState("");
  // null = "the visitor hasn't typed", so the URL's amount is shown. Derived
  // rather than copied into state by an effect.
  const [typed, setTyped] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const amountText = typed ?? urlAmount ?? "";

  const sendOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of corridors) {
      if (!seen.has(c.sendCountry)) seen.set(c.sendCountry, c.sendCountryName);
    }
    return Array.from(seen, ([code, name]) => ({ code, name })).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [corridors]);

  const receiveOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of corridors) {
      if (sendCountry && c.sendCountry !== sendCountry) continue;
      if (!seen.has(c.receiveCountry)) seen.set(c.receiveCountry, c.receiveCountryName);
    }
    return Array.from(seen, ([code, name]) => ({ code, name })).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [corridors, sendCountry]);

  const selected = corridors.find(
    (c) => c.sendCountry === sendCountry && c.receiveCountry === receiveCountry
  );
  // The unit shown beside the amount: the chosen corridor's (or send
  // country's) currency, else nothing.
  const sendCurrency =
    selected?.sendCurrency ?? corridors.find((c) => c.sendCountry === sendCountry)?.sendCurrency ?? null;

  const parsed = parseAmount(amountText, sendCurrency ?? "USD");
  const amountError = !parsed.ok && !parsed.empty ? parsed.message : null;
  const query = amountQuery(parsed.ok ? parsed.value : null);

  function handleSendChange(code: string) {
    setSendCountry(code);
    setFormMessage(null);
    // The previously selected receive country might not pair with the new
    // send country: clear it rather than leave a stale/invalid selection.
    if (code && !corridors.some((c) => c.sendCountry === code && c.receiveCountry === receiveCountry)) {
      setReceiveCountry("");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (amountError) return;
    if (!selected) {
      setFormMessage("Choose where you're sending from and to, or pick a corridor below.");
      return;
    }
    router.push(`/compare/${selected.sendCountry}/${selected.receiveCountry}${query}`);
  }

  const filtered = useMemo(
    () =>
      corridors.filter(
        (c) =>
          (!sendCountry || c.sendCountry === sendCountry) &&
          (!receiveCountry || c.receiveCountry === receiveCountry)
      ),
    [corridors, sendCountry, receiveCountry]
  );

  const grouped = useMemo(() => {
    const byCurrency = new Map<string, Corridor[]>();
    for (const c of filtered) {
      const list = byCurrency.get(c.sendCurrency) ?? [];
      list.push(c);
      byCurrency.set(c.sendCurrency, list);
    }
    for (const list of byCurrency.values()) {
      list.sort((a, b) =>
        `${a.sendCountryName}${a.receiveCountryName}`.localeCompare(
          `${b.sendCountryName}${b.receiveCountryName}`
        )
      );
    }
    return SEND_CURRENCY_ORDER.filter((c) => byCurrency.has(c)).map((currency) => ({
      sendCurrency: currency,
      corridors: byCurrency.get(currency)!,
    }));
  }, [filtered]);

  const hasFilter = Boolean(sendCountry || receiveCountry);

  return (
    <main>
      <section className="hero-wash">
        <div className="mx-auto w-full max-w-5xl px-6 pb-14 pt-12 sm:pb-20 sm:pt-16">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3.5 py-1.5 text-sm font-semibold text-brand shadow-sm ring-1 ring-brand/10">
            <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime opacity-75 motion-reduce:hidden" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand" />
            </span>
            Live mid-market rates
          </p>
          <p className="mt-2 text-sm text-text-dim">Refreshed daily at 06:17 UTC.</p>

          <h1 className="mt-5 max-w-3xl font-heading text-[2.6rem] font-extrabold leading-[0.98] tracking-[-0.045em] text-brand sm:text-6xl lg:text-7xl">
            Compare real remittance costs across {corridors.length} corridors
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-snug text-text-dim">
            See what actually lands after fees and exchange-rate markup, ranked against the live
            mid-market rate.
          </p>
          {example && (
            <p className="mt-3 max-w-xl text-sm text-text-dim">
              For example: send {money(example.sendCurrency, example.sendAmount, 0)} from{" "}
              {inProse(example.sendCountryName)} to {inProse(example.receiveCountryName)} right now and{" "}
              {example.best.provider} delivers {money(example.receiveCurrency, example.best.amountReceived)}, more
              than{" "}
              {orList(
                example.others.map(
                  (o) => `${o.provider}\u2019s ${money(example.receiveCurrency, o.amountReceived)}`
                )
              )}
              .{" "}
              <Link
                href={`/compare/${example.sendCountry}/${example.receiveCountry}`}
                className="font-semibold text-link underline underline-offset-4"
              >
                See it compared
              </Link>
              .
            </p>
          )}

          <form
            onSubmit={handleSubmit}
            noValidate
            className="mt-9 rounded-3xl bg-white p-4 shadow-[0_18px_50px_-18px_rgba(22,51,0,0.35)] ring-1 ring-brand/10 sm:p-5"
          >
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_0.8fr_auto] sm:items-end">
              <div>
                <label htmlFor={`${formId}-from`} className={fieldLabel}>
                  Sending from
                </label>
                <select
                  id={`${formId}-from`}
                  value={sendCountry}
                  onChange={(e) => handleSendChange(e.target.value)}
                  className={fieldControl}
                >
                  <option value="">Anywhere</option>
                  {sendOptions.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor={`${formId}-to`} className={fieldLabel}>
                  Sending to
                </label>
                <select
                  id={`${formId}-to`}
                  value={receiveCountry}
                  onChange={(e) => {
                    setReceiveCountry(e.target.value);
                    setFormMessage(null);
                  }}
                  className={fieldControl}
                >
                  <option value="">Anywhere</option>
                  {receiveOptions.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor={`${formId}-amount`} className={fieldLabel}>
                  You send
                </label>
                <div className="relative">
                  <input
                    id={`${formId}-amount`}
                    name={AMOUNT_PARAM}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={amountText}
                    onChange={(e) => {
                      setTyped(e.target.value);
                      setFormMessage(null);
                    }}
                    placeholder="Typical amount"
                    aria-invalid={amountError !== null}
                    aria-describedby={`${formId}-amount-help`}
                    className={`${fieldControl} pr-14 tabular-nums`}
                  />
                  {sendCurrency && (
                    <span className="pointer-events-none absolute inset-y-0 right-3.5 top-1.5 flex items-center text-sm font-semibold text-text-dim">
                      {sendCurrency}
                    </span>
                  )}
                </div>
              </div>

              <button type="submit" className="btn-primary h-[3.1rem] px-7 text-base">
                Compare
              </button>
            </div>

            <p
              id={`${formId}-amount-help`}
              role={amountError || formMessage ? "alert" : undefined}
              className={`mt-3 min-h-5 text-sm ${amountError || formMessage ? "text-red-700" : "text-text-dim"}`}
            >
              {amountError ??
                formMessage ??
                (selected
                  ? `Optional. Leave blank for a typical ${money(selected.sendCurrency, selected.everydayAmount, 0)}. It carries through to every corridor you open.`
                  : "Optional. Leave the amount blank for a typical one (it varies by corridor). It carries through to every corridor you open.")}
            </p>
          </form>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-6 pb-20 pt-12">
        <div className="flex items-end justify-between gap-4">
          <h2 className="font-heading text-2xl font-extrabold tracking-[-0.03em] text-brand sm:text-3xl">
            {hasFilter ? "Matching corridors" : "All corridors"}
          </h2>
          {hasFilter && (
            <button
              type="button"
              onClick={() => {
                setSendCountry("");
                setReceiveCountry("");
                setFormMessage(null);
              }}
              className="rounded-full px-3 py-1.5 text-sm font-semibold text-link underline underline-offset-4 hover:bg-mint"
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="mt-8 space-y-10">
          {grouped.length === 0 && (
            <p className="text-sm text-text-dim">No corridors match that combination yet.</p>
          )}
          {grouped.map(({ sendCurrency: currency, corridors: list }) => (
            <div key={currency}>
              <h3 className="text-sm font-bold uppercase tracking-widest text-text-dim">
                Sending {currency}
              </h3>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((c) => (
                  <CorridorCard key={`${c.sendCountry}-${c.receiveCountry}`} corridor={c} query={query} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-14 border-t border-card-border pt-6 text-sm text-text-dim">
          Corridor compares quotes. It doesn&rsquo;t move money.
        </p>
      </section>
    </main>
  );
}

// useSearchParams needs a Suspense boundary around anything statically
// rendered. The fallback is the SAME page rendered without a URL amount, so the
// static HTML still contains the whole page (headline, form, every corridor)
// instead of a blank shell; once hydrated, the real instance picks up
// "?amount=" if the visitor arrived with one.
function HomeWithUrlAmount({ corridors, example }: { corridors: Corridor[]; example: HomeExampleData | null }) {
  const params = useSearchParams();
  return <Home corridors={corridors} urlAmount={params.get(AMOUNT_PARAM)} example={example} />;
}

export default function HomeDirectory({
  corridors,
  example,
}: {
  corridors: Corridor[];
  example: HomeExampleData | null;
}) {
  return (
    <Suspense fallback={<Home corridors={corridors} urlAmount={null} example={example} />}>
      <HomeWithUrlAmount corridors={corridors} example={example} />
    </Suspense>
  );
}
