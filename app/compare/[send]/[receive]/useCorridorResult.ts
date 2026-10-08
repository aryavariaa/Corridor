"use client";

import { useEffect, useState } from "react";
import { parseAmount } from "@/lib/amount";
import type { Corridor, RankedProvidersResult } from "@/lib/corridors";

// What the corridor page (and the head-to-head page) should show for the
// amount in the URL.
//
// The page is statically rendered with the corridor's default result (its
// "typical" amount, every row verified). If the visitor arrived with
// "?amount=500" from the homepage, this fetches the live result for that
// amount from /api/custom-amount. Three states, all DERIVED from "the amount
// we want" vs "the amount we have" rather than set by effects, so there is no
// moment where numbers for one amount are shown under a label for another:
//
//   - default amount wanted (or none):  the static result, no request
//   - another amount wanted, not here yet:  loading (callers show a skeleton,
//     never the default numbers pretending to be the requested ones)
//   - the request failed:  error, and the caller falls back to the default
//     result with a message saying so

type Fetched =
  | { amount: number; ok: true; result: RankedProvidersResult }
  | { amount: number; ok: false; message: string };

export type CorridorResultState = {
  // The amount being shown, in the sending currency.
  amount: number;
  // true when `amount` is the corridor's default (verified, static) amount.
  isDefault: boolean;
  result: RankedProvidersResult;
  loading: boolean;
  // Set when a requested amount couldn't be priced; `result` is then the
  // default result and `amount` its amount.
  error: { requested: number; message: string } | null;
};

export function useCorridorResult(
  corridor: Corridor,
  initialResult: RankedProvidersResult,
  urlAmount: string | null
): CorridorResultState {
  const defaultAmount = corridor.everydayAmount;
  const parsed = urlAmount === null ? null : parseAmount(urlAmount, corridor.sendCurrency);
  const requested = parsed?.ok ? parsed.value : null;
  // The amount that needs a live request: valid, and not the default.
  const wanted = requested !== null && requested !== defaultAmount ? requested : null;

  const [fetched, setFetched] = useState<Fetched | null>(null);

  useEffect(() => {
    if (wanted === null) return;
    const controller = new AbortController();
    fetch(
      `/api/custom-amount?sendCountry=${encodeURIComponent(corridor.sendCountry)}` +
        `&receiveCountry=${encodeURIComponent(corridor.receiveCountry)}&amount=${wanted}`,
      { signal: controller.signal }
    )
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
        setFetched({ amount: wanted, ok: true, result: json as RankedProvidersResult });
      })
      .catch((err) => {
        if (controller.signal.aborted) return; // superseded by a newer amount
        setFetched({
          amount: wanted,
          ok: false,
          message: err instanceof Error ? err.message : "Something went wrong",
        });
      });
    return () => controller.abort();
  }, [wanted, corridor.sendCountry, corridor.receiveCountry]);

  if (wanted === null) {
    return { amount: defaultAmount, isDefault: true, result: initialResult, loading: false, error: null };
  }
  if (fetched !== null && fetched.amount === wanted) {
    if (fetched.ok) {
      return { amount: wanted, isDefault: false, result: fetched.result, loading: false, error: null };
    }
    return {
      amount: defaultAmount,
      isDefault: true,
      result: initialResult,
      loading: false,
      error: { requested: wanted, message: fetched.message },
    };
  }
  return { amount: wanted, isDefault: false, result: initialResult, loading: true, error: null };
}
