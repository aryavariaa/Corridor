import { findCorridor, getRankedProviders, corridorId, type Tier } from "@/lib/corridors";

const VALID_TIERS: Tier[] = ["Everyday", "Large"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sendCountry = searchParams.get("sendCountry");
  const receiveCountry = searchParams.get("receiveCountry");
  const tier = searchParams.get("tier");

  if (!sendCountry || !receiveCountry || !tier) {
    return Response.json(
      {
        error:
          "Missing required query params: sendCountry, receiveCountry, and tier",
      },
      { status: 400 }
    );
  }

  if (!VALID_TIERS.includes(tier as Tier)) {
    return Response.json(
      {
        error: `Invalid tier "${tier}". Expected one of: ${VALID_TIERS.join(
          ", "
        )}`,
      },
      { status: 400 }
    );
  }

  if (!findCorridor(sendCountry, receiveCountry)) {
    return Response.json(
      { error: `Unknown corridor "${corridorId({ sendCountry, receiveCountry })}"` },
      { status: 400 }
    );
  }

  try {
    const result = await getRankedProviders(
      sendCountry,
      receiveCountry,
      tier as Tier
    );
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // Upstream FX API failure — not our server's fault.
    return Response.json({ error: message }, { status: 502 });
  }
}
