"use client";
import type { Cadence } from "@/lib/survey";

// Plate III — cadence. One row per file, one bar per week, sorted by
// last entry. Quiet stretches stay visibly empty: dormancy is legible
// in the plate's own body, the same honesty the thread spine keeps with
// its "no entries · 41 days" gaps.

const BAR_W = 14;
const GAP = 4;
const H = 28;

function monthLabel(iso: string, prev: string | null): string | null {
  const m = iso.slice(0, 7);
  if (prev && prev.slice(0, 7) === m) return null;
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
}

export function CadencePlate({ cadence }: { cadence: Cadence }) {
  const weeks = cadence.weekStarts.length;
  const W = weeks * (BAR_W + GAP) - GAP;
  const max = Math.max(1, cadence.max);

  return (
    <div>
      <div className="cadence-axis" aria-hidden="true">
        <span />
        <svg viewBox={`0 0 ${W} 16`} preserveAspectRatio="none" style={{ height: 16 }}>
          {cadence.weekStarts.map((ws, i) => {
            const label = monthLabel(ws, i > 0 ? cadence.weekStarts[i - 1] : null);
            return label ? (
              <text key={ws} x={i * (BAR_W + GAP)} y={12} className="plate-text">
                {label}
              </text>
            ) : null;
          })}
        </svg>
      </div>
      {cadence.rows.map((row) => (
        <div key={row.id} className={`cadence-row status-${row.status}`}>
          <a className="name rowlink" href={`/civilization/${encodeURIComponent(row.id)}`}>
            {row.name}
          </a>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`${row.name}: ${row.total} entries over ${weeks} weeks`}
          >
            <line x1={0} y1={H - 0.5} x2={W} y2={H - 0.5} stroke="var(--rule)" strokeWidth={1} />
            {row.buckets.map((v, i) => {
              if (v === 0) return null;
              const h = Math.max(2, Math.round((H - 2) * Math.sqrt(v / max)));
              return (
                <rect
                  key={i}
                  x={i * (BAR_W + GAP)}
                  y={H - 1 - h}
                  width={BAR_W}
                  height={h}
                  fill={`var(--cat-${row.category})`}
                >
                  <title>{`${cadence.weekStarts[i]}: ${v} ${v === 1 ? "entry" : "entries"}`}</title>
                </rect>
              );
            })}
          </svg>
        </div>
      ))}
    </div>
  );
}
