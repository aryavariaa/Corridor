import type { MetadataRoute } from "next";
import { listCorridors } from "@/lib/corridors";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://corridor-red.vercel.app";
  const lastModified = new Date();

  const corridorEntries: MetadataRoute.Sitemap = listCorridors().map((c) => ({
    url: `${base}/compare/${c.sendCountry}/${c.receiveCountry}`,
    lastModified,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  return [
    { url: base, lastModified, changeFrequency: "daily", priority: 1 },
    {
      url: `${base}/methodology`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    ...corridorEntries,
  ];
}
