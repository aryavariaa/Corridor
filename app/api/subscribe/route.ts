import { findCorridor } from "@/lib/corridors";
import { subscribeToCorridorAlerts } from "@/lib/buttondown";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { email, corridorId } = (body ?? {}) as {
    email?: string;
    corridorId?: string;
  };

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
