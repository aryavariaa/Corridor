"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FRESHNESS_DOT_CLASS, type DirectoryEntry, type Freshness, type Region } from "@/lib/corridors";

const REGION_ORDER: Region[] = [
  "North America",
  "Europe",
  "Gulf",
  "Asia-Pacific",
  "Other",
];

const FRESHNESS_LABEL: Record<Freshness, string> = {
  fresh: "Checked within a week",
  aging: "Checked within a month",
  stale: "Data over a month old",
};

function percent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

function FreshnessBadge({ freshness }: { freshness: DirectoryEntry["freshness"] }) {
  if (!freshness) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-stone-600 dark:text-stone-400">
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${FRESHNESS_DOT_CLASS[freshness.level]}`}
      />
      {FRESHNESS_LABEL[freshness.level]}
    </span>
  );
}

function CorridorCard({ entry }: { entry: DirectoryEntry }) {
  const { corridor, freshness, teaser } = entry;
  return (
    <Link
      href={`/compare/${corridor.sendCountry}/${corridor.receiveCountry}`}
      className="flex flex-col gap-2 rounded-lg border border-stone-200 bg-white p-4 transition-colors hover:border-link dark:border-stone-800 dark:bg-stone-950 dark:hover:border-link"
    >
      <span className="text-base font-semibold">
        {corridor.sendCountryName}
        <span className="mx-1.5 text-stone-400 dark:text-stone-600">→</span>
        {corridor.receiveCountryName}
      </span>
      <span className="text-xs text-stone-600 dark:text-stone-400">
        {corridor.sendCurrency} → {corridor.receiveCurrency}
      </span>
      <span className="text-sm">
        {teaser ? (
          <>
            From <span className="font-medium">{teaser.cheapestProvider}</span>{" "}
            <span className="font-medium text-cost">{percent(teaser.costPercent)} cost</span>
          </>
        ) : (
          <span className="text-stone-400 dark:text-stone-600">
            Live rate unavailable right now
          </span>
        )}
      </span>
      <FreshnessBadge freshness={freshness} />
    </Link>
  );
}

export default function HomeDirectory({ entries }: { entries: DirectoryEntry[] }) {
  const [sendCountry, setSendCountry] = useState("");
  const [receiveCountry, setReceiveCountry] = useState("");

  const sendOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of entries) {
      if (!seen.has(e.corridor.sendCountry)) {
        seen.set(e.corridor.sendCountry, e.corridor.sendCountryName);
      }
    }
    return Array.from(seen, ([code, name]) => ({ code, name })).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [entries]);

  const receiveOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of entries) {
      if (sendCountry && e.corridor.sendCountry !== sendCountry) continue;
      if (!seen.has(e.corridor.receiveCountry)) {
        seen.set(e.corridor.receiveCountry, e.corridor.receiveCountryName);
      }
    }
    return Array.from(seen, ([code, name]) => ({ code, name })).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [entries, sendCountry]);

  function handleSendChange(code: string) {
    setSendCountry(code);
    // The previously selected receive country might not pair with the new
    // send country -- clear it rather than leaving a stale/invalid filter.
    if (code) {
      const stillValid = entries.some(
        (e) => e.corridor.sendCountry === code && e.corridor.receiveCountry === receiveCountry
      );
      if (!stillValid) setReceiveCountry("");
    }
  }

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (sendCountry && e.corridor.sendCountry !== sendCountry) return false;
      if (receiveCountry && e.corridor.receiveCountry !== receiveCountry) return false;
      return true;
    });
  }, [entries, sendCountry, receiveCountry]);

  const grouped = useMemo(() => {
    const byRegion = new Map<Region, DirectoryEntry[]>();
    for (const e of filtered) {
      const list = byRegion.get(e.region) ?? [];
      list.push(e);
      byRegion.set(e.region, list);
    }
    for (const list of byRegion.values()) {
      list.sort((a, b) =>
        `${a.corridor.sendCountryName}${a.corridor.receiveCountryName}`.localeCompare(
          `${b.corridor.sendCountryName}${b.corridor.receiveCountryName}`
        )
      );
    }
    return REGION_ORDER.filter((r) => byRegion.has(r)).map((region) => ({
      region,
      entries: byRegion.get(region)!,
    }));
  }, [filtered]);

  const hasFilter = Boolean(sendCountry || receiveCountry);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Corridor</h1>
      <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
        Ranks providers by how much of the live mid-market value survives fees
        and FX margin. Cheapest first.
      </p>
      <p className="mt-2 text-sm">
        <Link href="/methodology" className="text-link hover:underline">
          How we calculate this
        </Link>
      </p>

      <div className="mt-8 flex flex-col gap-3 rounded-lg border border-stone-200 p-4 sm:flex-row sm:items-end sm:gap-4 dark:border-stone-800">
        <div className="flex-1 space-y-1.5">
          <label
            htmlFor="send-country"
            className="block text-xs font-medium text-stone-700 dark:text-stone-300"
          >
            Sending from
          </label>
          <select
            id="send-country"
            value={sendCountry}
            onChange={(e) => handleSendChange(e.target.value)}
            className="w-full rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm shadow-sm outline-none focus:border-link dark:border-stone-700 dark:bg-stone-950"
          >
            <option value="">Anywhere</option>
            {sendOptions.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 space-y-1.5">
          <label
            htmlFor="receive-country"
            className="block text-xs font-medium text-stone-700 dark:text-stone-300"
          >
            Sending to
          </label>
          <select
            id="receive-country"
            value={receiveCountry}
            onChange={(e) => setReceiveCountry(e.target.value)}
            className="w-full rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm shadow-sm outline-none focus:border-link dark:border-stone-700 dark:bg-stone-950"
          >
            <option value="">Anywhere</option>
            {receiveOptions.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {hasFilter && (
          <button
            type="button"
            onClick={() => {
              setSendCountry("");
              setReceiveCountry("");
            }}
            className="text-sm text-stone-500 hover:text-stone-700 hover:underline dark:text-stone-400 dark:hover:text-stone-200 sm:pb-2"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="mt-10 space-y-10">
        {grouped.length === 0 && (
          <p className="text-sm text-stone-600 dark:text-stone-400">
            No corridors match that combination yet.
          </p>
        )}
        {grouped.map(({ region, entries: regionEntries }) => (
          <section key={region}>
            <h2 className="text-sm font-bold uppercase tracking-widest text-stone-600 dark:text-stone-400">
              {region === "Other" ? "Other" : `From ${region}`}
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {regionEntries.map((entry) => (
                <CorridorCard
                  key={`${entry.corridor.sendCountry}-${entry.corridor.receiveCountry}`}
                  entry={entry}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <footer className="mt-12 border-t border-stone-200 pt-6 text-sm text-stone-600 dark:border-stone-800 dark:text-stone-400">
        <Link href="/methodology" className="text-link hover:underline">
          How we calculate this
        </Link>
      </footer>
    </main>
  );
}
