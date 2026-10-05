"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  changeSincePrevious,
  fetchRateHistory,
  niceTicks,
  RANGE_OPTIONS,
  sliceRange,
  type RangeDays,
  type RatePoint,
} from "@/lib/rate-history";
import { rate as formatRate } from "@/lib/format";

// Mid-market rate trend for one corridor's currency pair: headline rate, change
// since the previous day, a 60D / 14D / 7D line chart, and a source line. The
// data is a reference rate from Frankfurter, fetched in the browser (see
// lib/rate-history.ts) -- it is not a provider quote and has nothing to do
// with the provider rows above it.

// The SVG's viewBox is the container's real pixel width (measured below), not
// a fixed size that gets scaled -- otherwise the axis text shrinks with the
// chart on a phone and becomes unreadable.
const DEFAULT_WIDTH = 640;
const PAD = { top: 12, right: 52, bottom: 22, left: 8 };

// timeZone: "UTC" for the same reason as shortDate() in CorridorComparison:
// the dates are UTC calendar days, and formatting them in the visitor's zone
// can shift them by one.
function dayLabel(iso: string, withYear = false): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

function axisFormatter(step: number) {
  const digits = step >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(step)));
  return (v: number) =>
    v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

type State = { status: "loading" } | { status: "error" } | { status: "ready"; points: RatePoint[] };

