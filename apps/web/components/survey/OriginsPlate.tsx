"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { geoGraticule10, geoInterpolate, geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import land110 from "world-atlas/land-110m.json";
import type { Category } from "@agent-civilizations/schema";
import type { OriginPair, OriginSeat, Origins, TieOnlySeat } from "@/lib/survey";
import {
  bandFor,
  displaceSeats,
  fmtLat,
  fmtLng,
  floorFiles,
  radiusScale,
  seatRadius,
  HAIRLINE_CAP_PER_SEAT,
  MIN_W,
  PAIR_CAPTION_MIN,
  TIE_STRONG_FILES,
  type Band,
} from "@/lib/origins-layout";
import { TIE_STROKE, LABEL_CH, CAPTION_CH, LABEL_LH, HIT_WIDTH, labelBudget } from "@/lib/survey-layout";
import { placeLabels, type Box } from "@/lib/labels";
import { CategoryLabel, Glyph } from "@/components/Glyph";
import { callNumber } from "@/lib/format";

// Plate I — origins. A survey sheet, not a bubble map. Files are placed
// at the seat of their party of record; a seat carries no category —
// marks are ink, fill is provenance (filled cited, hollow inferred, a
// dashed ring where the two mix), area is files under a printed floor.
// The frame is the register's occupied band, widened to every seat and
// tie and printed. Ties are counted relations, one geodesic per seat
// pair in three ruled weights. Every mark is an anchor with a voice: one
// tab stop, roving focus in table order, a reading line beneath. The
// canvas renders at one unit per CSS pixel, and the plate is laid out
// once from the whole surveyed ledger — filters restyle, never move.

export interface OriginLayoutInfo { band: Band; K: number; moved: number }

export type OriginReading =
  | { kind: "seat"; key: string }
  | { kind: "pair"; key: string }
  | null;

function regionName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function seatLine(s: OriginSeat): string {
  const top = s.parties.slice(0, 3).map((p) => `${p.name} ${p.files}`).join(", ");
  const rest = s.parties.length - 3;
  const cats = (Object.keys(s.categories) as Category[])
    .filter((k) => s.categories[k] > 0)
    .map((k) => `${k.toUpperCase()} ${s.categories[k]}`)
    .join(" · ");
  return `${s.name}, ${regionName(s.country)} · ${s.files} ${s.files === 1 ? "file" : "files"} at ${s.parties.length} ${s.parties.length === 1 ? "party" : "parties"} — ${top}${rest > 0 ? `, ${rest} others` : ""} · ${s.cited ? "CITED" : s.mixed ? "PARTLY INFERRED" : "INFERRED"} · ${cats} · ${s.pairKeys.length} ${s.pairKeys.length === 1 ? "tie" : "ties"}`;
}

export function seatSlug(key: string): string {
  return key.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

// ---- samples for the key on the leaf ----------------------------------
export function SeatSample({ cited, mixed = false }: { cited: boolean; mixed?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" style={{ verticalAlign: "-6px" }}>
      <circle cx="11" cy="11" r="7" fill={cited ? "var(--ink)" : "var(--ground)"} stroke={cited ? "var(--ground)" : "var(--ink)"} strokeWidth={cited ? 1 : 1.6} />
      {mixed && <circle cx="11" cy="11" r="9.5" fill="none" stroke="var(--ink)" strokeWidth="0.75" strokeDasharray="3 2" />}
    </svg>
  );
}
export function ReferenceCircles({ K, nMax }: { K: number; nMax: number }) {
  const steps = [1, 10, 100, 1000].filter((n) => n <= Math.max(nMax, 10));
  const rMax = seatRadius(steps[steps.length - 1], K);
  const w = Math.ceil(rMax * 2 + 8);
  const h = Math.ceil(rMax * 2 + 22);
  const base = rMax + 4;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" style={{ verticalAlign: "-8px" }}>
      {steps.map((n) => {
        const r = seatRadius(n, K);
        return <circle key={n} cx={w / 2} cy={base + rMax - r} r={r} fill="none" stroke="var(--ink)" strokeWidth={0.75} />;
      })}
      <text x={w / 2} y={h - 4} textAnchor="middle" className="plate-caption">
        {steps.join(" · ")}
      </text>
    </svg>
  );
}
export function OriginTieSample({ cls }: { cls: keyof typeof TIE_STROKE }) {
  const s = TIE_STROKE[cls];
  return (
    <svg width="34" height="10" viewBox="0 0 34 10" aria-hidden="true" style={{ verticalAlign: "-1px" }}>
      <path d="M1 7 Q17 -1 33 7" fill="none" stroke={s.stroke} strokeWidth={s.width} />
    </svg>
  );
}

