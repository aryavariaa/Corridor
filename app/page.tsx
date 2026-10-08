import { getRankedProviders, listCorridors } from "@/lib/corridors";
import { pickExample } from "@/lib/home-example";
import HomeDirectory, { type HomeExampleData } from "./HomeDirectory";

// The worked example on the homepage is computed here from the corridor's
// stored rows and live mid-market rate, so it can't go stale. The page is
// regenerated hourly (same window as the corridor pages); if the rate feed is
// down at that moment the example is simply left out.
export const revalidate = 3600;

const EXAMPLE_CORRIDOR = { send: "US", receive: "IN" } as const;

async function loadExample(): Promise<HomeExampleData | null> {
  try {
    const result = await getRankedProviders(EXAMPLE_CORRIDOR.send, EXAMPLE_CORRIDOR.receive, "Everyday");
    const picked = pickExample(result.providers);
    const corridor = listCorridors().find(
      (c) => c.sendCountry === EXAMPLE_CORRIDOR.send && c.receiveCountry === EXAMPLE_CORRIDOR.receive
    );
    if (!picked || !corridor) return null;
    return {
      sendCountry: corridor.sendCountry,
      receiveCountry: corridor.receiveCountry,
      sendCurrency: corridor.sendCurrency,
      receiveCurrency: corridor.receiveCurrency,
      sendCountryName: corridor.sendCountryName,
      receiveCountryName: corridor.receiveCountryName,
      sendAmount: picked.best.sendAmount,
      best: { provider: picked.best.provider, amountReceived: picked.best.amountReceived },
      others: picked.others.map((o) => ({ provider: o.provider, amountReceived: o.amountReceived })),
    };
  } catch {
    return null;
  }
}

export default async function Home() {
  return <HomeDirectory corridors={listCorridors()} example={await loadExample()} />;
}
