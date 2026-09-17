import { findCorridor, getRankedProviders, corridorId, type Tier } from "@/lib/corridors";
import { getPickExplainer, getAnomalyExplanation } from "@/lib/ai";

const VALID_TIERS: Tier[] = ["Everyday", "Large"];

// Mirrors app/api/compare/route.ts's shape and validation on purpose --
// this endpoint reuses that same ranking logic (getRankedProviders)
// rather than reimplementing it, and the client calls both routes with
// the same query params on every tier switch (see CorridorComparison.tsx).
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

  const corridor = findCorridor(sendCountry, receiveCountry);
  if (!corridor) {
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
    const id = corridorId({ sendCountry, receiveCountry });

    // Independent of each other -- a failure or missing API key on one
    // must never block the other, and neither should ever fail the
    // request itself (getPickExplainer/getAnomalyExplanation already fail
    // gracefully to null internally).
    const [insight, anomalyExplanation] = await Promise.all([
      getPickExplainer(id, tier, result, corridor.receiveCurrency),
      result.rateAnomaly
        ? getAnomalyExplanation(
            `${corridor.sendCurrency}->${corridor.receiveCurrency}`,
            result.rateAnomaly
          )
        : Promise.resolve(null),
    ]);

    return Response.json({ insight, anomalyExplanation });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // Upstream FX API failure — not our server's fault.
    return Response.json({ error: message }, { status: 502 });
  }
}
