"use client";

// Plausible is already loaded globally in app/layout.tsx, but only ever
// for automatic pageviews -- this adds the site's first custom (non-
// pageview) Plausible events. Kept in its own module rather than
// lib/analytics.ts, which is explicitly scoped to Amplitude funnel events
// only (see that file's own header comment) and isn't a general-purpose
// analytics wrapper.

declare global {
  interface Window {
    plausible?: (
      event: string,
      options?: { props?: Record<string, string | number | boolean> }
    ) => void;
  }
}

function track(
  event: string,
  props?: Record<string, string | number | boolean>
): void {
  if (typeof window === "undefined") return; // never touch this server-side
  if (typeof window.plausible !== "function") return; // script blocked/not loaded yet -- silent no-op
  window.plausible(event, props ? { props } : undefined);
}

// Both AI Rate Insights features (see lib/ai.ts) render inline/always-
// visible rather than behind an expand click, so these are page-level
// "shown" events, not "expanded" ones.

export function trackAiInsightShown(props: {
  corridorId: string;
  tier: string;
}): void {
  track("AI Insight Shown", { corridor_id: props.corridorId, tier: props.tier });
}

export function trackAnomalyExplanationShown(props: {
  corridorId: string;
  tier: string;
}): void {
  track("Anomaly Explanation Shown", {
    corridor_id: props.corridorId,
    tier: props.tier,
  });
}
