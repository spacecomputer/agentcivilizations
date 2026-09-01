import type { Category } from "@agent-civilizations/schema";

// Deterministic civilization seal: a small crest generated from the
// civilization id, drawn in its category ink. No asset pipeline — the id
// hash chooses the ring, the inner figure, and the radial strokes, so the
// same file always carries the same mark.
function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

export function CivSeal({
  id,
  category,
  size = 40,
}: {
  id: string;
  category: Category;
  size?: number;
}) {
  const h = djb2(id);
  const strokeCount = 4 + (h % 5); // 4–8 radial strokes
  const innerShape = (h >> 3) % 3; // 0 circle, 1 square, 2 triangle
  const rotation = (h >> 6) % 360;
  const innerR = 6 + ((h >> 9) % 4);
  const ink = `var(--cat-${category})`;

  const strokes = [];
  for (let i = 0; i < strokeCount; i++) {
    const angle = ((360 / strokeCount) * i + rotation) * (Math.PI / 180);
    const x1 = 22 + Math.cos(angle) * 13;
    const y1 = 22 + Math.sin(angle) * 13;
    const x2 = 22 + Math.cos(angle) * 19;
    const y2 = 22 + Math.sin(angle) * 19;
    strokes.push(
      <line
        key={i}
        x1={x1.toFixed(1)}
        y1={y1.toFixed(1)}
        x2={x2.toFixed(1)}
        y2={y2.toFixed(1)}
      />,
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <g stroke={ink} fill="none" strokeWidth="1.3">
        <circle cx="22" cy="22" r="19" />
        {innerShape === 0 && <circle cx="22" cy="22" r={innerR} />}
        {innerShape === 1 && (
          <rect
            x={22 - innerR}
            y={22 - innerR}
            width={innerR * 2}
            height={innerR * 2}
          />
        )}
        {innerShape === 2 && (
          <path
            d={`M22 ${22 - innerR} L${22 + innerR} ${22 + innerR * 0.8} L${22 - innerR} ${22 + innerR * 0.8} Z`}
          />
        )}
        {strokes}
      </g>
    </svg>
  );
}