function pairClass(n: number): keyof typeof TIE_STROKE {
  return n >= TIE_STRONG_FILES ? "strong" : n >= 2 ? "full" : "hairline";
}

// ------------------------------------------------------------------------

export function OriginsPlate({
  origins,
  kept,
  cats,
  hideFiltered,
  highlight,
  onReading,
  onLayout,
}: {
  origins: Origins;
  kept: Set<string>; // file ids matching the filter
  cats: Set<Category>; // categories in the filter (ink returns when exactly one)
  hideFiltered: boolean;
  highlight?: string | null; // seat key or pair key lit from the tables
  onReading?: (r: OriginReading) => void;
  onLayout?: (info: OriginLayoutInfo) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(960);
  const [active, setActive] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [reading, setReadingState] = useState<OriginReading>(null);
  const refs = useRef(new Map<string, HTMLAnchorElement>());

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => setWidth(Math.floor(el.clientWidth) || 960);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const W = Math.max(MIN_W, width);
  const K = radiusScale(origins.nMax);

  // ---- frame: the occupied band, widened to every seat and tie endpoint
  const band = useMemo(() => bandFor([...origins.seats, ...origins.tieOnly]), [origins]);

  const geo = useMemo(() => {
    const topo = land110 as unknown as Topology<{ land: GeometryCollection }>;
    const land = feature(topo, topo.objects.land);
    const bandFeature = {
      type: "Polygon" as const,
      coordinates: [[[band.w, band.s], [band.e, band.s], [band.e, band.n], [band.w, band.n], [band.w, band.s]]],
    };
    const projection = geoNaturalEarth1().rotate([-(band.w + band.e) / 2, 0]).fitWidth(W - 12, bandFeature);
    const path0 = geoPath(projection);
    const b = path0.bounds(bandFeature);
    const height = Math.ceil(b[1][1] - b[0][1]) + 12;
    const [tx, ty] = projection.translate();
    projection.translate([tx + (6 - b[0][0]), ty + (6 - b[0][1])]);
    projection.clipExtent([[6, 6], [W - 6, height - 6]]);
    const path = geoPath(projection);
    return {
      height,
      graticule: path(geoGraticule10()) ?? "",
      land: path(land) ?? "",
      project: (lng: number, lat: number) => projection([lng, lat]) ?? [NaN, NaN],
      path,
    };
  }, [W, band]);

  const seatBy = useMemo(() => new Map(origins.seats.map((s) => [s.key, s])), [origins]);
  const pairBy = useMemo(() => new Map(origins.pairs.map((p) => [p.key, p])), [origins]);

  // ---- marks
  const marks = useMemo(() => {
    const base = origins.seats
      .map((s) => {
        const [x, y] = geo.project(s.lng, s.lat);
        return { key: s.key, x, y, r: seatRadius(s.files, K) };
      })
      .filter((m) => Number.isFinite(m.x) && Number.isFinite(m.y));
    const byKey = new Map(displaceSeats(base).map((d) => [d.key, d]));
    return origins.seats.map((s) => {
      const d = byKey.get(s.key);
      const nKept = s.civs.filter((c) => kept.has(c.id)).length;
      return {
        s,
        x: d?.x ?? NaN,
        y: d?.y ?? NaN,
        x0: d?.x0 ?? NaN,
        y0: d?.y0 ?? NaN,
        r: seatRadius(s.files, K),
        moved: d?.moved ?? false,
        nKept,
      };
    });
  }, [origins, geo, K, kept]);
  const movedCount = marks.filter((m) => m.moved).length;
  useEffect(() => { onLayout?.({ band, K, moved: movedCount }); }, [band, K, movedCount, onLayout]);
  const visible = useMemo(
    () => new Set(marks.filter((m) => !hideFiltered || m.nKept > 0).map((m) => m.s.key)),
    [marks, hideFiltered],
  );
  const single: Category | null = cats.size === 1 ? [...cats][0] : null;

  // ---- ties: one geodesic per seat pair, beneath the marks
  const ties = useMemo(() => {
    const drawnAll = origins.pairs.map((p) => {
      const d = geo.path({ type: "LineString", coordinates: [[p.from.lng, p.from.lat], [p.to.lng, p.to.lat]] }) ?? "";
      const cls = pairClass(p.civs.length);
      const keptN = p.civs.filter((c) => kept.has(c.id)).length;
      const [mx, my] = geo.project(...(geoInterpolate([p.from.lng, p.from.lat], [p.to.lng, p.to.lat])(0.5) as [number, number]));
      return { p, d, cls, keptN, mx, my, visible: visible.has(p.from.key) && ("tieOnly" in p.to || visible.has(p.to.key)) };
    });
    const hair = drawnAll.filter((t) => t.cls === "hairline");
    const cap = HAIRLINE_CAP_PER_SEAT * Math.max(1, origins.seats.length);
    const hairlinesDrawn = hair.length <= cap;
    // obstacles for the placer: boxes sampled along each drawn arc
    const obstacles: Box[] = [];
    for (const t of drawnAll) {
      if (!t.visible || (t.cls === "hairline" && !hairlinesDrawn)) continue;
      const steps = 24;
      for (let i = 1; i < steps; i++) {
        const [lng, lat] = geoInterpolate([t.p.from.lng, t.p.from.lat], [t.p.to.lng, t.p.to.lat])(i / steps) as [number, number];
        const [x, y] = geo.project(lng, lat);
        if (Number.isFinite(x) && Number.isFinite(y)) obstacles.push({ x: x - 3, y: y - 3, w: 6, h: 6 });
      }
    }
    return { all: drawnAll, hairlinesDrawn, hairlinesHidden: hairlinesDrawn ? 0 : hair.length, obstacles };
  }, [origins, geo, kept, visible]);

  // ---- names and pair captions, placed without overprinting
  const labels = useMemo(() => {
    const budget = labelBudget(Math.max(60, marks.length));
    const discs: Box[] = marks.map((m) => ({ x: m.x - m.r - 3, y: m.y - m.r - 3, w: 2 * (m.r + 3), h: 2 * (m.r + 3) }));
    for (const m of marks) {
      if (!m.moved) continue;
      const steps = 6;
      for (let i = 0; i <= steps; i++) {
        const x = m.x0 + ((m.x - m.x0) * i) / steps;
        const y = m.y0 + ((m.y - m.y0) * i) / steps;
        discs.push({ x: x - 2, y: y - 2, w: 4, h: 4 });
      }
    }
    const names = marks
      .filter((m) => visible.has(m.s.key) && Number.isFinite(m.x))
      .slice(0, budget)
      .map((m) => {
        const count = hideFiltered || m.nKept === m.s.files ? `${m.s.files}` : `${m.nKept} OF ${m.s.files}`;
        const text = `${m.s.name} · ${count}`;
        return {
          id: m.s.key,
          x: m.x,
          y: m.y,
          r: m.r,
          text,
          w: m.s.name.length * LABEL_CH + (` · ${count}`).length * CAPTION_CH + 4,
          priority: 1000 + m.s.files,
        };
      });
    const captions = ties.all
      .filter((t) => t.visible && t.p.civs.length >= PAIR_CAPTION_MIN && Number.isFinite(t.mx))
      .map((t) => ({
        id: `pair:${t.p.key}`,
        x: t.mx,
        y: t.my,
        r: 4,
        text: `${t.p.civs.length} FILES`,
        w: `${t.p.civs.length} FILES`.length * CAPTION_CH + 4,
        priority: t.p.civs.length,
        prefer: "ns" as const,
      }));
    const placed = placeLabels([...names, ...captions], [...discs, ...ties.obstacles], {
      ch: LABEL_CH,
      lh: LABEL_LH,
      gap: 5,
      bounds: { x: 0, y: 0, w: W, h: geo.height },
      rings: [0, 11, 24],
    });
    return {
      names: placed.filter((l) => !l.id.startsWith("pair:")),
      captions: placed.filter((l) => l.id.startsWith("pair:")),
      nameCandidates: names.length,
    };
  }, [marks, visible, hideFiltered, ties, W, geo.height]);

  // ---- roving focus in table order
  const order = useMemo(() => origins.seats.map((s) => s.key).filter((k) => visible.has(k)), [origins, visible]);
  useEffect(() => {
    if (!active || !visible.has(active)) setActive(order[0] ?? null);
  }, [order, active, visible]);

  const setReading = useCallback(
    (r: OriginReading) => {
      setReadingState((prev) => {
        const same =
          (prev === null && r === null) ||
          (prev?.kind === "seat" && r?.kind === "seat" && prev.key === r.key) ||
          (prev?.kind === "pair" && r?.kind === "pair" && prev.key === r.key);
        if (same) return prev;
        onReading?.(r);
        return r;
      });
    },
    [onReading],
  );

  const onKeyDown = useCallback(
    (ev: React.KeyboardEvent<SVGSVGElement>) => {
      const el = document.activeElement as Element | null;
      if (!el || !svgRef.current?.contains(el) || !el.hasAttribute("data-seat")) return;
      const cur = el.getAttribute("data-seat")!;
      const i = order.indexOf(cur);
      let next: string | undefined;
      if (ev.key === "ArrowRight" || ev.key === "ArrowDown") next = order[Math.min(order.length - 1, i + 1)];
      else if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") next = order[Math.max(0, i - 1)];
      else if (ev.key === "Home") next = order[0];
      else if (ev.key === "End") next = order[order.length - 1];
      else return;
      ev.preventDefault();
      if (next && next !== cur) {
        // focusin is not guaranteed after a programmatic focus() on an SVG
        // anchor — set the state the focus handler would have set.
        setActive(next);
        setFocused(next);
        setReading({ kind: "seat", key: next });
        refs.current.get(next)?.focus();
      }
    },
    [order, setReading],
  );

  const litSeat = highlight && seatBy.has(highlight) ? highlight : null;
  const litPair = highlight && pairBy.has(highlight) ? highlight : null;
  const readSeat = reading?.kind === "seat" ? reading.key : null;
  const readPair = reading?.kind === "pair" ? reading.key : null;
  const tieEmphasised = (p: OriginPair) =>
    p.key === litPair || p.key === readPair ||
    (litSeat !== null && (p.from.key === litSeat || p.to.key === litSeat)) ||
    (readSeat !== null && (p.from.key === readSeat || p.to.key === readSeat));

  const atFloor = marks.filter((m) => m.s.files < floorFiles(K)).length;
  const tieFiles = origins.pairs.reduce((n, p) => n + p.civs.length, 0);

  return (
    <div ref={wrap} className="plate-canvas">
      <a className="sr-only-focusable" href="#plate-1-tables">
        Skip to the tables of record
      </a>
      <svg
        ref={svgRef}
        className="origins"
        width={W}
        height={geo.height}
        viewBox={`0 0 ${W} ${geo.height}`}
        role="group"
        aria-labelledby="plate-1"
        aria-describedby="plate-1-key plate-1-note"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onPointerLeave={() => setReading(null)}
      >
        <rect x={6} y={6} width={W - 12} height={geo.height - 12} fill="none" stroke="var(--rule)" strokeWidth={1} />
        <path d={geo.graticule} fill="none" stroke="var(--rule)" strokeWidth={0.75} strokeDasharray="2 3" />
        <path d={geo.land} fill="var(--surface)" stroke="var(--ink-dim)" strokeWidth={0.75} />

        {/* ties — beneath the marks; hairline, full, strong; strongest painted last */}
        <g aria-hidden="true">
          {[...ties.all]
            .filter((t) => t.visible && (t.cls !== "hairline" || ties.hairlinesDrawn))
            .sort((a, b) => a.p.civs.length - b.p.civs.length || a.p.key.localeCompare(b.p.key))
            .map((t) => {
              const filtered = t.keptN === 0;
              const s = filtered ? { stroke: "var(--ink-dim)", width: 0.5 } : tieEmphasised(t.p) ? TIE_STROKE.strong : TIE_STROKE[t.cls];
              return (
                <g key={t.p.key}>
                  <path d={t.d} fill="none" stroke={s.stroke} strokeWidth={s.width} strokeDasharray={filtered ? "2 2" : undefined} />
                  <path
                    d={t.d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={HIT_WIDTH}
                    style={{ pointerEvents: "stroke" }}
                    onPointerEnter={() => setReading({ kind: "pair", key: t.p.key })}
                  />
                </g>
              );
            })}
        </g>

        {/* tie-only endpoints: a second party's seat where no file is placed */}
        <g aria-hidden="true">
          {origins.tieOnly.map((t: TieOnlySeat) => {
            const [x, y] = geo.project(t.lng, t.lat);
            if (!Number.isFinite(x)) return null;
            return (
              <circle key={t.key} cx={x} cy={y} r={2} fill="var(--ink)">
                <title>{`${t.city}, ${regionName(t.country)} — a second party's seat; no file is placed here`}</title>
              </circle>
            );
          })}
        </g>

        {/* pair captions */}
        <g aria-hidden="true">
          {labels.captions.map((c) => (
            <text key={c.id} x={c.x} y={c.y} textAnchor={c.anchor} className="plate-situation">
              {c.text}
            </text>
          ))}
        </g>

        {/* leaders — a moved mark points to its true position */}
        <g aria-hidden="true">
          {marks
            .filter((m) => m.moved && visible.has(m.s.key))
            .map((m) => {
              const d = Math.hypot(m.x - m.x0, m.y - m.y0) || 1;
              const ex = m.x - ((m.x - m.x0) / d) * m.r;
              const ey = m.y - ((m.y - m.y0) / d) * m.r;
              return (
                <g key={`lead:${m.s.key}`}>
                  <line x1={m.x0} y1={m.y0} x2={ex} y2={ey} stroke="var(--rule)" strokeWidth={0.75} />
                  <circle cx={m.x0} cy={m.y0} r={1.5} fill="var(--ink)" />
                </g>
              );
            })}
        </g>

        {/* seats — anchors to their table rows; one tab stop, roving focus */}
        <g>
          {marks.map((m) => {
            if (!visible.has(m.s.key) || !Number.isFinite(m.x)) return null;
            const filteredOut = m.nKept === 0;
            const partial = m.nKept > 0 && m.nKept < m.s.files;
            const ink = single ? `var(--cat-${single})` : "var(--ink)";
            const ring = m.s.key === focused || m.s.key === litSeat;
            const g = Math.max(10, Math.round(m.r * 1.15));
            const drawDisc = (r: number) =>
              m.s.cited ? (
                <circle cx={m.x} cy={m.y} r={r} fill={ink} stroke="var(--ground)" strokeWidth={1} />
              ) : (
                <circle cx={m.x} cy={m.y} r={r} fill="var(--ground)" stroke={ink} strokeWidth={1.6} />
              );
            return (
              <a
                key={m.s.key}
                ref={(el) => { if (el) refs.current.set(m.s.key, el); else refs.current.delete(m.s.key); }}
                href={`#seat-${seatSlug(m.s.key)}`}
                className={`plate-node${filteredOut ? " filtered" : ""}`}
                data-seat={m.s.key}
                tabIndex={m.s.key === active ? 0 : -1}
                aria-label={`${seatLine(m.s)} — opens its row in the table`}
                onFocus={() => { setFocused(m.s.key); setActive(m.s.key); setReading({ kind: "seat", key: m.s.key }); }}
                onBlur={() => setFocused((f) => (f === m.s.key ? null : f))}
                onPointerEnter={() => setReading({ kind: "seat", key: m.s.key })}
              >
                <title>{seatLine(m.s)}</title>
                {ring && <circle cx={m.x} cy={m.y} r={m.r + 4} fill="none" stroke="var(--cat-coordination)" strokeWidth={2} />}
                {filteredOut ? (
                  <circle cx={m.x} cy={m.y} r={m.r} fill="none" stroke="var(--ink-dim)" strokeWidth={1} strokeDasharray="2 2" />
                ) : partial ? (
                  <>
                    <circle cx={m.x} cy={m.y} r={m.r} fill="none" stroke="var(--ink-dim)" strokeWidth={1} strokeDasharray="2 2" />
                    {drawDisc(seatRadius(m.nKept, K))}
                  </>
                ) : (
                  drawDisc(m.r)
                )}
                {!filteredOut && m.s.mixed && (
                  <circle cx={m.x} cy={m.y} r={m.r + 2} fill="none" stroke={ink} strokeWidth={0.75} strokeDasharray="3 2" />
                )}
                {!filteredOut && single && m.r >= 8 && (
                  <Glyph category={single} filled={m.s.cited} size={g} ink={m.s.cited ? "var(--ground)" : ink} x={m.x - g / 2} y={m.y - g / 2} />
                )}
              </a>
            );
          })}
        </g>

        {/* names — placed, haloed, never overprinting */}
        <g aria-hidden="true">
          {labels.names.map((l) => {
            const i = l.text.lastIndexOf(" · ");
            return (
              <text key={l.id} x={l.x} y={l.y} textAnchor={l.anchor}>
                <tspan className="plate-label">{l.text.slice(0, i)}</tspan>
                <tspan className="plate-caption">{l.text.slice(i)}</tspan>
              </text>
            );
          })}
        </g>
      </svg>

      <div className="plate-reading mono" role="status" aria-live="polite">
        {renderReading(reading, seatBy, pairBy, kept)}
      </div>
      <div className="plate-figure-foot mono dim">
        {`${labels.names.length} OF ${labels.nameCandidates} NAMES PLACED · ${origins.counts.clusteredPlaces} PLACES SHARE A MARK · ${
          origins.pairs.filter((p) => pairClass(p.civs.length) !== "hairline" || ties.hairlinesDrawn).length
        } TIES DRAWN FOR ${tieFiles} FILES${origins.withinSeat ? ` · ${origins.withinSeat} WITHIN ONE SEAT` : ""}${
          ties.hairlinesHidden ? ` · ${ties.hairlinesHidden} HAIRLINES NOT DRAWN` : ""
        } · ${atFloor} SEATS AT THE MINIMUM SIZE${movedCount ? ` · ${movedCount} MARKS MOVED APART, LEADER TO TRUE POSITION` : ""} · BOUNDS ${fmtLat(band.s)}–${fmtLat(band.n)} · ${fmtLng(band.w)}–${fmtLng(band.e)}`}
      </div>
    </div>
  );
}

function ProvenanceWord({ p, pref }: { p: string; pref?: string }) {
  if (p === "wikidata" && pref?.startsWith("wikidata:")) {
    const q = pref.slice("wikidata:".length);
    return <a className="prov wikidata" href={`https://www.wikidata.org/wiki/${q}`} target="_blank" rel="noreferrer noopener">WIKIDATA {q}</a>;
  }
  return <span className={`prov ${p}`}>{p.toUpperCase()}</span>;
}

function renderReading(
  reading: OriginReading,
  seatBy: Map<string, OriginSeat>,
  pairBy: Map<string, OriginPair>,
  kept: Set<string>,
) {
  if (reading?.kind === "seat") {
    const s = seatBy.get(reading.key);
    if (!s) return "Mark a seat to read its parties.";
    const cats = (Object.keys(s.categories) as Category[]).filter((k) => s.categories[k] > 0);
    const nKept = s.civs.filter((c) => kept.has(c.id)).length;
    return (
      <>
        <div className="reading-head">
          <a href={`#seat-${seatSlug(s.key)}`}>{s.name}, {regionName(s.country)}</a> · {s.files} {s.files === 1 ? "file" : "files"}
          {nKept !== s.files && <> ({nKept} in the filter)</>} · {s.parties.length} {s.parties.length === 1 ? "party" : "parties"} ·{" "}
          <span className="prov curated">CURATED {s.provenance.curated}</span>{" "}
          {s.provenance.wikidata > 0 && <><span className="prov wikidata">WIKIDATA {s.provenance.wikidata}</span>{" "}</>}
          {s.provenance.inferred > 0 && <><span className="prov inferred">INFERRED {s.provenance.inferred}</span>{" "}</>}
          · {cats.map((k, i) => (
            <span key={k}>{i > 0 && " · "}<CategoryLabel category={k} /> {s.categories[k]}</span>
          ))}
        </div>
        {s.parties.slice(0, 3).map((p) => (
          <div key={p.actorId} className="reading-tie">
            — {p.name} · {p.files} {p.files === 1 ? "file" : "files"} · <ProvenanceWord p={p.provenance} pref={p.provenanceRef} />
          </div>
        ))}
        {s.parties.length > 3 && (
          <div className="reading-tie">— {s.parties.length - 3} further parties · {s.parties.slice(3).reduce((n, p) => n + p.files, 0)} files</div>
        )}
        {s.members.length > 1 && (
          <div className="reading-tie">— also here: {s.members.map((m) => `${m.city} ${m.civs.length}`).join(" · ")}</div>
        )}
        <div className="reading-tie">
          — files: {s.civs.slice(0, 4).map((c) => c.name).join(", ")}{s.civs.length > 4 ? ` … all ${s.civs.length} in the table` : ""}
        </div>
      </>
    );
  }
  if (reading?.kind === "pair") {
    const p = pairBy.get(reading.key);
    if (!p) return "Mark a seat to read its parties.";
    const toName = "tieOnly" in p.to ? `${p.to.city} (no file placed there)` : p.to.name;
    return (
      <>
        <div className="reading-head">
          {p.from.name} — {toName} · {p.civs.length} {p.civs.length === 1 ? "file whose parties sit" : "files whose parties sit"} in both ·{" "}
          {p.partyPairs.slice(0, 2).map((x) => `${x.a} × ${x.b} (${x.n})`).join(", ")}
        </div>
        {p.civs.slice(0, 3).map((c) => (
          <div key={c.id} className="reading-tie">— <a href={`/civilization?id=${encodeURIComponent(c.id)}`}>{c.name}</a> · {callNumber(c.id)}</div>
        ))}
        {p.civs.length > 3 && <div className="reading-tie">— +{p.civs.length - 3} in the table</div>}
      </>
    );
  }
  return "Mark a seat to read its parties — point, or press Tab then the arrow keys.";
}
