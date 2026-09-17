// Shared display formatting for money/percent/rate values.
//
// Used by both the client UI (CorridorComparison.tsx) and the AI insight
// prompts (lib/ai.ts) so the figures the model is handed -- and told to
// use verbatim -- are the exact same strings rendered elsewhere on the
// page. One formatter shared by both call sites makes "the AI text never
// drifts from what's displayed" a structural guarantee rather than a
// convention two separate implementations could quietly diverge from.

export function money(currency: string, amount: number, fractionDigits = 2): string {
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

export function percent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

// Matches the live-rate line's own formatting in CorridorComparison.tsx.
export function rate(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}
