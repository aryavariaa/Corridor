// Server-side Amplitude tracking for the two events that must only ever
// fire after a real, Buttondown-confirmed outcome (see
// docs/amplitude-tracking-plan.md). Calls Amplitude's HTTP API v2
// directly over fetch -- no server SDK dependency needed for two events.
//
// Reuses the existing NEXT_PUBLIC_AMPLITUDE_API_KEY value. That's
// intentional, not a shortcut: Amplitude ingestion keys are meant to be
// public/embeddable (this exact key already ships in the client bundle),
// so there's no new secret to manage by reading it here too.

import { createHash } from "node:crypto";

const AMPLITUDE_HTTP_API_URL = "https://api2.amplitude.com/2/httpapi";

type ServerEventOptions = {
  eventType: string;
  deviceId?: string;
  userId?: string;
  eventProperties?: Record<string, unknown>;
};

async function sendAmplitudeEvent(options: ServerEventOptions): Promise<void> {
  const apiKey = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY;
  if (!apiKey) return; // no key configured -> silent no-op, same as the client

  // Every Amplitude event needs a device_id or a user_id to attach to
  // anything. If we have neither (e.g. the very earliest failure paths,
  // before the request body is even parsed), there's nothing useful to
  // send -- skip rather than firing an orphaned event.
  if (!options.deviceId && !options.userId) return;

  const event: Record<string, unknown> = {
    event_type: options.eventType,
    ...(options.deviceId ? { device_id: options.deviceId } : {}),
    ...(options.userId ? { user_id: options.userId } : {}),
    ...(options.eventProperties
      ? { event_properties: options.eventProperties }
      : {}),
  };

  try {
    const res = await fetch(AMPLITUDE_HTTP_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, events: [event] }),
    });
    if (!res.ok) {
      console.error(
        "Amplitude httpapi error",
        res.status,
        await res.text().catch(() => "")
      );
    }
  } catch (err) {
    // Analytics must never break the actual signup flow.
    console.error("Amplitude httpapi request failed", err);
  }
}

// Normalizes and hashes the email so the same person always resolves to
// the same user_id regardless of case or stray whitespace. The raw email
// never leaves this function -- only the hash goes to Amplitude.
function hashEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  return createHash("sha256").update(normalized).digest("hex");
}

export async function trackSignupCompletedServer(params: {
  corridorId: string;
  email: string;
  deviceId?: string;
}): Promise<void> {
  await sendAmplitudeEvent({
    eventType: "Rate Alert Signup Completed",
    deviceId: params.deviceId,
    userId: hashEmail(params.email),
    eventProperties: { corridor_id: params.corridorId },
  });
}

export async function trackSignupFailedServer(params: {
  corridorId?: string | null;
  reason: string;
  statusCode: number;
  deviceId?: string;
}): Promise<void> {
  await sendAmplitudeEvent({
    eventType: "Rate Alert Signup Failed",
    deviceId: params.deviceId,
    eventProperties: {
      corridor_id: params.corridorId ?? null,
      reason: params.reason,
      status_code: params.statusCode,
    },
  });
}
