// Rows whose quote is flagged by the hand-sourced PayPal spread check
// (scripts/lib/spread-check.mjs) and not yet re-sourced from a standard-rate
// quote. The UI shows an "Under review" label on them; the number itself is
// left as entered (we don't correct it until we have a real logged-in rate).
//
// An entry is tied to the row's exact dateChecked, like the spread allowlist:
// re-sourcing the row (new date) ends the label automatically, so it can never
// outlive the quote it was written for. Entries live in data/under-review.json.
export type UnderReviewEntry = {
  sendCountry: string;
  receiveCountry: string;
  provider: string;
  dateChecked: string;
  reason: string;
};

export function findUnderReview(
  entries: UnderReviewEntry[],
  row: { sendCountry: string; receiveCountry: string; provider: string; dateChecked: string }
): UnderReviewEntry | undefined {
  return entries.find(
    (e) =>
      e.sendCountry === row.sendCountry &&
      e.receiveCountry === row.receiveCountry &&
      e.provider === row.provider &&
      e.dateChecked === row.dateChecked
  );
}
