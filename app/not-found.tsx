import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <Link href="/" className="text-sm text-link hover:underline">
        &larr; Back to corridor picker
      </Link>
      <h1 className="font-heading mt-6 text-2xl font-bold tracking-tight">
        Page not found
      </h1>
      <p className="mt-2 text-sm text-text-dim">
        This page doesn&rsquo;t exist. If you followed a link to a corridor, we may
        not have researched it yet or may have discontinued it. Pick one of the
        corridors we do have data for.
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
