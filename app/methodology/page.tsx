import Link from "next/link";

export const metadata = {
  title: "How Corridor works",
  description:
    "How Corridor measures the real cost of sending money: the formula, where each number comes from, what Live means, and the checks that keep promotional rates out.",
};

function Section({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 space-y-3">
      <h2 className="font-heading text-xl font-extrabold tracking-[-0.03em] text-brand sm:text-2xl">{title}</h2>
      <div className="space-y-3 text-base leading-7 text-text-dim">{children}</div>
    </section>
  );
}

export default function MethodologyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 pb-20 pt-10">
      <Link href="/" className="inline-flex items-center gap-1 text-sm font-semibold text-link hover:underline">
        <span aria-hidden="true">←</span> All corridors
      </Link>

      <h1 className="mt-5 font-heading text-4xl font-extrabold leading-[1.02] tracking-[-0.045em] text-brand sm:text-5xl">
        How Corridor works
      </h1>
      <p className="mt-4 text-lg leading-snug text-text-dim">
        One question, answered the same way for every provider: of the money you send, how much
        actually arrives?
      </p>

      <div className="mt-10 space-y-10">
        <Section title="What “total cost” means">
          <p>
            The share of your money that fees and exchange-rate markup take, measured against the
            true mid-market rate: the rate banks trade at with each other, the one you see on
            Google or xe.com. It isn&rsquo;t what a provider says it charges. It&rsquo;s the whole gap
            between what you send and what lands.
          </p>
          <p className="rounded-2xl bg-mint px-4 py-3 font-semibold text-brand">
            Total cost % = 1 − (amount received ÷ amount you&rsquo;d receive at the mid-market rate,
            with no fees)
          </p>
          <p>
            It&rsquo;s the same method the World Bank&rsquo;s Remittance Prices Worldwide database
            uses, so it&rsquo;s a standard, not something invented to flatter any provider.
          </p>
        </Section>

        <Section title="Where the numbers come from">
          <p>
            <strong className="text-text">The mid-market rate</strong> comes from Frankfurter, a free
            service that publishes official central-bank rates. It is fetched live and cached for up
            to an hour. The rate chart on each corridor page uses the same source.
          </p>
          <p>
            <strong className="text-text">Wise, Western Union and PayPal</strong> are the three
            providers Corridor ranks, because they&rsquo;re the three that a real, public feed backs.
            Their quotes come from Wise&rsquo;s public comparison feed, refreshed automatically every
            day, and queried live for the exact amount you enter. Corridors where PayPal isn&rsquo;t in
            that feed use PayPal&rsquo;s own rate, entered by hand from Xoom (its money transfer
            service), and those rows show the date they were checked, because that date is the only
            sign of how old the number is.
          </p>
          <p>
            Other providers aren&rsquo;t shown. We&rsquo;d rather list three you can trust than
            ten we&rsquo;re guessing at; each comes back once we have a source we trust for it.
          </p>
        </Section>

        <Section title="What “Live” means">
          <p>
            The Live badge means the benchmark is live: the mid-market rate each quote is measured
            against was fetched just now. It does not mean every provider quote was fetched this
            second. Each row says which kind it is: a <em>Live quote</em> was fetched for your exact
            amount just now; a row with no tag was refreshed in the daily run; a row with a date was
            entered by hand on that date.
          </p>
        </Section>

        <Section title="Fee, rate and delivery">
          <p>
            Where a quote states its fee and exchange rate, we show them, but only when they
            reproduce the amount beside them (send amount minus fee, times rate, matches what
            arrives). If they don&rsquo;t, or the quote doesn&rsquo;t state them, the row says
            &ldquo;See provider&rdquo; rather than showing a number that contradicts the headline.
            Delivery time is shown only where a provider states one in the feed we use; right now
            that&rsquo;s Wise. We don&rsquo;t estimate delivery times.
          </p>
        </Section>

        <Section id="estimates" title="How your amount is priced">
          <p>
            You can enter any amount from 100 to 10,000 in the sending currency. Fees stop scaling
            predictably outside that range, so we show no number rather than guess. Wise, Western
            Union and PayPal are quoted live for exactly your amount wherever the feed carries them.
          </p>
          <p>
            Where a provider isn&rsquo;t in the feed for a corridor (a hand-entered PayPal rate), we
            draw a straight line between the two amounts we verified and tag the result{" "}
            <em>Estimated</em>. It&rsquo;s a reasonable read, not a checked quote, and a provider
            with only one verified amount is left out rather than guessed at.
          </p>
        </Section>

        <Section title="Promotional rates are kept out">
          <p>
            Many providers show a better &ldquo;first-time&rdquo; rate to new customers: a one-off
            promotion, not what you&rsquo;d get on your second transfer or your tenth. A comparison
            that used those would favor whoever markets hardest, not whoever is cheapest to use, so
            we use standard rates only.
          </p>
          <p>
            Because that kind of quote is easy to capture by accident, every hand-entered PayPal rate
            is checked against the mid-market rate for the day it was recorded. Any whose total cost is
            under 1% is flagged as a likely promotional quote and held for re-sourcing instead of
            being trusted, because real PayPal and Xoom costs run well above that.
          </p>
        </Section>

        <Section title="When a cost reads below zero">
          <p>
            No provider genuinely beats the mid-market rate, so a negative cost means something is
            off. Sometimes a stored quote has gone stale. Sometimes it&rsquo;s only timing: the
            reference rate is published once a day, so a quote taken today can read a few tenths of a
            percent below a reference that is hours behind the market. We allow 0.5% for that, only
            for live quotes and quotes verified today. Anything older that reads negative is flagged
            as possibly stale.
          </p>
        </Section>

        <Section title="What Corridor doesn’t do">
          <p>
            Corridor compares quotes. It doesn&rsquo;t move money. The Send buttons open the
            provider&rsquo;s own site in a new tab, and the rate and fees you&rsquo;re offered there
            may differ from what&rsquo;s shown here.
          </p>
        </Section>
      </div>

      <div className="mt-12 border-t border-card-border pt-6">
        <Link href="/" className="btn-primary">
          Compare a corridor
        </Link>
      </div>
    </main>
  );
}
