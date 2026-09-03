import type { Category } from "@agent-civilizations/schema";

// The rail glyphs — the third encoding channel for category, alongside ink
// and the caps label. Confirmed renders filled; candidate renders hollow
// (the penciled entry). See docs/DESIGN.md §7.
export function Glyph({
  category,
  filled,
  size = 11,
  ink,
  x,
  y,
}: {
  category: Category;
  filled: boolean;
  size?: number;
  // Override the category ink — the ties plate stamps the glyph in ground
  // colour on a filled disc. Position props let the glyph sit inside
  // another SVG.
  ink?: string;
  x?: number;
  y?: number;
}) {
  const stroke = ink ?? `var(--cat-${category})`;
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 12 12",
    "aria-hidden": true as const,
    style: { flexShrink: 0 },
    ...(x !== undefined && { x }),
    ...(y !== undefined && { y }),
  };
  switch (category) {
    case "coordination":
      return (
        <svg {...common}>
          <path
            d="M6 1.5 L11 10.5 L1 10.5 Z"
            fill={filled ? stroke : "none"}
            stroke={stroke}
            strokeWidth="1.4"
          />
        </svg>
      );
    case "security":
      return (
        <svg {...common}>
          <path
            d={filled ? "M1 11 L11 1 M1 6 L6 1 M6 11 L11 6" : "M1 11 L11 1"}
            stroke={stroke}
            strokeWidth={filled ? 1.8 : 1.4}
            fill="none"
          />
        </svg>
      );
    case "community":
      return (
        <svg {...common}>
          {[
            [3.5, 3.5],
            [8.5, 5],
            [5, 8.5],
          ].map(([cx, cy]) => (
            <circle
              key={`${cx}-${cy}`}
              cx={cx}
              cy={cy}
              r="1.8"
              fill={filled ? stroke : "none"}
              stroke={filled ? "none" : stroke}
              strokeWidth="1.2"
            />
          ))}
        </svg>
      );
    case "speculative":
      return (
        <svg {...common}>
          <path
            d={filled ? "M1 6 h10" : "M1 6 h3 M6 6 h3"}
            stroke={stroke}
            strokeWidth={filled ? 3 : 1.6}
            fill="none"
          />
        </svg>
      );
  }
}

// The category label — a REQUIRED companion of the glyph wherever category
// appears; color is never the sole channel.
export function CategoryLabel({
  category,
  filled = true,
}: {
  category: Category;
  filled?: boolean;
}) {
  return (
    <span className={`cat-label ${category}`}>
      <span className="glyph">
        <Glyph category={category} filled={filled} />
      </span>
      {category.toUpperCase()}
    </span>
  );
}
