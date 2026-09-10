import { getDirectoryEntries } from "@/lib/corridors";
import HomeDirectory from "./HomeDirectory";

// Matches the FX rate's own cache window (lib/fx.ts fetches with
// { next: { revalidate: 3600 } }) -- same reasoning as the compare route:
// no point revalidating more often than the live rate itself can change.
// Directory cards show a live cheapest-cost teaser per corridor, so this
// page now does real data fetching instead of being purely static.
export const revalidate = 3600;

export default async function Home() {
  const entries = await getDirectoryEntries();
  return <HomeDirectory entries={entries} />;
}
