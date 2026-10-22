"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";
import Wordmark from "./Wordmark";

// Persistent top nav so a corridor page or the directory is never a dead
// end. Rendered once in app/layout.tsx, so every route gets it for free.
//
// On the home page the header row is painted in the hero scene's top-of-sky
// colour (--hero-top) with no border, so it reads as part of the sky and the
// artwork starts directly beneath it (the scene's own small plane would
// otherwise sit behind the nav). Everywhere else it keeps the plain look.
export default function SiteHeader() {
  const onHome = usePathname() === "/";
  return (
    <header className={onHome ? "hero-header" : "border-b border-card-border bg-background"}>
      <div
        className={`mx-auto flex w-full items-center justify-between py-3.5 ${
          onHome ? "max-w-none px-6 lg:px-14" : "max-w-5xl px-6"
        }`}
      >
        <Link href="/" aria-label="Corridor, home" className="rounded-md">
          <Wordmark />
        </Link>
        <nav
          className={`flex items-center gap-1 text-sm font-medium sm:gap-2 ${
            // Full ink only over the hero sky: the dim colour is 3.99 on the day
            // sky, below the 4.5 needed for 14px text. Elsewhere it is as before.
            onHome ? "text-text" : "text-text-dim"
          }`}
        >
          <Link
            href="/methodology"
            className="inline-flex min-h-11 items-center rounded-full px-3 hover:bg-mint hover:text-brand"
          >
            How it works
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
