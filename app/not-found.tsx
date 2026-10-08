import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="font-heading text-4xl font-extrabold leading-tight tracking-[-0.045em] text-brand sm:text-5xl">
        Page not found
      </h1>
      <p className="mt-4 max-w-xl text-lg leading-snug text-text-dim">
        This page doesn&rsquo;t exist. If you followed a link to a corridor, we may not have researched it yet or
        may have discontinued it. Pick one of the corridors we do have data for.
      </p>
      <Link href="/" className="btn-primary mt-8">
        Browse all corridors
      </Link>
    </main>
  );
}
