import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://corridor-red.vercel.app";
  const lastModified = new Date();
  return [
    { url: base, lastModified, changeFrequency: "daily", priority: 1 },
    {
      url: `${base}/methodology`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];
}
