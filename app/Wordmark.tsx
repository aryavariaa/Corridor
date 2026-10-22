// The Corridor logo: a mark plus the name set in the display face.
//
// The mark is a route that bends and lands on a dot (the winning path, the
// idea the product is about), on an indigo tile, drawn in white with a pale-indigo start dot.
// It is drawn, not typed: text in a heading font is a name, not a logo.
// `Mark` is exported separately for places that want only the symbol.

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
      <rect width="32" height="32" rx="9" fill="#635bff" />
      {/* the route that wins */}
      <path
        d="M8 23c6 0 5-13 15-13"
        fill="none"
        stroke="#ffffff"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      {/* where it starts and where it lands */}
      <circle cx="8" cy="23" r="2.4" fill="#dad7ff" />
      <circle cx="24" cy="10" r="3.4" fill="#ffffff" />
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
