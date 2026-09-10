import Link from "next/link";

// Persistent top nav so a corridor page or the directory is never a dead
// end -- previously the only way back to the directory from a compare
// page was an in-content "<- Back to corridor picker" link, and there was
// no way to reach Methodology except from whichever page already linked
// it. Rendered once in app/layout.tsx, so every route gets it for free.
export default function SiteHeader() {
  return (
    <header className="border-b border-stone-200 dark:border-stone-800">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-accent"
        >
          Corridor
        </Link>
        <nav className="flex items-center gap-4 text-sm text-stone-600 dark:text-stone-400">
          <Link href="/" className="hover:text-accent">
            Browse corridors
          </Link>
          <Link href="/methodology" className="hover:text-accent">
            Methodology
          </Link>
        </nav>
      </div>
    </header>
  );
}
