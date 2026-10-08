import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  findCorridor,
  getCorridorProviders,
  getRankedProviders,
  listCorridors,
  type Corridor,
} from "@/lib/corridors";
import { allPairs, POPULAR_CORRIDORS, verdict } from "@/lib/versus";
import { pairSlug, parsePairSlug, providerFromSlug } from "@/lib/provider-slug";
import HeadToHead, { type OtherCorridor } from "./HeadToHead";
import { withArticle } from "@/lib/geo";

// One page per (corridor, pair of providers that both have data there). Every
// other combination, including a pair that exists on a different corridor, is
// a real 404 rather than an empty comparison.
export const dynamicParams = false;

// Same cache window as the corridor page and the FX rate itself.
export const revalidate = 3600;

type PageParams = { send: string; receive: string; pair: string };

export async function generateStaticParams() {
  return listCorridors().flatMap((c) =>
    allPairs(getCorridorProviders(c.sendCountry, c.receiveCountry)).map(([a, b]) => ({
      send: c.sendCountry,
      receive: c.receiveCountry,
      pair: pairSlug(a, b)!,
    }))
  );
}

function resolve({ send, receive, pair }: PageParams) {
  const corridor = findCorridor(send, receive);
  const slugs = parsePairSlug(pair);
  if (!corridor || !slugs) return null;
  const names = getCorridorProviders(send, receive);
  const a = providerFromSlug(slugs[0], names);
  const b = providerFromSlug(slugs[1], names);
  // Canonical order only (alphabetical), so each pair has exactly one URL.
  if (!a || !b || pairSlug(a, b) !== pair) return null;
  return { corridor, names, a, b };
}

const fromName = (c: Corridor) => withArticle(c.sendCountryName);

export async function generateMetadata({ params }: { params: Promise<PageParams> }): Promise<Metadata> {
  const found = resolve(await params);
  if (!found) return { title: "Comparison not available", robots: { index: false, follow: false } };
  const { corridor, a, b } = found;
  const title = `${a} vs ${b} to ${corridor.receiveCountryName}: who sends more?`;
  const description = `${a} against ${b} for ${fromName(corridor)} to ${corridor.receiveCountryName}: how much more one sends you, fee, exchange rate and delivery, side by side.`;
  return {
    title,
    description,
    openGraph: { title, description, url: `/compare/${corridor.sendCountry}/${corridor.receiveCountry}/${pairSlug(a, b)}` },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function HeadToHeadPage({ params }: { params: Promise<PageParams> }) {
  const found = resolve(await params);
  if (!found) notFound();
  const { corridor, names, a, b } = found;

  let initialResult;
  try {
    initialResult = await getRankedProviders(corridor.sendCountry, corridor.receiveCountry, "Everyday");
  } catch {
    notFound(); // the rate feed is down; the corridor page shows the error state
  }

  // How the same two providers compare on other popular corridors, at each
  // one's typical amount and its own live mid-market rate. Only corridors
  // where both providers have data; five at most.
  const candidates = POPULAR_CORRIDORS.filter(
    ([s, r]) =>
      !(s === corridor.sendCountry && r === corridor.receiveCountry) &&
      (() => {
        const have = getCorridorProviders(s, r);
        return have.includes(a) && have.includes(b);
      })()
  ).slice(0, 5);

  const others = (
    await Promise.all(
      candidates.map(async ([s, r]): Promise<OtherCorridor | null> => {
        const c = findCorridor(s, r);
        if (!c) return null;
        try {
          const res = await getRankedProviders(s, r, "Everyday");
          const ra = res.providers.find((p) => p.provider === a && !p.benchmarkReference);
          const rb = res.providers.find((p) => p.provider === b && !p.benchmarkReference);
          if (!ra || !rb) return null;
          return {
            corridor: c,
            sendAmount: ra.sendAmount,
            a: { amountReceived: ra.amountReceived },
            b: { amountReceived: rb.amountReceived },
            verdict: verdict(ra, rb),
          };
        } catch {
          return null; // one corridor's feed failing shouldn't take the page down
        }
      })
    )
  ).filter((x): x is OtherCorridor => x !== null);

  return (
    <HeadToHead
      corridor={corridor}
      providerNames={names}
      a={a}
      b={b}
      initialResult={initialResult}
      others={others}
    />
  );
}
