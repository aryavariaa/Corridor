import Link from "next/link";
import Wordmark from "./Wordmark";

// Persistent top nav so a corridor page or the directory is never a dead
// end. Rendered once in app/layout.tsx, so every route gets it for free.
export default function SiteHeader() {
  return (
    <header className="border-b border-card-border bg-background">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-3.5">
        <Link href="/" aria-label="Corridor, home" className="rounded-md">
          <Wordmark />
        </Link>
        <nav className="flex items-center gap-1 text-sm font-medium text-text-dim sm:gap-2">
          <Link href="/" className="hidden rounded-full px-3 py-1.5 hover:bg-mint hover:text-brand sm:inline-block">
            Corridors
          </Link>
          <Link href="/methodology" className="rounded-full px-3 py-1.5 hover:bg-mint hover:text-brand">
            How it works
          </Link>
        </nav>
      </div>
    </header>
  );
}
