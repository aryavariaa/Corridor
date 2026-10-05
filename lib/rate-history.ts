// Mid-market rate history for the corridor page's trend chart.
//
// Source: Frankfurter v2 (api.frankfurter.dev), the same API family lib/fx.ts
// already uses for the live rate (/v2/rate/{base}/{quote}), so the chart's
// latest point and the page's "Live rate" line come from one upstream. It is
// free, keyless, uncapped and sends `access-control-allow-origin: *`, so the
// browser fetches it directly -- no backend, nothing to do with the provider
// pipeline or the Lambda. The response is a flat list of
// { date, base, quote, rate } rows, one per day (weekends included).
//
// Coverage was checked 2026-10-04 against /v2/currencies: all 11 currencies
// Corridor uses (USD GBP CAD AUD EUR INR PHP MXN ZAR BDT VND) are present.
// NOTE the older /v1/currencies list (30 ECB currencies) does NOT include BDT
// or VND -- do not "simplify" this to /v1, or the Bangladesh and Vietnam
// corridors silently lose their chart.
//
// This is a reference rate, not a provider quote: nothing here says what any
// provider will actually give you.

export type RatePoint = { date: string; rate: number }; // date = "YYYY-MM-DD" (UTC)

export type RangeDays = 7 | 14 | 60;
export const RANGE_OPTIONS: RangeDays[] = [60, 14, 7];
export const HISTORY_DAYS = 60;

const DAY_MS = 86_400_000;

const toMs = (isoDate: string) => Date.parse(`${isoDate}T00:00:00Z`);
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function historyUrl(base: string, quote: string, today: Date = new Date()): string {
  const to = toIso(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const from = toIso(toMs(to) - HISTORY_DAYS * DAY_MS);
  return `https://api.frankfurter.dev/v2/rates?from=${from}&to=${to}&base=${base}&quotes=${quote}`;
}

// Throws on a network failure, a non-2xx, or a body that isn't a usable
// series; the caller shows an "unavailable" state instead of a broken chart.
export async function fetchRateHistory(
  base: string,
  quote: string,
  signal?: AbortSignal,
  today?: Date,
): Promise<RatePoint[]> {
  const res = await fetch(historyUrl(base, quote, today), { signal });
  if (!res.ok) throw new Error(`Frankfurter ${res.status}`);
  return parseRateHistory(await res.json(), quote);
}

export function parseRateHistory(body: unknown, quote: string): RatePoint[] {
  if (!Array.isArray(body)) throw new Error("Unexpected Frankfurter response");
  const points = body
    .filter(
      (r): r is { date: string; quote: string; rate: number } =>
        r != null &&
        typeof r.date === "string" &&
        r.quote === quote &&
        typeof r.rate === "number" &&
        Number.isFinite(r.rate) &&
        r.rate > 0,
    )
    .map((r) => ({ date: r.date, rate: r.rate }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (points.length < 2) throw new Error("Not enough rate history");
  return points;
}

// The last `days` days ending at the latest point (both ends included).
export function sliceRange(points: RatePoint[], days: RangeDays): RatePoint[] {
  const cutoff = toMs(points[points.length - 1].date) - days * DAY_MS;
  return points.filter((p) => toMs(p.date) >= cutoff);
}

export type RateChange = {
  pct: number; // percent, e.g. 0.14 for +0.14%
  previous: RatePoint;
  latest: RatePoint;
  // True when `previous` is the calendar day before `latest`; otherwise the
  // UI names the date instead of saying "yesterday" (e.g. after a gap).
  sinceYesterday: boolean;
};

// Change from the previous data point to the latest, over the FULL history
// (not the selected range) so the headline doesn't move when you toggle 7D.
export function changeSincePrevious(points: RatePoint[]): RateChange | null {
  if (points.length < 2) return null;
  const latest = points[points.length - 1];
  const previous = points[points.length - 2];
  return {
    pct: ((latest.rate - previous.rate) / previous.rate) * 100,
    previous,
    latest,
    sinceYesterday: toMs(latest.date) - toMs(previous.date) === DAY_MS,
  };
}

// "Nice" axis ticks covering [min, max]: ~4-6 round values.
export function niceTicks(min: number, max: number, target = 5): number[] {
  if (!(max > min)) return [min];
  const rough = (max - min) / target;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) {
    ticks.push(Number(v.toPrecision(12)));
  }
  return ticks;
}
