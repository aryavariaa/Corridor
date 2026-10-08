// Head-to-head maths: who wins between two providers on one corridor and by
// how much. Pure (no data, no fetch, no Next aliases) so the page and the
// tests share it (lib/versus.test.mjs).
//
// Both rows are always priced for the SAME send amount (they come from one
// ranked result), so the difference in what the recipient gets is a fair,
// like-for-like number, not a comparison of two different amounts.

export type VersusRow = {
  provider: string;
  sendAmount: number;
  amountReceived: number;
  costPercent: number;
};

export type Verdict =
  | {
      kind: "winner";
      winner: string;
      loser: string;
      // More received by the winner, in the receiving currency.
      diff: number;
      // That difference as a share of what the loser's recipient gets.
      diffPercent: number;
    }
  | { kind: "tie"; diff: number };

// Within 0.1% of each other the honest answer is "no meaningful difference":
// quotes move by more than that between a page load and the provider's own
// checkout, so naming a winner would be false precision.
export const TIE_THRESHOLD = 0.001;

export function verdict(a: VersusRow, b: VersusRow): Verdict {
  const hi = a.amountReceived >= b.amountReceived ? a : b;
  const lo = hi === a ? b : a;
  const diff = hi.amountReceived - lo.amountReceived;
  if (lo.amountReceived <= 0 || diff / lo.amountReceived < TIE_THRESHOLD) {
    return { kind: "tie", diff };
  }
  return {
    kind: "winner",
    winner: hi.provider,
    loser: lo.provider,
    diff,
    diffPercent: (diff / lo.amountReceived) * 100,
  };
}

// Every unordered pair of the given names, in a stable order.
export function allPairs(names: string[]): [string, string][] {
  const sorted = [...names].sort();
  const out: [string, string][] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) out.push([sorted[i], sorted[j]]);
  }
  return out;
}

// Corridors people most often ask about, in rough order of popularity, used to
// pick the "how do these two compare elsewhere" table. Only ones that exist in
// the data and carry both providers are used (see the page).
export const POPULAR_CORRIDORS: [string, string][] = [
  ["US", "IN"],
  ["US", "MX"],
  ["GB", "IN"],
  ["US", "PH"],
  ["CA", "IN"],
  ["AU", "IN"],
  ["EUR", "IN"],
  ["US", "VN"],
  ["GB", "PH"],
  ["US", "DE"],
  ["US", "GB"],
];
