// The one-line worked example on the homepage ("send $200 ... X delivers A,
// more than Y's B"). It is computed from the corridor's stored data at render
// time, never typed in: a hardcoded sentence would quietly go false the next
// time the daily refresh changes which provider wins.
//
// Pure (no data, no fetch) so it can be unit-tested (lib/home-example.test.mjs).
//
// Rows flagged "Under review" (a probable promotional quote, see
// lib/under-review.ts) are left out: the homepage must not advertise a number
// we have ourselves marked as doubtful. Nor is the example shown at all unless
// at least two rows remain and one is strictly ahead, so it never claims a win
// that is really a tie.

export type ExampleRow = { provider: string; amountReceived: number; underReview?: boolean };

export type HomeExample<T extends ExampleRow> = { best: T; others: T[] };

export function pickExample<T extends ExampleRow>(rows: T[]): HomeExample<T> | null {
  const eligible = rows
    .filter((r) => !r.underReview && Number.isFinite(r.amountReceived) && r.amountReceived > 0)
    .sort((a, b) => b.amountReceived - a.amountReceived);
  if (eligible.length < 2) return null;
  const [best, ...others] = eligible;
  if (!(best.amountReceived > others[0].amountReceived)) return null;
  return { best, others };
}
