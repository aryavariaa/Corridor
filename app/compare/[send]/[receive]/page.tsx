import type { Metadata } from "next";
import Link from "next/link";
import { corridorId, findCorridor, getRankedProviders, listCorridors } from "@/lib/corridors";
import { getPickExplainer, getAnomalyExplanation, getCostAnomalyExplanation } from "@/lib/ai";
import CorridorComparison from "./CorridorComparison";

// Only the pairs we actually have researched provider data for are
// pre-built at build time / on each ISR revalidation. Any other
// (send, receive) pair still resolves (dynamicParams defaults to true)
// but renders the "not available yet" state below, marked noindex via
// generateMetadata -- see docs/provider-data-sourcing.md for how new
// corridors get added to this list.
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
      title: "Corridor not available — Corridor",
      robots: { index: false, follow: false },
    };
  }

  const title = `${corridor.sendCountryName} to ${corridor.receiveCountryName} — Compare remittance providers`;
  const description = `Compare ${corridor.sendCountryName} to ${corridor.receiveCountryName} remittance providers by what you actually receive after fees and FX margin, ranked cheapest first.`;

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

  if (!corridor) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-12">
        <Link href="/" className="text-sm text-link hover:underline">
          ← Back to corridor picker
        </Link>
        <h1 className="font-heading mt-6 text-2xl font-bold tracking-tight">
          We don&rsquo;t have this corridor yet
        </h1>
        <p className="mt-2 text-sm text-text-dim">
          We haven&rsquo;t researched real provider rates for{" "}
          <strong>{send}</strong> → <strong>{receive}</strong> yet. Pick one
          of the corridors we do have data for.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-contrast hover:opacity-90"
        >
          Back to the corridor picker
        </Link>
      </main>
    );
  }

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
      <main className="mx-auto w-full max-w-3xl px-6 py-12">
        <Link href="/" className="text-sm text-link hover:underline">
          ← Back to corridor picker
        </Link>
        <h1 className="font-heading mt-4 text-2xl font-bold tracking-tight">
          {corridor.sendCountryName} to {corridor.receiveCountryName}
        </h1>
        <div
          role="alert"
          className="mt-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          We couldn&rsquo;t reach the live rate feed just now. Try refreshing
          in a moment.
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
