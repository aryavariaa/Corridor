import Link from "next/link";

export const metadata = {
  title: "How we calculate cost",
  description:
    "The methodology behind Corridor's Total Cost % — formula, data sources, and rate-integrity rules.",
};

export default function MethodologyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <Link
        href="/"
        className="text-sm text-link hover:underline"
      >
        ← Back to comparison
      </Link>

      <h1 className="font-heading mt-6 text-3xl sm:text-4xl font-bold tracking-tight">
        How we calculate cost
      </h1>

      <div className="mt-8 space-y-8">
        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold">What &ldquo;Total Cost %&rdquo; means</h2>
          <p className="text-sm leading-6 text-text-dim">
            The percentage of your money that fees and exchange-rate markup eat,
            compared to the true mid-market rate — the rate banks trade at with
            each other, the same one you&rsquo;d see on Google or xe.com.
            It&rsquo;s not what any single provider &ldquo;charges&rdquo; in
            isolation; it&rsquo;s the honest total gap between what you send and
            what actually lands.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold">The formula</h2>
          <p className="text-sm leading-6 text-text-dim">
            Total Cost % = 1 − (amount actually received ÷ amount you&rsquo;d
            receive at the true mid-market rate, with no fees).
          </p>
          <p className="text-sm leading-6 text-text-dim">
            This is the same methodology the World Bank&rsquo;s Remittance Prices
            Worldwide database uses — it&rsquo;s a standard, not something we
            invented to make the numbers look a certain way.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold">Where the numbers come from</h2>
          <p className="text-sm leading-6 text-text-dim">
            The mid-market exchange rate is pulled live, at the moment you
            search. Provider fees and markup are checked by hand, directly from
            each provider&rsquo;s own calculator, about once a week — that data
            isn&rsquo;t available through any public API, and building scrapers
            for six providers wasn&rsquo;t worth the tradeoff against a number
            that only needs to be a few days fresh. Every row shows the date it
            was last checked.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold">A note on rate integrity</h2>
          <p className="text-sm leading-6 text-text-dim">
            Several providers show a better &ldquo;first-time&rdquo; or
            &ldquo;welcome&rdquo; rate to new customers — a one-time promotional
            number, not what you&rsquo;d actually get on your second transfer or
            your tenth. We deliberately exclude those and use each
            provider&rsquo;s standard, repeat-customer rate. If a comparison tool
            used promotional rates, it would systematically favor whichever
            provider has the most aggressive new-user marketing, not whichever
            provider is actually cheapest to use.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold">
            Verified amounts vs. your own amount
          </h2>
          <p className="text-sm leading-6 text-text-dim">
            The two preset tiers (a small &ldquo;everyday&rdquo; send and a
            larger &ldquo;big&rdquo; send) are the amounts we actually
            verify: every provider&rsquo;s number there was checked against its
            own quote, and is dated. You can also enter your own amount, and
            what you see is labeled by how much we know. Wise, PayPal and
            Western Union are quoted live at exactly your amount. Every other
            provider has no live source, so its number is a straight-line
            estimate between the two amounts we verified and is tagged
            &ldquo;Estimated&rdquo;; a provider with only one verified amount
            is left out rather than guessed at. Custom amounts are limited to
            half the everyday amount up to three times the big amount, because
            beyond that fees stop scaling predictably. The AI explanation is
            only offered on the verified presets.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold">
            When a cost reads below zero
          </h2>
          <p className="text-sm leading-6 text-text-dim">
            No provider genuinely beats the mid-market rate, so a negative cost
            means something is off. Sometimes a provider&rsquo;s stored quote has
            gone stale. Sometimes it is only timing: our reference rate is
            published once a day, so a quote taken today can read a few tenths of
            a percent below a reference that is hours behind the market. We give
            that second case a small allowance (0.5%) only for live quotes and
            quotes verified today; anything older that reads negative is flagged
            as possibly stale, and a card never headlines a negative rate.
          </p>
        </section>
      </div>

      <div className="mt-10 border-t border-card-border pt-6">
        <Link
          href="/"
          className="text-sm text-link hover:underline"
        >
          ← Back to comparison
        </Link>
      </div>
    </main>
  );
}
