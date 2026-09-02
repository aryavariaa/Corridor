export type SupportedCurrency = "USD" | "GBP" | "EUR" | "AED";

type ERApiResponse = {
  result: string;
  base_code: string;
  rates: Record<string, number>;
};

export async function getMidMarketRate(
  base: SupportedCurrency,
  target: string
): Promise<{ rate: number; asOf: string }> {
  const res = await fetch(`https://open.er-api.com/v6/latest/${base}`, {
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    throw new Error(`FX API request failed: ${res.status}`);
  }

  const data: ERApiResponse = await res.json();

  if (data.result !== "success") {
    throw new Error("FX API returned an error result");
  }

  const rate = data.rates[target];
  if (!rate) {
    throw new Error(`No rate found for ${base} -> ${target}`);
  }

  return { rate, asOf: new Date().toISOString() };
}
