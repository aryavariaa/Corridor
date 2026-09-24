import {
  CustomAmountRangeError,
  corridorId,
  customAmountRange,
  findCorridor,
  getCustomAmountRanking,
} from "@/lib/corridors";

// Ranking for an arbitrary send amount: live Wise/PayPal/Western Union
// quotes at exactly this amount, plus labeled estimates for every other
// provider (see getCustomAmountRanking). The two verified preset tiers keep
// using /api/compare and are unaffected.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sendCountry = searchParams.get("sendCountry");
  const receiveCountry = searchParams.get("receiveCountry");
  const amountParam = searchParams.get("amount");

  if (!sendCountry || !receiveCountry || !amountParam) {
    return Response.json(
      { error: "Missing required query params: sendCountry, receiveCountry, and amount" },
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

  const amount = Number(amountParam);
  const { min, max } = customAmountRange(corridor);
  if (!Number.isFinite(amount) || amount <= 0) {
    return Response.json({ error: "amount must be a positive number", min, max }, { status: 400 });
  }

  try {
    const result = await getCustomAmountRanking(sendCountry, receiveCountry, amount);
    return Response.json(result);
  } catch (err) {
    if (err instanceof CustomAmountRangeError) {
      return Response.json(
        {
          error: `Enter an amount between ${err.min} and ${err.max} ${corridor.sendCurrency}.`,
          min: err.min,
          max: err.max,
        },
        { status: 400 }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    // Upstream FX API failure (the live-quote call itself never throws --
    // it degrades to estimates), not our server's fault.
    return Response.json({ error: message }, { status: 502 });
  }
}
