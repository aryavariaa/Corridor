import { ImageResponse } from "next/og";

export const alt = "Corridor: compare real remittance costs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Same palette as app/globals.css: navy ground, the DARK-theme logo (white tile,
// navy arches, coral door) and white / pale-coral text. ImageResponse can't read
// CSS variables, so the hex values are repeated here, and the logo path data is
// a fixed copy of the one in app/Wordmark.tsx.
export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          backgroundColor: "#0a2540",
          color: "#ffffff",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg width="72" height="72" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="9" fill="#ffffff" />
            <path d="M5 28V16a11 11 0 0 1 22 0v12" fill="none" stroke="#0a2540" strokeWidth="2.4" strokeLinecap="round" />
            <path d="M10 28V16.5a6 6 0 0 1 12 0V28" fill="none" stroke="#0a2540" strokeWidth="2.4" strokeLinecap="round" />
            <path d="M14 28v-11a2 2 0 0 1 4 0v11Z" fill="#ff6b4a" />
          </svg>
          <div style={{ fontSize: 48, fontWeight: 800, display: "flex", color: "#ffffff" }}>
            Corridor
          </div>
        </div>
        <div
          style={{
            fontSize: 68,
            fontWeight: 800,
            marginTop: 44,
            lineHeight: 1.08,
            display: "flex",
            color: "#ffffff",
            maxWidth: 980,
          }}
        >
          Compare real remittance costs between countries
        </div>
        <div
          style={{
            fontSize: 30,
            color: "#ffd9cc",
            marginTop: 28,
            maxWidth: 900,
            display: "flex",
          }}
        >
          See what actually lands after fees and exchange-rate markup, ranked
          cheapest first.
        </div>
      </div>
    ),
    { ...size }
  );
}
