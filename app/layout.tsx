import type { Metadata } from "next";
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import SiteHeader from "./SiteHeader";
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
const siteDescription =
  "See what actually lands after fees and exchange-rate markup, across 58 corridors, ranked cheapest first.";

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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${jakarta.variable} h-full antialiased`}
    >
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
