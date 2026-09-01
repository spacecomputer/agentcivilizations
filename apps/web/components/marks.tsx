// Small inline marks. The tick is an SVG glyph, never a unicode character —
// cross-platform consistency in the crest matters.
export function Tick({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 13 13"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M2 7 L5 10 L11 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function SealMark({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <circle
        cx="8"
        cy="8"
        r="6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path d="M5 8 h6 M8 5 v6" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
