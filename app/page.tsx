import { listCorridors } from "@/lib/corridors";
import HomeDirectory from "./HomeDirectory";

// Fully static: the directory no longer shows a live per-corridor teaser
// (that was the clutter, and it cost an FX fetch per corridor per render), so
// there is nothing here that changes between deploys but the corridor list.
export default function Home() {
  return <HomeDirectory corridors={listCorridors()} />;
}
