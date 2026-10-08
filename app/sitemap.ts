import type { MetadataRoute } from "next";
import { getCorridorProviders, listCorridors } from "@/lib/corridors";
import { pairSlug } from "@/lib/provider-slug";
import { allPairs } from "@/lib/versus";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://corridor-red.vercel.app";
  const lastModified = new Date();

  const corridorEntries: MetadataRoute.Sitemap = listCorridors().map((c) => ({
    url: `${base}/compare/${c.sendCountry}/${c.receiveCountry}`,
    lastModified,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  // One head-to-head page per pair of providers that both have data on a corridor.
  const pairEntries: MetadataRoute.Sitemap = listCorridors().flatMap((c) =>
    allPairs(getCorridorProviders(c.sendCountry, c.receiveCountry)).map(([a, b]) => ({
      url: `${base}/compare/${c.sendCountry}/${c.receiveCountry}/${pairSlug(a, b)}`,
      lastModified,
      changeFrequency: "daily" as const,
      priority: 0.6,
    }))
  );

  return [
    { url: base, lastModified, changeFrequency: "daily", priority: 1 },
    {
      url: `${base}/methodology`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    ...corridorEntries,
    ...pairEntries,
  ];
}
