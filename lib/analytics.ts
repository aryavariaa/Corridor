"use client";

// Amplitude behavioral/funnel tracking, layered alongside Plausible
// (Plausible stays for pageviews — see app/layout.tsx). This module only
// ever runs in the browser and only sends events for the four funnel
// moments defined below; it is not a general-purpose analytics wrapper.
//
// Event names and property keys are kept stable and consistent
// (snake_case properties, a shared `corridor_id`) so the funnel
// Corridor Viewed -> Rate Alert Signup Started -> Rate Alert Signup
// Completed can be built directly in Amplitude's UI without renaming
// anything there first.

import * as amplitude from "@amplitude/analytics-browser";

let initialized = false;

function ensureInitialized(): boolean {
  if (initialized) return true;
  if (typeof window === "undefined") return false; // never touch this server-side

  const apiKey = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY;
  if (!apiKey) {
    // No key configured (e.g. local dev without the env var set) — every
    // track() call below becomes a silent no-op instead of throwing.
    return false;
  }

  amplitude.init(apiKey, {
    // We fire explicit funnel events only; page-load/session tracking is
    // Plausible's job already, so skip Amplitude's automatic page-view
    // and session-start events to avoid double-counting traffic.
    defaultTracking: false,
  });
  initialized = true;
  return true;
}

function track(eventName: string, properties?: Record<string, unknown>) {
  if (!ensureInitialized()) return;
  amplitude.track(eventName, properties);
}

type CorridorViewedProps = {
  corridorId: string;
  sendCountry: string;
  receiveCountry: string;
  sendCurrency: string;
  receiveCurrency: string;
  tier: string;
};

export function trackCorridorViewed(props: CorridorViewedProps): void {
  track("Corridor Viewed", {
    corridor_id: props.corridorId,
    send_country: props.sendCountry,
    receive_country: props.receiveCountry,
    send_currency: props.sendCurrency,
    receive_currency: props.receiveCurrency,
    tier: props.tier,
  });
}

export function trackSignupStarted(props: { corridorId: string }): void {
  track("Rate Alert Signup Started", { corridor_id: props.corridorId });
}

export function trackSignupCompleted(props: { corridorId: string }): void {
  track("Rate Alert Signup Completed", { corridor_id: props.corridorId });
}

export function trackSignupFailed(props: {
  corridorId: string;
  reason?: string;
}): void {
  track("Rate Alert Signup Failed", {
    corridor_id: props.corridorId,
    reason: props.reason ?? "unknown",
  });
}
