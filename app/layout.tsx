import type { Metadata } from "next";
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import SiteHeader from "./SiteHeader";
import { listCorridors } from "@/lib/corridors";
import "./globals.css";

// Display face: wordmark, headings, big numbers. Bricolage Grotesque is a
// variable font with real weight up to 800, which is where its character is;
// it replaces Space Grotesk, which stopped at 700. See --font-heading in
// globals.css.
const bricolage = Bricolage_Grotesque({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

// Body copy, nav, labels, table cells. Plus Jakarta Sans is friendly and
// geometric, and (checked in the browser, not assumed) has true tabular
// figures, so columns of amounts line up. DM Sans, the first pick, did not:
// with tabular-nums on, "1111111111" was 125px and "0000000000" 274px.
// See --font-sans in globals.css.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const siteTitle = "Corridor: compare real remittance costs";
const siteDescription = `See what actually lands after fees and exchange-rate markup, across ${listCorridors().length} corridors, ranked cheapest first.`;

export const metadata: Metadata = {
  metadataBase: new URL("https://corridor-red.vercel.app"),
  title: siteTitle,
  description: siteDescription,
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: "/",
    siteName: "Corridor",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
  },
};

// Runs in <head> before first paint so there is never a flash of the wrong
// theme: stored choice (localStorage "theme"), else the OS preference. Pages
// stay static; the theme is applied in the browser, never read on the server.
// On the home page it also preloads the matching hero scene so the artwork
// doesn't pop in: the same file the CSS in globals.css picks (1x file up to 1440
// CSS px on a 1x display, 2880 on 2x or wider, 3840 on 2x above 1600 or anything
// above 2880), so the preload never fetches a file the page then doesn't use. Storage can throw (private windows, blocked site data), so
// every access is guarded and the page still renders.
const THEME_SCRIPT = `(function(){var d=document.documentElement,t=null;try{t=localStorage.getItem("theme")}catch(e){}if(t!=="light"&&t!=="dark"){try{t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}catch(e){t="light"}}d.setAttribute("data-theme",t);if(location.pathname==="/"){var w=innerWidth,r=devicePixelRatio||1,f=(r>=1.5&&w>1600)||w>2880?"-4k":(r>=1.5||w>1440)?"":"-1x";var l=document.createElement("link");l.rel="preload";l.as="image";l.href="/hero/scene-"+t+f+".webp";document.head.appendChild(l)}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${bricolage.variable} ${jakarta.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        {children}
        {/* Self-hosted Plausible CE (analytics.aryavaria.com), not plausible.io.
            Per-site script for corridor-red.vercel.app. Cookieless, so no
            consent banner is needed. The init stub queues lib/plausible.ts's
            custom events until the script has loaded. */}
        <Script
          src="https://analytics.aryavaria.com/js/pa-79IhktTzb7rHL6in8Yx-K.js"
          strategy="afterInteractive"
        />
        <Script id="plausible-init" strategy="afterInteractive">
          {`window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()`}
        </Script>
        <Analytics />
      </body>
    </html>
  );
}
