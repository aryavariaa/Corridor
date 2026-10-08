import { ImageResponse } from "next/og";

export const alt = "Corridor: compare real remittance costs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Same palette as app/globals.css: forest ground, lime accent, mint text.
// ImageResponse can't read CSS variables, so the hex values are repeated here.
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
          backgroundColor: "#163300",
          color: "#ffffff",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg width="72" height="72" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="9" fill="#9fe870" />
            <path d="M8 23c6 0 5-13 15-13" fill="none" stroke="#163300" strokeWidth="3.4" strokeLinecap="round" />
            <circle cx="8" cy="23" r="2.4" fill="#163300" />
            <circle cx="24" cy="10" r="3.4" fill="#163300" />
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
            color: "#9fe870",
            maxWidth: 980,
          }}
        >
          Compare real remittance costs across 58 corridors
        </div>
        <div
          style={{
            fontSize: 30,
            color: "#e2f6d5",
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
