"use client";
import { useLayoutEffect, useRef, useState } from "react";
import type { Bucket, Catalog } from "@/lib/catalog";
import { REGISTER_OPENED } from "@/lib/catalog";
import { CAPTION_CH } from "@/lib/survey-layout";

// Two clocks, two plates, never one chart.
//
// The left plate counts files by when their first entry OCCURRED, and
// reaches back years. The right counts them by the day the register
// RECORDED them, and is as old as the register. Merging them would
// produce the chart every dashboard draws and no honest register should:
// a curve whose steepest climb is the moment the instrument was switched
// on. The register's opening is therefore drawn into the left plate as a
// boundary, with the two regions named, so a reader can see which part of
// the shape is the world and which part is us.
//
// Each plate measures its OWN box. Sizing them from the shared wrapper
// and trusting flex to divide it the same way does not hold: flex split
// the row evenly while the arithmetic assumed 62/38, and the wider plate
// drew 158px past its own figure and straight through its neighbour.

const H = 88;
const PAD_TOP = 12;
const BASE = H - 16;

function useMeasuredWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setW(Math.floor(el.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function Bars({
  buckets,
  width,
  markIndex,
  labelEvery,
}: {
  buckets: Bucket[];
  width: number;
  markIndex?: number;
  labelEvery?: number;
}) {
  if (!buckets.length || width <= 0) return null;
  const max = Math.max(1, ...buckets.map((b) => b.n));
  const slot = width / buckets.length;
  const bar = Math.max(1, Math.min(slot - 1, 14));
  // Height is the SQUARE ROOT of the count, stated in the caption. On a
  // linear scale one month of 89 files flattened eight years into a rule:
  // the median month drew two pixels. The root keeps the order exact and
  // the small counts legible, and it is a transformation, so it is named.
  const h = (n: number) => (n === 0 ? 0 : Math.max(2, (BASE - PAD_TOP) * Math.sqrt(n / max)));
  // Label every Nth bucket, N derived from what the label actually
  // measures: mono caps at CAPTION_CH per character plus a gap. Guessing
  // 40px put 57px labels 41px apart and every one of them collided.
  const labelPx = (buckets[0]?.label.length ?? 5) * CAPTION_CH + 10;
  const every = Math.max(labelEvery ?? 1, Math.ceil(labelPx / slot));
  return (
    <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} className="clock-plate" aria-hidden="true">
      <line x1={0} y1={BASE} x2={width} y2={BASE} stroke="var(--rule)" strokeWidth={1} />
      {buckets.map((b, i) => {
        const bh = h(b.n);
        const x = i * slot + (slot - bar) / 2;
        return bh === 0 ? null : (
          <rect key={b.key} x={x} y={BASE - bh} width={bar} height={bh} fill="var(--ink)" />
        );
      })}
      {typeof markIndex === "number" && markIndex >= 0 && (
        <line
          x1={markIndex * slot}
          y1={2}
          x2={markIndex * slot}
          y2={BASE}
          stroke="var(--ink)"
          strokeWidth={1}
          strokeDasharray="3 2"
        />
      )}
      {buckets.map((b, i) =>
        i % every === 0 ? (
          <text key={`l:${b.key}`} x={i * slot + slot / 2} y={H - 3} textAnchor="middle" className="plate-caption">
            {b.label}
          </text>
        ) : null,
      )}
    </svg>
  );
}

export function ClockPlates({ catalog }: { catalog: Catalog }) {
  const [covRef, covW] = useMeasuredWidth();
  const [intRef, intW] = useMeasuredWidth();
  const before = catalog.coverage.slice(0, Math.max(0, catalog.registerOpenedIndex)).reduce((n, b) => n + b.n, 0);
  const after = catalog.counts.files - before;
  return (
    <div className="clock-plates">
      <figure className="clock-figure clock-figure--wide">
        <figcaption className="mono dim">
          FILES BY WHEN THEIR FIRST ENTRY OCCURRED · {catalog.coverage[0]?.key} TO{" "}
          {catalog.coverage[catalog.coverage.length - 1]?.key} · {catalog.counts.files} FILES ·
          HEIGHT IS THE SQUARE ROOT OF THE COUNT, TALLEST{" "}
          {Math.max(...catalog.coverage.map((b) => b.n))}
        </figcaption>
        <div ref={covRef} className="clock-canvas">
          <Bars buckets={catalog.coverage} width={covW} markIndex={catalog.registerOpenedIndex} />
        </div>
        <p className="clock-note">
          <span className="mono">{before}</span> of these files are reconstructed from
          reporting, their first entry having occurred before the register opened on{" "}
          <span className="mono">{REGISTER_OPENED}</span> (the dashed rule).{" "}
          <span className="mono">{after}</span> were observed as they happened. The
          climb at the right is therefore partly the world and partly the scanner
          switching on, and this plate cannot tell you the proportion.
        </p>
      </figure>
      <figure className="clock-figure clock-figure--narrow">
        <figcaption className="mono dim">
          FILES BY THE DAY THE REGISTER OPENED THEM · {catalog.intake.length} DAYS ·
          SAME SCALE RULE, TALLEST {Math.max(...catalog.intake.map((b) => b.n), 0)}
        </figcaption>
        <div ref={intRef} className="clock-canvas">
          <Bars buckets={catalog.intake} width={intW} />
        </div>
        <p className="clock-note">
          The register&apos;s own intake. The first day carries the backlog it found
          on switching on; the tail is its steady rate. Growth can only be measured
          across a stretch where this plate is flat.
        </p>
      </figure>
    </div>
  );
}
