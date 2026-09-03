import { ImageResponse } from "next/og";

export const alt = "Corridor — Compare remittance providers";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

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
          backgroundColor: "#0a0a0a",
          color: "#ffffff",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 14,
              backgroundColor: "#2563eb",
              display: "flex",
            }}
          />
          <div style={{ fontSize: 40, fontWeight: 700, display: "flex" }}>
            Corridor
          </div>
        </div>
        <div
          style={{
            fontSize: 56,
            fontWeight: 700,
            marginTop: 40,
            lineHeight: 1.15,
            display: "flex",
          }}
        >
          Compare remittance providers
        </div>
        <div
          style={{
            fontSize: 28,
            color: "#a1a1aa",
            marginTop: 24,
            maxWidth: 900,
            display: "flex",
          }}
        >
          See what you actually get after fees and FX markup — ranked
          cheapest first.
        </div>
      </div>
    ),
    { ...size }
  );
}
