"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useId, useMemo, useState } from "react";
import { AMOUNT_PARAM, amountQuery, parseAmount } from "@/lib/amount";
import { money } from "@/lib/format";
import CountrySelect from "./CountrySelect";
import ErrorMessage from "./ErrorMessage";
import type { Corridor } from "@/lib/corridors";

// One field in the bar: a rounded box holding a small label over the value. The
// control inside is bare, so the box carries the focus ring (focus-within).
const fieldBox =
  "relative rounded-2xl border border-card-border bg-white/70 px-4 pb-2 pt-2.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand";
const fieldLabel = "block text-[0.68rem] font-semibold uppercase tracking-wider text-text-dim";
const fieldSelect =
  "mt-0.5 block w-full appearance-none bg-transparent pr-6 text-base font-semibold text-text outline-none";

// `urlAmount` is whatever "?amount=" the page was opened with (the corridor
// page's "All corridors" link sends people back with it), or null.
function Home({ corridors, urlAmount }: { corridors: Corridor[]; urlAmount: string | null }) {
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
      setFormMessage("Choose where you're sending from and to.");
      return;
    }
    router.push(`/compare/${selected.sendCountry}/${selected.receiveCountry}${query}`);
  }

  return (
    <main>
      {/* Hero: the day/night scene is the CSS background of .hero (app/globals.css).
          The copy sits at the top, the form bar in the artwork's middle band. */}
      <section className="hero">
        <div className="hero-copy relative z-10 mx-auto flex max-w-[1100px] flex-col items-center px-5 pb-6 pt-8 text-center">
          <p className="scope-light inline-flex items-center gap-2 rounded-full bg-white/95 px-3.5 py-1.5 text-sm font-semibold text-link shadow-sm">
            <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime opacity-75 motion-reduce:hidden" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-lime" />
            </span>
            Live mid-market rates
          </p>

          <h1 className="mt-5 max-w-[1100px] text-balance font-heading text-[2.5rem] font-extrabold leading-[0.98] tracking-[-0.045em] text-brand sm:text-[3.25rem] lg:text-[clamp(3rem,4.4vw,4rem)]">
            Compare <em className="hero-em pr-[0.06em]">real remittance costs</em> between countries
          </h1>
          <p className="hero-sub mt-5 max-w-xl text-balance text-lg leading-snug">
            Fees and exchange rates together, ranked by what your recipient actually gets.
          </p>

          <ul className="mt-6 flex flex-wrap justify-center gap-2">
            <li className="scope-light rounded-full bg-white/95 px-4 py-1.5 text-sm font-semibold text-brand">
              Free to use
            </li>
            <li className="scope-light rounded-full bg-white/95 px-4 py-1.5 text-sm font-semibold text-brand">
              No account needed
            </li>
            <li className="scope-light rounded-full bg-white/95 text-sm font-semibold text-brand">
              {/* Honest scope: the daily 06:17 UTC run (cron(17 6 * * ? *) in
                  aws/template.yaml, confirmed on the deployed stack) refreshes
                  Wise and Western Union on every corridor; PayPal only where the
                  feed carries it, the rest is hand-entered and dated. The page
                  /methodology says so in full. */}
              <Link
                href="/methodology"
                title="Wise and Western Union are refreshed by a daily run at 06:17 UTC. PayPal is refreshed where the feed carries it and entered by hand, with its date, elsewhere."
                className="block text-balance rounded-full px-4 py-1.5 text-center hover:underline"
              >
                Wise and Western Union refreshed daily, 06:17 UTC
              </Link>
            </li>
          </ul>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="hero-bar glass-bar scope-light relative z-10 mx-auto mt-6 w-[calc(100%-2.5rem)] max-w-[800px] p-3 sm:p-3.5 lg:mt-0"
        >
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-stretch">
            <CountrySelect
              label="Sending from"
              value={sendCountry}
              onChange={handleSendChange}
              options={sendOptions}
              boxClassName={fieldBox}
              labelClassName={fieldLabel}
            />

            <CountrySelect
              label="Sending to"
              value={receiveCountry}
              onChange={(code) => {
                setReceiveCountry(code);
                setFormMessage(null);
              }}
              options={receiveOptions}
              boxClassName={fieldBox}
              labelClassName={fieldLabel}
            />

            <div className={fieldBox}>
              <label htmlFor={`${formId}-amount`} className={fieldLabel}>
                You send
              </label>
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
                className={`${fieldSelect} field-in-wrapper ${sendCurrency ? "pr-12" : "pr-2"} tabular-nums`}
              />
              {sendCurrency && (
                <span className="pointer-events-none absolute bottom-2.5 right-4 text-sm font-semibold text-text-dim">
                  {sendCurrency}
                </span>
              )}
            </div>

            <button type="submit" className="btn-primary btn-hero min-h-[3.5rem] px-8 text-base">
              Compare
            </button>
          </div>

          {amountError || formMessage ? (
            <ErrorMessage id={`${formId}-amount-help`} className="mt-2.5 px-1 text-xs leading-snug">
              {amountError ?? formMessage}
            </ErrorMessage>
          ) : (
            <p id={`${formId}-amount-help`} className="mt-2.5 px-1 text-xs leading-snug text-text-dim">
              {selected
                ? `Optional. Leave blank for a typical ${money(selected.sendCurrency, selected.everydayAmount, 0)}. It carries through to every corridor you open.`
                : "Optional. Leave the amount blank for a typical one (it varies by corridor). It carries through to every corridor you open."}
            </p>
          )}
        </form>
      </section>

      <p className="mx-auto w-full max-w-5xl px-6 pb-16 pt-10 text-sm text-text-dim">
        Corridor compares quotes. It doesn&rsquo;t move money.
      </p>
    </main>
  );
}

// useSearchParams needs a Suspense boundary around anything statically
// rendered. The fallback is the SAME page rendered without a URL amount, so the
// static HTML still contains the whole page (headline, chips, form)
// instead of a blank shell; once hydrated, the real instance picks up
// "?amount=" if the visitor arrived with one.
function HomeWithUrlAmount({ corridors }: { corridors: Corridor[] }) {
  const params = useSearchParams();
  return <Home corridors={corridors} urlAmount={params.get(AMOUNT_PARAM)} />;
}

export default function HomeDirectory({ corridors }: { corridors: Corridor[] }) {
  return (
    <Suspense fallback={<Home corridors={corridors} urlAmount={null} />}>
      <HomeWithUrlAmount corridors={corridors} />
    </Suspense>
  );
}
