import { findCorridor } from "@/lib/corridors";
import { subscribeToCorridorAlerts } from "@/lib/buttondown";
import { isRateLimited } from "@/lib/rate-limit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  if (isRateLimited(ip)) {
    return Response.json(
      { error: "Too many requests — try again in a few minutes." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { email, corridorId, company } = (body ?? {}) as {
    email?: string;
    corridorId?: string;
    company?: string; // honeypot — real users never fill this
  };

  // Bots that fill every field trip the honeypot. Pretend success so they
  // don't learn to leave it blank, but never actually call Buttondown.
  if (company) {
    return Response.json({ ok: true });
  }

  if (!email || !EMAIL_RE.test(email)) {
    return Response.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  if (!corridorId) {
    return Response.json({ error: "Missing corridorId" }, { status: 400 });
  }

  const corridor = findCorridor(corridorId);
  if (!corridor) {
    return Response.json({ error: `Unknown corridor "${corridorId}"` }, { status: 400 });
  }

  const result = await subscribeToCorridorAlerts(email, corridor);

  if (!result.ok) {
    return Response.json({ error: result.message }, { status: result.status });
  }

  return Response.json({ ok: true });
}
