import type { Metadata } from "next";
import { listCorridors } from "@/lib/corridors";
import HomeDirectory from "./HomeDirectory";

// The home page's share metadata comes from app/layout.tsx; this adds the
// canonical, so ?amount=... variants point back at "/".
export const metadata: Metadata = { alternates: { canonical: "/" } };

// Fully static: the page shows the headline and the compare form, nothing that
// changes between deploys but the corridor list.
export default function Home() {
  return <HomeDirectory corridors={listCorridors()} />;
}
