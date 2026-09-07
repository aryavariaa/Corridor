// Buttondown API client — rate-alert subscriptions per corridor.
// https://docs.buttondown.com/api-subscribers-create
//
// BUTTONDOWN_API_KEY must be set in the deployment environment (Vercel
// project env vars). It is never committed — see .env.example.

import { corridorId, type Corridor } from "@/lib/corridors";

const BUTTONDOWN_API_URL = "https://api.buttondown.com/v1/subscribers";

export type SubscribeResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

function corridorTag(corridor: Corridor): string {
  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `corridor-${slugify(corridor.sendCountryName)}-${slugify(
    corridor.receiveCountryName
  )}`;
}

export async function subscribeToCorridorAlerts(
  email: string,
  corridor: Corridor
): Promise<SubscribeResult> {
  const apiKey = process.env.BUTTONDOWN_API_KEY;

  if (!apiKey) {
    // Not a user-facing bug — the account exists but the key hasn't been
    // added to the deployment environment yet.
    return {
      ok: false,
      status: 503,
      message:
        "Rate alerts aren't accepting signups yet — check back soon.",
    };
  }

  const res = await fetch(BUTTONDOWN_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
      // Treat a resubscribe to the same corridor as a no-op success rather
      // than a 400, since the UI has no way to tell a first-time signup
      // from someone re-submitting.
      "X-Buttondown-Collision-Behavior": "no_op",
    },
    body: JSON.stringify({
      email_address: email,
      tags: [corridorTag(corridor)],
      metadata: {
        corridorId: corridorId(corridor),
        sourceCountry: corridor.sendCountryName,
        destCountry: corridor.receiveCountryName,
      },
      referrer_url: "https://corridor-red.vercel.app/",
    }),
  });

  if (res.ok) {
    return { ok: true };
  }

  let message = `Buttondown API error (${res.status})`;
  try {
    const body = await res.json();
    // 422s come back as { detail: [{ type, loc, msg }, ...] } (FastAPI-style
    // validation errors), not a plain string -- surface the actual reason
    // instead of losing it to the generic fallback.
    if (Array.isArray(body?.detail) && body.detail.length > 0) {
      message = body.detail
        .map((d: { msg?: string; loc?: unknown[] }) =>
          d?.msg ? `${d.msg}${d.loc ? ` (${d.loc.join(".")})` : ""}` : null
        )
        .filter(Boolean)
        .join("; ") || message;
    } else if (typeof body?.detail === "string") {
      message = body.detail;
    } else if (typeof body?.email_address?.[0] === "string") {
      message = body.email_address[0];
    }
    // Log the raw body server-side too, so Vercel's function logs have the
    // full picture even if our parsing above misses a shape we didn't
    // anticipate.
    console.error("Buttondown subscribe error", res.status, JSON.stringify(body));
  } catch {
    // Ignore body-parsing failures; fall back to the generic message.
  }

  return { ok: false, status: res.status, message };
}
