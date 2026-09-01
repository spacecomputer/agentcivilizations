"use client";
// The activity strip — the last 90 days as spikes colored by category ink,
// daily root seals as bronze ticks beneath the baseline. Homepage only,
// never chrome. Static once drawn; each day is a link target.
import { useEffect, useState } from "react";
import { recentEvents, allRoots } from "@/lib/queries";
import { utcDay } from "@/lib/format";
import type { Category } from "@agent-civilizations/schema";

const DAYS = 90;
const CATS: Category[] = ["coordination", "security", "community", "speculative"];

interface DayBucket {
  day: string;
  counts: Record<Category, number>;
  sealed: boolean;
}

export function ActivityStrip() {
  const [buckets, setBuckets] = useState<DayBucket[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [events, roots] = await Promise.all([
          recentEvents(500),
          allRoots(),
        ]);
        if (cancelled) return;
        const sealedDays = new Set(roots.map((r) => r.id));
        const today = new Date();
        const out: DayBucket[] = [];
        for (let i = DAYS - 1; i >= 0; i--) {
          const d = new Date(today.getTime() - i * 86400_000);
          const day = d.toISOString().slice(0, 10);
          out.push({
            day,
            counts: { coordination: 0, security: 0, community: 0, speculative: 0 },
            sealed: sealedDays.has(day),
          });
        }
        const index = new Map(out.map((b) => [b.day, b]));
        for (const e of events) {
          const b = index.get(utcDay(e.recordedAt));
          if (b) b.counts[e.category]++;
        }
        setBuckets(out);
      } catch {
        if (!cancelled) setBuckets([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!buckets || buckets.length === 0) return null;

  const max = Math.max(
    1,
    ...buckets.map((b) => CATS.reduce((s, c) => s + b.counts[c], 0)),
  );
  const W = 900;
  const H = 96;
  const baseline = 78;
  const slot = W / DAYS;
  const barW = Math.max(2, slot - 2);

  return (
    <figure className="activity-strip">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Event activity over the last ${DAYS} days`}
        preserveAspectRatio="none"
      >
        <line
          x1="0"
          y1={baseline}
          x2={W}
          y2={baseline}
          stroke="var(--rule)"
          strokeWidth="1"
        />
        {buckets.map((b, i) => {
          const total = CATS.reduce((s, c) => s + b.counts[c], 0);
          const x = i * slot;
          let y = baseline;
          const segments = CATS.filter((c) => b.counts[c] > 0).map((c) => {
            const h = Math.max(2, (b.counts[c] / max) * (baseline - 8));
            y -= h;
            return (
              <rect
                key={c}
                x={x}
                y={y}
                width={barW}
                height={h}
                fill={`var(--cat-${c})`}
              />
            );
          });
          return (
            <a
              key={b.day}
              href={`/?until=${b.day}`}
              aria-label={`${b.day}: ${total} ${total === 1 ? "event" : "events"}${b.sealed ? ", sealed" : ""}`}
            >
              {segments}
              {b.sealed && (
                <rect
                  x={x}
                  y={baseline + 4}
                  width={barW}
                  height={5}
                  fill="var(--seal)"
                />
              )}
            </a>
          );
        })}
      </svg>
      <figcaption className="mono dim">
        LAST {DAYS} DAYS · SPIKES BY CATEGORY · BRONZE TICKS MARK SEALED ROOTS
      </figcaption>
    </figure>
  );
}
