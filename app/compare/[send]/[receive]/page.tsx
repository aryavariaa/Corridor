import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { corridorId, findCorridor, getRankedProviders, listCorridors } from "@/lib/corridors";
import { getPickExplainer, getAnomalyExplanation, getCostAnomalyExplanation } from "@/lib/ai";
import { CountryFlag } from "@/lib/flags";
import { withArticle } from "@/lib/geo";
import CorridorComparison from "./CorridorComparison";

// Only the pairs in data/provider-data.json's corridors[] exist as pages.
// dynamicParams = false makes every other (send, receive) pair -- including a
// corridor that was later removed from the data file -- a real 404 instead of
// a rendered page, so removing a corridor needs no per-route cleanup: the next
// deploy's generateStaticParams simply no longer lists it. The page also
// calls notFound() below as a second layer. See docs/provider-data-sourcing.md
// for how corridors get added.
export const dynamicParams = false;

export async function generateStaticParams() {
  return listCorridors().map((c) => ({
    send: c.sendCountry,
    receive: c.receiveCountry,
  }));
}

// Matches the FX rate's own cache window (lib/fx.ts fetches with
// { next: { revalidate: 3600 } }) -- no point revalidating this page more
// often than the live rate itself can change.
export const revalidate = 3600;

type PageParams = { send: string; receive: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { send, receive } = await params;
  const corridor = findCorridor(send, receive);

  if (!corridor) {
    return {
      title: "Corridor not available",
      robots: { index: false, follow: false },
    };
  }

  const from = withArticle(corridor.sendCountryName);
  const title = `${from} to ${corridor.receiveCountryName}: compare real transfer costs`;
  const description = `Compare ${from} to ${corridor.receiveCountryName} remittance providers by what actually lands after fees and exchange-rate markup, ranked cheapest first.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `/compare/${send}/${receive}`,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ComparePage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { send, receive } = await params;
  const corridor = findCorridor(send, receive);

  if (!corridor) notFound();

  // Unlike /api/compare (which already wraps this in try/catch and returns
  // a 502), this is a Server Component render -- an uncaught throw here
  // (e.g. a cold instance whose live FX fetch fails with no cached
  // fallback yet, see lib/fx.ts) would otherwise crash the whole page
  // instead of degrading like the old client-side flow did.
  let initialResult;
  try {
    initialResult = await getRankedProviders(send, receive, "Everyday");
  } catch {
    return (
      <main className="mx-auto w-full max-w-4xl px-6 py-12">
        <Link href="/" className="inline-flex items-center gap-1 text-sm font-semibold text-link hover:underline">
          <span aria-hidden="true">←</span> All corridors
        </Link>
        <h1 className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 font-heading text-3xl font-extrabold tracking-[-0.04em] text-brand sm:text-5xl">
          <CountryFlag code={corridor.sendCountry} className="rounded-[3px]" />
          {withArticle(corridor.sendCountryName)} to
          <CountryFlag code={corridor.receiveCountry} className="rounded-[3px]" />
          {corridor.receiveCountryName}
        </h1>
        <div
          role="alert"
          className="mt-6 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          We couldn&rsquo;t reach the live rate feed just now. Try refreshing in a moment.
        </div>
      </main>
    );
  }

  // Computed alongside the ranking, server-side, so the first paint
  // already has the AI insight/anomaly text where available -- same
  // reasoning as computing initialResult here instead of only client-side.
  // Both fail gracefully to null internally (no ANTHROPIC_API_KEY, a
  // timeout, etc.) rather than throwing, so this never blocks the page.
  const id = corridorId(corridor);
  const [initialInsight, initialAnomalyExplanation, initialCostAnomalyExplanation] =
    await Promise.all([
      getPickExplainer(id, "Everyday", initialResult, corridor.receiveCurrency),
      initialResult.rateAnomaly
        ? getAnomalyExplanation(
            `${corridor.sendCurrency}->${corridor.receiveCurrency}`,
            initialResult.rateAnomaly
          )
        : Promise.resolve(null),
      initialResult.costAnomaly
        ? getCostAnomalyExplanation(id, "Everyday", initialResult.costAnomaly)
        : Promise.resolve(null),
    ]);

  return (
    <CorridorComparison
      corridor={corridor}
      initialResult={initialResult}
      initialInsight={initialInsight}
      initialAnomalyExplanation={initialAnomalyExplanation}
      initialCostAnomalyExplanation={initialCostAnomalyExplanation}
    />
  );
}
