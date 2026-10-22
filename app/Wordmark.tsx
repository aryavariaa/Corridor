// The Corridor logo: a mark plus the name set in the display face.
//
// The mark ("Tunnel", chosen 2026-10-21) is two concentric arches with a door:
// a corridor you walk through to the other side. It is drawn, not typed. The
// tile and the arches take their colours from --logo-tile and --logo-arch
// (app/globals.css), so the mark inverts with the theme: navy tile and white
// arches in light, white tile and navy arches in dark. The door is coral in
// both. `Mark` is exported separately for places that want only the symbol.
// (app/icon.svg and app/opengraph-image.tsx carry their own fixed copies of
// the same path data, since neither can read CSS variables.)

export function Mark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect width="32" height="32" rx="9" style={{ fill: "var(--logo-tile)" }} />
      <path
        d="M5 28V16a11 11 0 0 1 22 0v12"
        fill="none"
        strokeWidth="2.4"
        strokeLinecap="round"
        style={{ stroke: "var(--logo-arch)" }}
      />
      <path
        d="M10 28V16.5a6 6 0 0 1 12 0V28"
        fill="none"
        strokeWidth="2.4"
        strokeLinecap="round"
        style={{ stroke: "var(--logo-arch)" }}
      />
      <path d="M14 28v-11a2 2 0 0 1 4 0v11Z" fill="#ff6b4a" />
    </svg>
  );
}

export default function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Mark size={30} />
      <span className="font-heading text-[1.6rem] font-extrabold leading-none tracking-[-0.04em] text-brand">
        Corridor
      </span>
    </span>
  );
}
