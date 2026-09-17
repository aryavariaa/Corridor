// LLM-narrated insights layered on top of numbers Corridor already
// computes. The model never computes or looks up anything itself -- every
// figure it's allowed to mention is handed to it pre-formatted (via
// lib/format.ts, the same formatter the UI renders with), and the prompt
// explicitly forbids introducing any number that isn't in that block.
// This is a trust product: a hallucinated fee or rate here is worse than
// no narration at all, so every call site below is written to fail
// silently (return null) rather than risk showing something ungrounded.
//
// Uses the Claude API directly over fetch, no SDK dependency -- same
// choice lib/analytics-server.ts made for its one Amplitude call type.

import type { RankedProvidersResult } from "./corridors";
import type { RateAnomaly } from "./fx";
import { money, percent, rate as formatRate } from "./format";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
// Small, fast, cheap model -- these are 1-2 sentence narrations of numbers
// that are already fully computed, not an open-ended reasoning task, so
// there's no reason to reach for a larger model here.
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 200;
const REQUEST_TIMEOUT_MS = 8000;

// In-memory, per-serverless-instance cache, keyed by corridor+tier+date
// (pick explainer) or currency-pair+date (anomaly explanation). Same
// best-effort tradeoff already made twice in this codebase --
// lib/fx.ts's lastKnownGood and lib/rate-limit.ts's hits map: resets on
// cold start, not shared across concurrent instances, good enough to keep
// this to roughly one real LLM call per corridor+tier per day rather than
// one per page view. Do not replace with a second caching mechanism --
// this mirrors the pattern already established for rate data.
const pickExplainerCache = new Map<string, string>();
const anomalyExplanationCache = new Map<string, string>();

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Every prompt below ends with this. It is the single most important
// sentence in this file.
const NO_INVENT_RULE =
  "Rules: only use figures that appear verbatim in the DATA block below -- " +
  "use the exact pre-formatted numbers given, don't recompute, round, or " +
  "reformat them yourself. Never state a number, percentage, or dollar " +
  "amount that is not given in DATA. If you can't support a specific " +
  "figure from DATA, describe it in plain qualitative terms instead of " +
  "guessing. Don't mention these rules or that you're an AI in your reply.";

async function callClaude(prompt: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null; // not configured -- silent no-op, same pattern as analytics-server.ts

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error(
        "Anthropic API error",
        res.status,
        await res.text().catch(() => "")
      );
      return null;
    }

    const data: unknown = await res.json();
    const text = (
      data as { content?: { type?: string; text?: string }[] }
    )?.content?.find((block) => typeof block?.text === "string")?.text;
    return typeof text === "string" && text.trim() ? text.trim() : null;
  } catch (err) {
    // Network error, timeout, or abort -- fail gracefully. The page must
    // show the plain numbers with no narration rather than break.
    console.error("Anthropic API request failed", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// "Why this pick" explainer: 1-2 sentences on why the top-ranked provider
// beats the runner-up, grounded only in their already-computed cost
// figures (see lib/corridors.ts's getRankedProviders) plus whatever
// fee/rate detail their own sourcing notes happen to document.
export async function getPickExplainer(
  corridorId: string,
  tier: string,
  result: RankedProvidersResult,
  receiveCurrency: string
): Promise<string | null> {
  const top = result.providers.find((p) => p.rank === 1);
  const runnerUp = result.providers.find((p) => p.rank === 2);
  if (!top || !runnerUp) return null; // nothing to compare a single provider against

  const cacheKey = `${corridorId}|${tier}|${today()}`;
  const cached = pickExplainerCache.get(cacheKey);
  if (cached) return cached;

  // costPercent is ascending by rank, so this is always >= 0 for the same
  // sendAmount -- see getRankedProviders, where costPercent is a strictly
  // decreasing function of amountReceived for a fixed sendAmount/liveRate.
  const dollarDelta = top.amountReceived - runnerUp.amountReceived;
  const costPercentDelta = runnerUp.costPercent - top.costPercent;

  const prompt = `You write a short, plain-English explanation for a remittance comparison website. ${NO_INVENT_RULE}

DATA:
- Top pick: ${top.provider}. Receives ${money(receiveCurrency, top.amountReceived)}. Cost ${percent(top.costPercent)} vs. the live mid-market rate. Sourcing notes: "${top.source}"
- Runner-up: ${runnerUp.provider}. Receives ${money(receiveCurrency, runnerUp.amountReceived)}. Cost ${percent(runnerUp.costPercent)} vs. the live mid-market rate. Sourcing notes: "${runnerUp.source}"
- Difference: ${top.provider} delivers ${money(receiveCurrency, dollarDelta)} more than ${runnerUp.provider} for the same amount sent -- a ${percent(costPercentDelta)} lower cost.

Write exactly 1-2 sentences explaining why ${top.provider} beats ${runnerUp.provider}, for a reader with no finance background. You may reference a specific fee or exchange-rate figure ONLY if one is stated plainly in the sourcing notes above -- if the notes don't give a clean fee/rate breakdown, explain the difference using only the cost percentage and dollar amounts given.`;

  const text = await callClaude(prompt);
  if (text) pickExplainerCache.set(cacheKey, text);
  return text;
}

// Anomaly explanation: fires only when getMidMarketRate has actually
// rejected a suspect swing (result.rateAnomaly present) -- turns that
// event's real numbers into a plain-English sentence instead of the
// generic "not live right now" banner alone.
export async function getAnomalyExplanation(
  currencyPairKey: string,
  anomaly: RateAnomaly
): Promise<string | null> {
  const cacheKey = `${currencyPairKey}|${today()}`;
  const cached = anomalyExplanationCache.get(cacheKey);
  if (cached) return cached;

  const prompt = `You write a short, plain-English explanation for a remittance comparison website's rate-integrity guard. ${NO_INVENT_RULE}

DATA:
- Currency pair: ${currencyPairKey}
- Previously trusted rate: ${formatRate(anomaly.previousRate)} (as of ${anomaly.previousAsOf})
- New reading just fetched: ${formatRate(anomaly.rejectedRate)} (as of ${anomaly.rejectedAsOf})
- Swing: ${anomaly.swingPercent.toFixed(1)}%
- Current handling: the new reading was rejected as a possible bad snapshot rather than a real market move; the site is showing the previously trusted rate instead, marked as not live, until a second independent fetch confirms the new level.

Write exactly 1-2 sentences telling a curious visitor what happened and why the rate shown right now might not be perfectly live. Plain English -- no internal jargon like "swing guard" or "pending candidate."`;

  const text = await callClaude(prompt);
  if (text) anomalyExplanationCache.set(cacheKey, text);
  return text;
}