export default function RateTrendChart({
  sendCurrency,
  receiveCurrency,
}: {
  sendCurrency: string;
  receiveCurrency: string;
}) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [range, setRange] = useState<RangeDays>(60);
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = useId();
  const frame = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(DEFAULT_WIDTH);
  const H = W < 480 ? 210 : 240;

  useEffect(() => {
    // No reset to "loading" here: the parent keys this component by currency
    // pair, so a different corridor remounts it with fresh state.
    const controller = new AbortController();
    fetchRateHistory(sendCurrency, receiveCurrency, controller.signal)
      .then((points) => setState({ status: "ready", points }))
      .catch((err) => {
        if (err?.name !== "AbortError") setState({ status: "error" });
      });
    return () => controller.abort();
  }, [sendCurrency, receiveCurrency]);

  // Re-measure when the chart's frame mounts (after loading) or resizes.
  const ready = state.status === "ready";
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const measure = () => setW(Math.max(260, Math.round(el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);

  const all = state.status === "ready" ? state.points : null;
  const change = useMemo(() => (all ? changeSincePrevious(all) : null), [all]);
  const visible = useMemo(() => (all ? sliceRange(all, range) : null), [all, range]);

  const chart = useMemo(() => {
    if (!visible || visible.length < 2) return null;
    const rates = visible.map((p) => p.rate);
    const lo = Math.min(...rates);
    const hi = Math.max(...rates);
    const span = hi - lo || hi * 0.002;
    const yMin = lo - span * 0.08;
    const yMax = hi + span * 0.08;
    const ticks = niceTicks(yMin, yMax);
    const step = ticks.length > 1 ? ticks[1] - ticks[0] : span;
    const x = (i: number) => PAD.left + (i / (visible.length - 1)) * (W - PAD.left - PAD.right);
    const y = (v: number) =>
      PAD.top + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.top - PAD.bottom);
    const line = visible
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.rate).toFixed(1)}`)
      .join(" ");
    const area = `${line} L${x(visible.length - 1).toFixed(1)} ${H - PAD.bottom} L${x(0).toFixed(1)} ${H - PAD.bottom} Z`;
    return { lo, hi, ticks, fmt: axisFormatter(step), x, y, line, area };
  }, [visible, W, H]);

  const latest = all ? all[all.length - 1] : null;
  const shown = hover != null && visible ? visible[hover] : null;

  return (
    <section
      aria-labelledby={`${gradientId}-title`}
      className="mt-6 rounded-lg border border-card-border bg-card p-5"
    >
      <h3 id={`${gradientId}-title`} className="text-sm font-semibold">
        Mid-market exchange rate
      </h3>

      {state.status === "error" && (
        <p role="status" className="mt-2 text-sm text-text-dim">
          Rate history isn&rsquo;t available right now. The live rate above is unaffected.
        </p>
      )}

      {state.status === "loading" && (
        <div aria-hidden="true" className="mt-3 animate-pulse">
          <div className="h-8 w-56 rounded bg-card-border/60" />
          <div className="mt-2 h-3 w-32 rounded bg-card-border/60" />
          <div className="mt-5 h-[200px] rounded bg-card-border/40" />
        </div>
      )}

      {state.status === "ready" && latest && (
        <>
          <p className="font-heading mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
            1 {sendCurrency} = {formatRate(latest.rate)} {receiveCurrency}
          </p>
          {change && (
            <p
              className={`mt-1 text-sm ${
                change.pct > 0
                  ? "text-cost"
                  : change.pct < 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-text-dim"
              }`}
            >
              <span aria-hidden="true">{change.pct > 0 ? "▲" : change.pct < 0 ? "▼" : "•"} </span>
              {change.pct > 0 ? "+" : ""}
              {change.pct.toFixed(2)}%{" "}
              <span className="text-text-dim">
                since {change.sinceYesterday ? "yesterday" : dayLabel(change.previous.date)}
              </span>
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <div role="group" aria-label="Chart range" className="flex gap-1">
              {RANGE_OPTIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={range === d}
                  onClick={() => {
                    setRange(d);
                    setHover(null);
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs font-bold tracking-wide transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current ${
                    range === d
                      ? "bg-link/15 text-link"
                      : "text-text-dim hover:bg-card-border/50 hover:text-text"
                  }`}
                >
                  {d}D
                </button>
              ))}
            </div>
            <p className="min-h-4 text-xs tabular-nums text-text-dim" aria-hidden="true">
              {shown
                ? `${dayLabel(shown.date, true)} · ${formatRate(shown.rate)} ${receiveCurrency}`
                : ""}
            </p>
          </div>

          <div ref={frame}>
            {chart && visible && (
              <svg
                viewBox={`0 0 ${W} ${H}`}
                height={H}
                role="img"
                aria-label={`Line chart of the ${sendCurrency} to ${receiveCurrency} mid-market rate, ${dayLabel(visible[0].date)} to ${dayLabel(visible[visible.length - 1].date)}. Started at ${formatRate(visible[0].rate)}, ended at ${formatRate(visible[visible.length - 1].rate)}, low ${formatRate(chart.lo)}, high ${formatRate(chart.hi)}.`}
                className="mt-2 block w-full touch-pan-y text-link"
                onPointerMove={(e) => {
                  const box = e.currentTarget.getBoundingClientRect();
                  const px = ((e.clientX - box.left) / box.width) * W;
                  const frac = (px - PAD.left) / (W - PAD.left - PAD.right);
                  setHover(
                    Math.max(
                      0,
                      Math.min(visible.length - 1, Math.round(frac * (visible.length - 1))),
                    ),
                  );
                }}
                onPointerLeave={() => setHover(null)}
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="currentColor" stopOpacity="0.22" />
                    <stop offset="1" stopColor="currentColor" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {chart.ticks.map((t) => (
                  <g key={t}>
                    <line
                      x1={PAD.left}
                      x2={W - PAD.right}
                      y1={chart.y(t)}
                      y2={chart.y(t)}
                      className="stroke-card-border"
                      strokeWidth="1"
                    />
                    <text
                      x={W - PAD.right + 6}
                      y={chart.y(t)}
                      dominantBaseline="middle"
                      className="fill-text-dim"
                      fontSize="11"
                    >
                      {chart.fmt(t)}
                    </text>
                  </g>
                ))}
                <text x={PAD.left} y={H - 5} className="fill-text-dim" fontSize="11">
                  {dayLabel(visible[0].date)}
                </text>
                <text
                  x={W - PAD.right}
                  y={H - 5}
                  textAnchor="end"
                  className="fill-text-dim"
                  fontSize="11"
                >
                  {dayLabel(visible[visible.length - 1].date)}
                </text>
                <path d={chart.area} fill={`url(#${gradientId})`} />
                <path
                  d={chart.line}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {hover != null && (
                  <g>
                    <line
                      x1={chart.x(hover)}
                      x2={chart.x(hover)}
                      y1={PAD.top}
                      y2={H - PAD.bottom}
                      className="stroke-text-dim"
                      strokeWidth="1"
                      strokeDasharray="3 3"
                    />
                    <circle
                      cx={chart.x(hover)}
                      cy={chart.y(visible[hover].rate)}
                      r="4"
                      fill="currentColor"
                    />
                  </g>
                )}
              </svg>
            )}
          </div>

          <p className="mt-2 text-xs text-text-dim">
            Source:{" "}
            <a
              href="https://frankfurter.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-text"
            >
              Frankfurter<span className="sr-only"> (opens in a new tab)</span>
            </a>{" "}
            central-bank reference rates &middot; latest rate {dayLabel(latest.date, true)}. A
            reference rate, not a quote from any provider.
          </p>
        </>
      )}
    </section>
  );
}
