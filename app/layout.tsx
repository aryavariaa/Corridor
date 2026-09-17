import type { Metadata } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import SiteHeader from "./SiteHeader";
import "./globals.css";

// Headings, wordmark, provider names only -- see --font-heading in
// globals.css. Google Fonts only ships Space Grotesk in 300-700 (no
// 800); everywhere the design calls for "800" this uses 700, the
// heaviest weight actually available, rather than a weight that doesn't
// exist.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

// Body copy, nav, labels, table cells -- see --font-sans in globals.css.
const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const siteTitle = "Corridor — Compare remittance providers";
const siteDescription =
  "See what you actually get after fees and FX markup, ranked cheapest first, across Wise, Revolut, Remitly, Western Union, PayPal, and XE.";

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

// Runs before hydration (strategy="beforeInteractive" injects this into
// the initial HTML and executes it before the page becomes interactive)
// so [data-theme] is correct on the very first paint -- no flash of the
// wrong theme. Precedence: an explicit stored choice wins; otherwise
// respect the OS's light preference; otherwise default dark. Keep this
// logic in sync with app/ThemeToggle.tsx, which is the only other place
// that reads/writes the same "corridor-theme" localStorage key.
const THEME_INIT_SCRIPT = `
(function() {
  try {
    var stored = localStorage.getItem('corridor-theme');
    var theme = (stored === 'light' || stored === 'dark')
      ? stored
      : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${inter.variable} h-full antialiased`}
    >
      <head>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        {children}
        <Script
          src="https://plausible.io/js/pa-PCtf4L39GKoollvleHIhH.js"
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
