"use client";
import type { Axis, CatalogRow } from "@/lib/catalog";

// One file's span in occurrence time, drawn on the axis shared by every
// row, so the column reads down the page as a census of when agent
// activity actually happened.
//
// A file that opened and closed on one day is a dot, not a bar of some
// minimum width: 179 of 292 files are single-day, and inflating them
// would invent duration the record does not claim. An extinct file is
// ruled off with a terminal stroke, which is what the catalog says it
// does to them.

export const LIFELINE_W = 190;
export const LIFELINE_H = 18;

export function LifelineAxis({ axis }: { axis: Axis }) {
  return (
    <svg width={LIFELINE_W} height={LIFELINE_H} viewBox={`0 0 ${LIFELINE_W} ${LIFELINE_H}`} aria-hidden="true" className="lifeline-axis">
      <line x1={0} y1={LIFELINE_H - 5} x2={LIFELINE_W} y2={LIFELINE_H - 5} stroke="var(--rule)" strokeWidth={1} />
      {axis.ticks.map((t) => (
        <g key={t.label}>
          <line x1={t.at * LIFELINE_W} y1={LIFELINE_H - 8} x2={t.at * LIFELINE_W} y2={LIFELINE_H - 2} stroke="var(--rule)" strokeWidth={1} />
          <text x={t.at * LIFELINE_W} y={LIFELINE_H - 10} textAnchor="middle" className="plate-caption">
            {t.label.slice(2)}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function Lifeline({ row, axis }: { row: CatalogRow; axis: Axis }) {
  const x1 = axis.at(row.from) * LIFELINE_W;
  const x2 = axis.at(row.to) * LIFELINE_W;
  const y = LIFELINE_H / 2;
  const status = row.civ.status;
  const ink = status === "active" ? "var(--ink)" : "var(--ink-dim)";
  const point = x2 - x1 < 1.5;
  const label = `${row.from.slice(0, 10)} to ${row.to.slice(0, 10)}, ${
    row.spanDays === 0 ? "a single day" : `${row.spanDays} days`
  }, ${status}`;
  return (
    <svg
      width={LIFELINE_W}
      height={LIFELINE_H}
      viewBox={`0 0 ${LIFELINE_W} ${LIFELINE_H}`}
      className="lifeline"
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      {axis.ticks.map((t) => (
        <line
          key={t.label}
          x1={t.at * LIFELINE_W}
          y1={2}
          x2={t.at * LIFELINE_W}
          y2={LIFELINE_H - 2}
          stroke="var(--rule)"
          strokeWidth={0.75}
        />
      ))}
      {point ? (
        <circle cx={x1} cy={y} r={2.25} fill={ink} />
      ) : (
        <>
          <line x1={x1} y1={y} x2={x2} y2={y} stroke={ink} strokeWidth={2.25} strokeLinecap="butt" />
          <line x1={x1} y1={y - 3.5} x2={x1} y2={y + 3.5} stroke={ink} strokeWidth={1} />
        </>
      )}
      {/* Ruled off: the catalog's word for extinct, drawn. */}
      {status === "extinct" && (
        <line x1={x2} y1={y - 5} x2={x2} y2={y + 5} stroke="var(--ink)" strokeWidth={1.5} />
      )}
    </svg>
  );
}
