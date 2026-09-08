"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  getAvailableSendCountries,
  getReceiveCountriesFor,
} from "@/lib/corridors";

const sendCountries = getAvailableSendCountries();

export default function Home() {
  const [sendCountry, setSendCountry] = useState(sendCountries[0]?.code ?? "");
  const receiveCountries = useMemo(
    () => getReceiveCountriesFor(sendCountry),
    [sendCountry]
  );
  const [receiveCountry, setReceiveCountry] = useState(
    receiveCountries[0]?.code ?? ""
  );

  function handleSendChange(code: string) {
    setSendCountry(code);
    // The previously selected receive country might not pair with the new
    // send country -- fall back to that pair's first valid option rather
    // than pointing the picker at a combination with no data.
    const nextReceiveOptions = getReceiveCountriesFor(code);
    if (!nextReceiveOptions.some((r) => r.code === receiveCountry)) {
      setReceiveCountry(nextReceiveOptions[0]?.code ?? "");
    }
  }

  const canCompare = Boolean(sendCountry && receiveCountry);

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

      <div className="mt-8 space-y-5 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor="send-country"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Sending from
            </label>
            <select
              id="send-country"
              value={sendCountry}
              onChange={(e) => handleSendChange(e.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950"
            >
              {sendCountries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="receive-country"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Sending to
            </label>
            <select
              id="receive-country"
              value={receiveCountry}
              onChange={(e) => setReceiveCountry(e.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950"
            >
              {receiveCountries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Link
          href={canCompare ? `/compare/${sendCountry}/${receiveCountry}` : "#"}
          aria-disabled={!canCompare}
          className={`block w-full rounded-md px-4 py-2 text-center text-sm font-medium text-white transition-colors ${
            canCompare
              ? "bg-blue-600 hover:bg-blue-700"
              : "pointer-events-none cursor-not-allowed bg-blue-600/50"
          }`}
        >
          Compare providers
        </Link>
      </div>

      <p className="mt-4 text-xs text-zinc-500">
        More corridors are added as we finish researching real provider rates
        for them -- these are the ones with real data today.
      </p>

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
