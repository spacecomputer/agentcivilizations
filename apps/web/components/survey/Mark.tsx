"use client";
import type { Category, CivilizationStatus } from "@agent-civilizations/schema";
import { Glyph } from "@/components/Glyph";

// The stamped mark. A disc in the category ink — filled when the file
// holds confirmed entries, hollow when it holds candidates only, dashed
// when dormant or extinct — with the §7 rail glyph cut into it: ground
// colour on a filled disc, ink on a hollow one. Category therefore has
// its second channel on the plate itself; the key beside the plate is
// the third.
//
// Below r = 10 the glyph is drawn single-stroke regardless of confidence
// so it never smears; fill carries confidence at every size.

export function Mark({
  cx,
  cy,
  r,
  category,
  confirmed,
  status,
  filtered = false,
}: {
  cx: number;
  cy: number;
  r: number;
  category: Category;
  confirmed: boolean;
  status: CivilizationStatus;
  filtered?: boolean;
}) {
  const ink = filtered ? "var(--ink-dim)" : `var(--cat-${category})`;
  const filledDisc = confirmed && !filtered;
  const g = Math.max(10, Math.round(r * 1.15));
  const dashed = filtered || status !== "active";
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={filledDisc ? ink : "var(--ground)"}
        stroke={ink}
        strokeWidth={filtered ? 1 : 1.4}
        strokeDasharray={dashed ? (filtered ? "2 2" : "3 2") : undefined}
      />
      <Glyph
        category={category}
        filled={filledDisc && r >= 10}
        size={g}
        ink={filledDisc ? "var(--ground)" : ink}
        x={cx - g / 2}
        y={cy - g / 2}
      />
    </g>
  );
}
