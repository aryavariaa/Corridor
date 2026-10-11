import type { Metadata } from "next";

// Share and canonical metadata for a page, in one place.
//
// Why this exists: a page that sets its own `openGraph` or `twitter` replaces
// the layout's, including the share image the layout gets from
// app/opengraph-image.tsx. The corridor and head-to-head pages did exactly
// that, so shared links had `twitter:card = summary_large_image` and no image
// (verified on the live HTML, 2026-10-11). Building the whole block here, image
// included, means a page can't set a title and silently lose the picture.
//
// `path` is the page's own path ("/compare/US/IN"). It becomes the canonical
// URL, og:url, and (via metadataBase in app/layout.tsx) is resolved to an
// absolute URL. The canonical matters because the same page is also served at
// ?amount=... and on every Vercel alias; search engines are told which one counts.
export const SHARE_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: "Corridor: compare real remittance costs" };

export function shareMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Pick<Metadata, "alternates" | "openGraph" | "twitter"> {
  return {
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: "Corridor", title, description, url: path, images: [SHARE_IMAGE] },
    twitter: { card: "summary_large_image", title, description, images: [SHARE_IMAGE.url] },
  };
}
