import { after } from "next/server";
import { findCorridor } from "@/lib/corridors";
import { subscribeToCorridorAlerts } from "@/lib/buttondown";
import { isRateLimited } from "@/lib/rate-limit";
import {
  trackSignupCompletedServer,
  trackSignupFailedServer,
} from "@/lib/analytics-server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  if (isRateLimited(ip)) {
    // No request body has been read yet at this point, so there's no
    // corridorId or deviceId to attach -- see analytics-server.ts's
    // no-op-without-an-id behavior.
    after(() =>
      trackSignupFailedServer({
        corridorId: null,
        reason: "rate_limited",
        statusCode: 429,
      })
    );
    return Response.json(
      { error: "Too many requests — try again in a few minutes." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    after(() =>
      trackSignupFailedServer({
        corridorId: null,
        reason: "invalid_json",
        statusCode: 400,
      })
    );
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { email, corridorId, company, deviceId } = (body ?? {}) as {
    email?: string;
    corridorId?: string;
    company?: string; // honeypot — real users never fill this
    deviceId?: string; // this browser's Amplitude device_id, if any
  };

  // Bots that fill every field trip the honeypot. Pretend success so they
  // don't learn to leave it blank, but never actually call Buttondown --
  // and never send anything to Amplitude either, so a bot can't inflate
  // or pollute the funnel in either direction.
  if (company) {
    return Response.json({ ok: true });
  }

  if (!email || !EMAIL_RE.test(email)) {
    after(() =>
      trackSignupFailedServer({
        corridorId: corridorId ?? null,
        reason: "invalid_email",
        statusCode: 400,
        deviceId,
      })
    );
    return Response.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  if (!corridorId) {
    after(() =>
      trackSignupFailedServer({
        corridorId: null,
        reason: "missing_corridor_id",
        statusCode: 400,
        deviceId,
      })
    );
    return Response.json({ error: "Missing corridorId" }, { status: 400 });
  }

  const corridor = findCorridor(corridorId);
  if (!corridor) {
    after(() =>
      trackSignupFailedServer({
        corridorId,
        reason: "unknown_corridor",
        statusCode: 400,
        deviceId,
      })
    );
    return Response.json({ error: `Unknown corridor "${corridorId}"` }, { status: 400 });
  }

  const result = await subscribeToCorridorAlerts(email, corridor);

  if (!result.ok) {
    after(() =>
      trackSignupFailedServer({
        corridorId,
        reason: "buttondown_error",
        statusCode: result.status,
        deviceId,
      })
    );
    return Response.json({ error: result.message }, { status: result.status });
  }

  // Only reachable once Buttondown has confirmed the subscription -- this
  // is the one and only place Rate Alert Signup Completed fires, and the
  // only place a user_id (hashed email) ever gets set in Amplitude.
  after(() => trackSignupCompletedServer({ corridorId, email, deviceId }));

  return Response.json({ ok: true });
}
