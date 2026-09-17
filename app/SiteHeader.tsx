import Link from "next/link";
import ThemeToggle from "./ThemeToggle";

// Persistent top nav so a corridor page or the directory is never a dead
// end -- previously the only way back to the directory from a compare
// page was an in-content "<- Back to corridor picker" link, and there was
// no way to reach Methodology except from whichever page already linked
// it. Rendered once in app/layout.tsx, so every route gets it for free.
export default function SiteHeader() {
  return (
    <header className="border-b border-card-border">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="font-heading text-xl font-bold tracking-tight text-accent"
        >
          Corridor
        </Link>
        <nav className="flex items-center gap-2 text-sm text-text-dim sm:gap-4">
          {/* Redundant with the wordmark link at anything narrower than
              sm -- both go to "/" -- so it's the one nav item that can
              drop without losing a destination, keeping the header on
              one line instead of wrapping under the new toggle. */}
          <Link href="/" className="hidden hover:text-link sm:inline-block">
            Browse corridors
          </Link>
          <Link href="/methodology" className="hover:text-link">
            Methodology
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
