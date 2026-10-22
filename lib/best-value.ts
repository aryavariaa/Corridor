// Which row gets the "Best value" badge (and which pair the "Why X wins" insight
// narrates). Pure (no data, no fetch, no Next aliases) so the corridor page, the
// insight and the tests share one rule (see lib/under-review.test.mjs).
//
// The rule: the top-ranked row that is not "Under review". A row flagged in
// data/under-review.json is a probable promotional quote (lib/under-review.ts),
// so it still shows, still carries its label and keeps its sorted position, but
// it must not be crowned the best value. If every row is under review there is
// no badge at all. The benchmark reference row (rank 0) is never ranked.

export type BestValueRow = {
  provider: string;
  // 1 = cheapest ranked row; 0 = the benchmark reference, outside the ranking.
  rank: number;
  benchmarkReference?: boolean;
  underReview?: boolean;
};

function eligible(p: BestValueRow): boolean {
  return p.rank >= 1 && !p.benchmarkReference && !p.underReview;
}

export function bestValue<T extends BestValueRow>(rows: T[]): T | undefined {
  return rows.filter(eligible).sort((a, b) => a.rank - b.rank)[0];
}

// The next eligible row behind `best`, for "why X beats Y". Rows under review
// are skipped for the same reason: a doubtful quote isn't a fair yardstick.
export function runnerUpTo<T extends BestValueRow>(rows: T[], best: T): T | undefined {
  return rows
    .filter((p) => eligible(p) && p.rank > best.rank)
    .sort((a, b) => a.rank - b.rank)[0];
}
