// A provider row's fee / exchange rate / delivery estimate, for display.
//
// These come from the same quote as `amountReceived` (the refresh job writes
// them together; see quoteBreakdown in scripts/lib/refresh-core.mjs), but a
// row can briefly hold a fresh amount beside a stale fee or rate -- e.g. if a
// refresh ran on older code that didn't know about them. So the numbers are
// only shown when they reproduce the amount:
//
//     amountReceived ~= (sendAmount - fee) * rate
//
// Anything that doesn't is dropped (shown as "see provider"), never shown
// beside an amount it contradicts. Kept free of Next path aliases so it can be
// unit-tested directly (lib/row-breakdown.test.mjs).

export type RowBreakdownInput = {
  sendAmount: number;
  amountReceived: number;
  fee?: number;
  rate?: number;
  deliveryMinMinutes?: number;
  deliveryMaxMinutes?: number;
};

export type RowBreakdown = {
  fee?: number;
  rate?: number;
  deliveryMinMinutes?: number;
  deliveryMaxMinutes?: number;
};

// 1% covers the provider rounding the rate to 4-6 places and the received
// amount to cents, which is all the slack legitimate rows need.
export const BREAKDOWN_TOLERANCE = 0.01;

export function consistentBreakdown(row: RowBreakdownInput): RowBreakdown {
  const out: RowBreakdown = {};
  const { fee, rate } = row;
  if (
    typeof fee === "number" &&
    typeof rate === "number" &&
    Number.isFinite(fee) &&
    Number.isFinite(rate) &&
    fee >= 0 &&
    rate > 0 &&
    row.sendAmount > fee
  ) {
    const implied = (row.sendAmount - fee) * rate;
    if (Math.abs(implied - row.amountReceived) / row.amountReceived <= BREAKDOWN_TOLERANCE) {
      out.fee = fee;
      out.rate = rate;
    }
  }
  const { deliveryMinMinutes: min, deliveryMaxMinutes: max } = row;
  if (typeof min === "number" && typeof max === "number" && min >= 0 && max >= min) {
    out.deliveryMinMinutes = min;
    out.deliveryMaxMinutes = max;
  }
  return out;
}

// "Under an hour", "About 11 hours", "1-2 days". Whole numbers only: the
// provider's estimate is a range, so false precision ("11h 7m") misleads.
export function formatDelivery(minMinutes: number, maxMinutes: number): string {
  const fmt = (m: number): { n: number; unit: "hour" | "day" } =>
    m >= 2880 ? { n: Math.round(m / 1440), unit: "day" } : { n: Math.round(m / 60), unit: "hour" };
  if (maxMinutes < 60) return "Under an hour";
  const lo = fmt(minMinutes);
  const hi = fmt(maxMinutes);
  const plural = (n: number, u: string) => `${n} ${u}${n === 1 ? "" : "s"}`;
  if (lo.unit === hi.unit && lo.n === hi.n) return `About ${plural(hi.n, hi.unit)}`;
  if (lo.unit === hi.unit) return `${lo.n}-${plural(hi.n, hi.unit)}`;
  return `${plural(lo.n, lo.unit)} to ${plural(hi.n, hi.unit)}`;
}

// ISO-8601 duration ("PT11H9M3.81S", "P1D") -> whole minutes, or null. The TS
// twin of parseIsoDurationMinutes in scripts/lib/refresh-core.mjs (the file the
// Lambda ships, so it can't import from here); lib/row-breakdown.test.mjs
// checks the two agree.
export function parseIsoDurationMinutes(iso: unknown): number | null {
  if (typeof iso !== "string") return null;
  const m = iso.match(
    /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/
  );
  if (!m || m.slice(1).every((x) => x === undefined)) return null;
  const [d, h, mi, sec] = m.slice(1).map((x) => (x === undefined ? 0 : Number(x)));
  return Math.round(d * 1440 + h * 60 + mi + sec / 60);
}
