"use client";

// Amplitude behavioral/funnel tracking, layered alongside Plausible
// (Plausible stays for pageviews — see app/layout.tsx). This module only
// ever runs in the browser and only covers the two top-of-funnel events
// below; it is not a general-purpose analytics wrapper.
//
// Rate Alert Signup Completed/Failed and the identify() call are NOT
// here anymore -- they fire from the server (lib/analytics-server.ts,
// used by app/api/subscribe/route.ts) so they only ever record a real,
// Buttondown-confirmed outcome. See docs/amplitude-tracking-plan.md.
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

// Used by app/page.tsx to hand the server (POST /api/subscribe) this
// browser's Amplitude device_id, so the server-fired Signup
// Completed/Failed event attaches to the same anonymous timeline as
// Corridor Viewed / Signup Started instead of starting a disconnected
// one. Returns undefined if Amplitude never initialized (no API key
// configured, or called before any track() call has run) -- the server
// treats a missing device_id as a documented edge case, not an error.
export function getDeviceId(): string | undefined {
  if (!ensureInitialized()) return undefined;
  return amplitude.getDeviceId();
}
