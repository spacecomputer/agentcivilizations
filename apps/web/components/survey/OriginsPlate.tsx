"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { geoGraticule10, geoInterpolate, geoMercator, geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import land110 from "world-atlas/land-110m.json";
import type { ActorRegistryEntry, Category, Civilization } from "@agent-civilizations/schema";
import { actorSlug } from "@agent-civilizations/schema";
import { placingSponsor, INSET_CLUSTER_KM, type InsetMember, type OriginPair, type OriginSeat, type Origins, type TieOnlySeat } from "@/lib/survey";
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

// Plate I names mix Archivo and a mono count; measured widths run up to
// 6 px over the shared estimate and the glyph box a pixel over the line
// height, so the placer is given that margin here.
const NAME_PAD = 6;
const NAME_LH = LABEL_LH + 2; // the rendered glyph box is 16 px at 12 px Archivo
import { placeLabels, overlaps, type Box } from "@/lib/labels";
import { CategoryLabel, Glyph } from "@/components/Glyph";
import { callNumber } from "@/lib/format";

// Plate I — origins. A survey sheet, not a bubble map. Files are placed
// at the seat of their party of record; a seat carries no category —
// marks are ink, fill is provenance (filled cited, hollow inferred, a
// dashed ring where the two mix), area is files under a printed floor.
// The frame is the register's occupied band, widened to every seat and
// tie and printed. Ties are counted relations, one geodesic per seat
// pair in three ruled weights. One curated region may be drawn as a
// ruled inset at a second scale. Every mark is an anchor with a voice:
// one tab stop, roving focus in table order, a reading line beneath, a
// find control above. The canvas renders at one unit per CSS pixel, and
// the plate is laid out once from the whole surveyed ledger — filters
// restyle, never move.

export interface OriginLayoutInfo {
  band: Band;
  K: number;
  moved: number;
  inset: { name: string; places: number; files: number; radiusKm: number; moved: boolean; scale: number } | null;
}

export type OriginReading =
  | { kind: "seat"; key: string }
  | { kind: "member"; key: string }
  | { kind: "pair"; key: string }
  | { kind: "party"; id: string }
  | { kind: "file"; id: string }
  | { kind: "nomatch"; query: string }
  | null;

// The inset frame: one ruled panel, a constant with a comment. It sits
// bottom-left over the Pacific by default; if a seat projects beneath it,
// it moves to bottom-right and the foot says so.
// Height is 55% of the plate's, within [176, 230]; width follows at 1.32:1.
// The frame tries the four corners in order (bottom-left, bottom-right,
// top-left, top-right) at that size, then at the minimum size; a corner
// or size other than the first is printed in the foot.
const INSET_BASE = { m: 8, top: 34, minH: 176, maxH: 230, ratio: 1.32 };
function insetSize(plateHeight: number, minimum = false) {
  const h = minimum
    ? INSET_BASE.minH
    : Math.round(Math.min(INSET_BASE.maxH, Math.max(INSET_BASE.minH, 0.55 * plateHeight)));
  return { w: Math.round(h * INSET_BASE.ratio), h, m: INSET_BASE.m, top: INSET_BASE.top };
}
const INSET_PAD_DEG = 0.06;
const INSET_GRATICULE_DEG = 0.25;

// Points along the four edges of a lng/lat box, every `step` degrees.
function edgeSamples(w: number, s: number, e: number, n: number, step: number): [number, number][] {
  const out: [number, number][] = [];
  for (let lng = w; lng < e; lng += step) { out.push([lng, s], [lng, n]); }
  for (let lat = s; lat < n; lat += step) { out.push([w, lat], [e, lat]); }
  out.push([e, s], [e, n], [w, n], [w, s]);
  return out;
}

function regionName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}
const ordinal = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);

export function seatLine(s: OriginSeat): string {
  const top = s.parties.slice(0, 3).map((p) => `${p.name} ${p.files}`).join(", ");
  const rest = s.parties.length - 3;
  const cats = (Object.keys(s.categories) as Category[])
    .filter((k) => s.categories[k] > 0)
    .map((k) => `${k.toUpperCase()} ${s.categories[k]}`)
    .join(" · ");
  return `${s.name}, ${regionName(s.country)} · ${s.files} ${s.files === 1 ? "file" : "files"} at ${s.parties.length} ${s.parties.length === 1 ? "party" : "parties"} — ${top}${rest > 0 ? `, ${rest} others` : ""} · ${s.cited ? "CITED" : s.mixed ? "PARTLY INFERRED" : "INFERRED"} · ${cats} · ${s.pairKeys.length} ${s.pairKeys.length === 1 ? "tie" : "ties"}`;
}
function memberLine(m: InsetMember, seat: OriginSeat, nKept?: number): string {
  const top = m.parties.slice(0, 3).map((p) => `${p.name} ${p.files}`).join(", ");
  const rest = m.parties.length - 3;
  const inFilter = nKept !== undefined && nKept !== m.civs.length ? ` (${nKept} in the filter)` : "";
  return `${m.city}, ${regionName(seat.country)} · ${m.civs.length} ${m.civs.length === 1 ? "file" : "files"}${inFilter} · in the seat ${seat.name} — ${top}${rest > 0 ? `, ${rest} others` : ""} · ${m.cited ? "CITED" : m.mixed ? "PARTLY INFERRED" : "INFERRED"}`;
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
const PLACING = new Set(["lab", "company", "university", "government", "agent-framework"]);

// ------------------------------------------------------------------------

export function OriginsPlate({
  origins,
  civs,
  registry,
  kept,
  cats,
  hideFiltered,
  highlight,
  onReading,
  onLayout,
}: {
  origins: Origins;
  civs: Civilization[];
  registry: ActorRegistryEntry[];
  kept: Set<string>; // file ids matching the filter
  cats: Set<Category>; // categories in the filter (ink returns when exactly one)
  hideFiltered: boolean;
  highlight?: string | null; // a seat key, a pair key, "party:<id>" or "file:<id>" lit from the tables
  onReading?: (r: OriginReading) => void;
  onLayout?: (info: OriginLayoutInfo) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(960);
  const [active, setActive] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [reading, setReadingState] = useState<OriginReading>(null);
  const [query, setQuery] = useState("");
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
    // The band is fitted as points sampled along its edges, never as a
    // polygon: a spherical ring has a winding, and the antimeridian and
    // rectangle clippers read it differently. Points have no inside.
    const bandFeature = { type: "MultiPoint" as const, coordinates: edgeSamples(band.w, band.s, band.e, band.n, 5) };
    const projection = geoNaturalEarth1().rotate([-(band.w + band.e) / 2, 0]).fitWidth(W - 12, bandFeature);
    const path0 = geoPath(projection).pointRadius(0);
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
  const memberBy = useMemo(() => new Map((origins.inset?.members ?? []).map((m) => [`member:${m.key}`, m])), [origins]);
  const registryBy = useMemo(() => new Map(registry.map((r) => [r.id, r])), [registry]);
  const civBy = useMemo(() => new Map(civs.map((c) => [c.id, c])), [civs]);
  const seatOfParty = useMemo(() => {
    const m = new Map<string, OriginSeat>();
    for (const s of origins.seats) for (const p of s.parties) if (!m.has(p.actorId)) m.set(p.actorId, s);
    return m;
  }, [origins]);

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
  const markBy = useMemo(() => new Map(marks.map((m) => [m.s.key, m])), [marks]);
  const visible = useMemo(
    () => new Set(marks.filter((m) => !hideFiltered || m.nKept > 0).map((m) => m.s.key)),
    [marks, hideFiltered],
  );
  const single: Category | null = cats.size === 1 ? [...cats][0] : null;

  // ---- inset: one ruled panel at a second scale ------------------------
  const inset = useMemo(() => {
    const ins = origins.inset;
    if (!ins || !visible.has(ins.seat.key)) return null;
    const anchor = markBy.get(ins.seat.key);
    if (!anchor || !Number.isFinite(anchor.x)) return null;
    // Frame position and size with a self-check: no seat may project
    // beneath the frame. Four corners at the preferred size, then at the
    // minimum; if nothing is clear, the first corner at the minimum size
    // is used and the foot says which seats lie beneath.
    const collides = (fx: number, fy: number, size: { w: number; h: number }) =>
      marks.filter((m) => Number.isFinite(m.x) && overlaps({ x: fx, y: fy, w: size.w, h: size.h }, { x: m.x - m.r - 3, y: m.y - m.r - 3, w: 2 * (m.r + 3), h: 2 * (m.r + 3) })).length;
    const cornersFor = (size: { w: number; h: number; m: number }) => [
      { x: size.m, y: geo.height - size.h - size.m, corner: "bottom-left" },
      { x: W - size.w - size.m, y: geo.height - size.h - size.m, corner: "bottom-right" },
      { x: size.m, y: size.m, corner: "top-left" },
      { x: W - size.w - size.m, y: size.m, corner: "top-right" },
    ];
    // Corners at the preferred size; failing every corner, the inset is
    // drawn beneath the band inside the same figure — never over a seat.
    const INSET = insetSize(geo.height);
    let frame = cornersFor(INSET)[0];
    let moved = false;
    let belowPlate = false;
    const clear = cornersFor(INSET).find((c) => collides(c.x, c.y, INSET) === 0);
    if (clear) {
      frame = clear;
      moved = clear.corner !== "bottom-left";
    } else {
      frame = { x: INSET.m, y: geo.height + INSET.m, corner: "beneath the plate" };
      moved = true;
      belowPlate = true;
    }
    const inner = { x: frame.x + 6, y: frame.y + INSET.top, w: INSET.w - 12, h: INSET.h - INSET.top - 6 };
    const lngs = ins.members.map((m) => m.lng);
    const lats = ins.members.map((m) => m.lat);
    const bbox = {
      w: Math.min(...lngs) - INSET_PAD_DEG,
      e: Math.max(...lngs) + INSET_PAD_DEG,
      s: Math.min(...lats) - INSET_PAD_DEG,
      n: Math.max(...lats) + INSET_PAD_DEG,
    };
    const bboxFeature = { type: "MultiPoint" as const, coordinates: edgeSamples(bbox.w, bbox.s, bbox.e, bbox.n, 0.1) }; // see the band
    const proj = geoMercator().fitExtent([[inner.x, inner.y], [inner.x + inner.w, inner.y + inner.h]], bboxFeature);
    proj.clipExtent([[inner.x, inner.y], [inner.x + inner.w, inner.y + inner.h]]);
    const path = geoPath(proj);
    // Quarter-degree graticule, the only geography drawn at this scale.
    const lines: number[][][] = [];
    const g = INSET_GRATICULE_DEG;
    for (let lng = Math.ceil(bbox.w / g) * g; lng <= bbox.e; lng += g) lines.push([[lng, bbox.s], [lng, bbox.n]]);
    for (let lat = Math.ceil(bbox.s / g) * g; lat <= bbox.n; lat += g) lines.push([[bbox.w, lat], [bbox.e, lat]]);
    const graticule = path({ type: "MultiLineString", coordinates: lines }) ?? "";
    // Scale relative to the plate: pixels per kilometre at the region.
    const kmDeg = 1 / 111;
    const w0 = geo.project(ins.region.lng, ins.region.lat);
    const w1 = geo.project(ins.region.lng, ins.region.lat + kmDeg);
    const i0 = proj([ins.region.lng, ins.region.lat]) ?? [0, 0];
    const i1 = proj([ins.region.lng, ins.region.lat + kmDeg]) ?? [0, 0];
    const worldPxKm = Math.hypot(w1[0] - w0[0], w1[1] - w0[1]) || 1e-6;
    const insetPxKm = Math.hypot(i1[0] - i0[0], i1[1] - i0[1]);
    const scale = Math.round(insetPxKm / worldPxKm);
    const members = ins.members
      .map((m) => {
        const [x, y] = proj([m.lng, m.lat]) ?? [NaN, NaN];
        const nKept = m.civs.filter((c) => kept.has(c.id)).length;
        return { m, key: `member:${m.key}`, x, y, r: seatRadius(m.civs.length, K), nKept };
      })
      .filter((mm) => !hideFiltered || mm.nKept > 0); // the world plate's filter law
    const discs: Box[] = members.map((mm) => ({ x: mm.x - mm.r - 3, y: mm.y - mm.r - 3, w: 2 * (mm.r + 3), h: 2 * (mm.r + 3) }));
    const names = placeLabels(
      members
        .filter((mm) => Number.isFinite(mm.x))
        .map((mm) => {
          const count = hideFiltered || mm.nKept === mm.m.civs.length ? `${mm.m.civs.length}` : `${mm.nKept} OF ${mm.m.civs.length}`;
          return {
            id: mm.key,
            x: mm.x,
            y: mm.y,
            r: mm.r,
            text: `${mm.m.city} · ${count}`,
            w: mm.m.city.length * LABEL_CH + (` · ${count}`).length * CAPTION_CH + NAME_PAD,
            priority: 1000 + mm.m.civs.length,
          };
        }),
      discs,
      { ch: LABEL_CH, lh: NAME_LH, gap: 4, bounds: inner, rings: [0, 11, 24] },
    );
    // Leader from the aggregate mark's disc edge to the nearest frame corner.
    const corners = [
      [frame.x, frame.y], [frame.x + INSET.w, frame.y], [frame.x, frame.y + INSET.h], [frame.x + INSET.w, frame.y + INSET.h],
    ];
    const corner = corners.reduce((best, c) => (Math.hypot(c[0] - anchor.x, c[1] - anchor.y) < Math.hypot(best[0] - anchor.x, best[1] - anchor.y) ? c : best), corners[0]);
    const d = Math.hypot(corner[0] - anchor.x, corner[1] - anchor.y) || 1;
    const leader = { x1: anchor.x + ((corner[0] - anchor.x) / d) * (anchor.r + 2), y1: anchor.y + ((corner[1] - anchor.y) / d) * (anchor.r + 2), x2: corner[0], y2: corner[1] };
    return { ins, frame, inner, moved, belowPlate, graticule, members, names, scale, leader, size: INSET, box: { x: frame.x, y: frame.y, w: INSET.w, h: INSET.h } as Box };
  }, [origins, visible, markBy, marks, geo, W, K, kept, hideFiltered]);

  useEffect(() => {
    onLayout?.({
      band,
      K,
      moved: movedCount,
      inset: inset
        ? { name: inset.ins.region.name, places: inset.ins.places, files: inset.ins.files, radiusKm: inset.ins.region.radiusKm, moved: inset.moved, scale: inset.scale }
        : null,
    });
  }, [band, K, movedCount, inset, onLayout]);

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
    if (inset && !inset.belowPlate) {
      discs.push(inset.box);
      const steps = 8;
      for (let i = 0; i <= steps; i++) {
        const x = inset.leader.x1 + ((inset.leader.x2 - inset.leader.x1) * i) / steps;
        const y = inset.leader.y1 + ((inset.leader.y2 - inset.leader.y1) * i) / steps;
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
          w: m.s.name.length * LABEL_CH + (` · ${count}`).length * CAPTION_CH + NAME_PAD,
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
      lh: NAME_LH,
      gap: 5,
      bounds: { x: 0, y: 0, w: W, h: geo.height },
      rings: [0, 11, 24],
    });
    return {
      names: placed.filter((l) => !l.id.startsWith("pair:")),
      captions: placed.filter((l) => l.id.startsWith("pair:")),
      nameCandidates: names.length,
    };
  }, [marks, visible, hideFiltered, ties, W, geo.height, inset]);

  // ---- roving focus in table order; inset members follow their aggregate
  const order = useMemo(() => {
    const out: string[] = [];
    for (const s of origins.seats) {
      if (!visible.has(s.key)) continue;
      out.push(s.key);
      if (inset && inset.ins.seat.key === s.key) for (const mm of inset.members) if (Number.isFinite(mm.x)) out.push(mm.key);
    }
    return out;
  }, [origins, visible, inset]);
  useEffect(() => {
    if (!active || !order.includes(active)) setActive(order[0] ?? null);
  }, [order, active]);

  const setReading = useCallback(
    (r: OriginReading) => {
      setReadingState((prev) => {
        const same = JSON.stringify(prev) === JSON.stringify(r);
        if (same) return prev;
        onReading?.(r);
        return r;
      });
    },
    [onReading],
  );

  const readingFor = (key: string): OriginReading =>
    key.startsWith("member:") ? { kind: "member", key } : { kind: "seat", key };

  // Focus a mark by its order key: state first (focusin is not guaranteed
  // after a programmatic focus() on an SVG anchor), then focus, then
  // scroll the figure's horizontal scroller to it.
  const focusMark = useCallback(
    (key: string, readingOverride?: OriginReading) => {
      setActive(key);
      setReading(readingOverride === undefined ? readingFor(key) : readingOverride);
      const el = refs.current.get(key);
      if (readingOverride === undefined) {
        // `focused` mirrors real DOM focus; a party or file outcome rings
        // its seat through the reading instead.
        setFocused(key);
        el?.focus();
      }
      const pos = key.startsWith("member:") ? inset?.members.find((mm) => mm.key === key) : markBy.get(key);
      const scroller = wrap.current?.parentElement;
      if (pos && scroller && scroller.scrollWidth > scroller.clientWidth) {
        scroller.scrollTo({ left: Math.max(0, pos.x - scroller.clientWidth / 2) });
      }
    },
    [inset, markBy, setReading],
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
      if (next && next !== cur) focusMark(next);
    },
    [order, focusMark],
  );

  // ---- find a seat, a party or a file --------------------------------
  const findIndex = useMemo(() => {
    // Every place is findable, including one folded into a seat or an
    // inset member; the option says where the folded place lives.
    const members = (origins.inset?.members ?? []).flatMap((m) =>
      m.places.map((pl, i) => ({ key: `member:${m.key}`, name: pl.city, files: pl.civs.length, seat: origins.inset!.seat.name, folded: i === 0 ? null : m.city })),
    );
    // A place drawn in the inset is found there, not at its world seat.
    const inInset = new Set(members.map((m) => m.name.toLowerCase()));
    const seats = origins.seats.flatMap((s) =>
      s.members
        .map((pl, i) => ({
          key: s.key,
          name: i === 0 ? s.name : pl.city,
          alt: `${pl.city}, ${s.country}`.toLowerCase(),
          files: i === 0 ? s.files : pl.civs.length,
          country: s.country,
          inSeat: i === 0 ? null : s.name,
        }))
        .filter((e) => e.inSeat === null || !inInset.has(e.name.toLowerCase())),
    );
    const parties = registry
      .filter((r) => r.kind !== "publication")
      .map((r) => ({ id: r.id, name: r.name, aliases: r.aliases, entry: r }));
    const files = civs.map((c) => ({ id: c.id, name: c.name }));
    return { seats, members, parties, files };
  }, [origins, registry, civs]);

  const find = useCallback(
    (raw: string) => {
      const q = raw.trim();
      const ql = q.toLowerCase();
      if (!ql) return;
      const { seats, members, parties, files } = findIndex;
      const slug = actorSlug(q);
      const seat =
        seats.find((s) => s.name.toLowerCase() === ql || s.alt === ql) ??
        null;
      if (seat) { focusMark(seat.key); return; }
      const member = members.find((m) => m.name.toLowerCase() === ql);
      if (member) { focusMark(member.key); return; }
      const party = parties.find((p) => p.name.toLowerCase() === ql || p.id === slug || p.aliases.includes(slug));
      if (party) {
        const s = seatOfParty.get(party.id);
        if (s && visible.has(s.key)) focusMark(s.key, { kind: "party", id: party.id });
        else setReading({ kind: "party", id: party.id });
        return;
      }
      const file = files.find((f) => f.name.toLowerCase() === ql) ?? files.find((f) => f.id.toLowerCase() === ql);
      if (file) {
        const seatKey = origins.placedAt.get(file.id);
        if (seatKey && visible.has(seatKey)) focusMark(seatKey, { kind: "file", id: file.id });
        else setReading({ kind: "file", id: file.id });
        return;
      }
      // Prefix matches, in the same order of pools.
      const ps = seats.find((s) => s.name.toLowerCase().startsWith(ql) || s.alt.startsWith(ql));
      if (ps) { focusMark(ps.key); return; }
      const pm = members.find((m) => m.name.toLowerCase().startsWith(ql));
      if (pm) { focusMark(pm.key); return; }
      const pp = parties.find((p) => p.name.toLowerCase().startsWith(ql));
      if (pp) {
        const s = seatOfParty.get(pp.id);
        if (s && visible.has(s.key)) focusMark(s.key, { kind: "party", id: pp.id });
        else setReading({ kind: "party", id: pp.id });
        return;
      }
      const pf = files.find((f) => f.name.toLowerCase().startsWith(ql) || f.id.toLowerCase().startsWith(ql));
      if (pf) {
        const seatKey = origins.placedAt.get(pf.id);
        if (seatKey && visible.has(seatKey)) focusMark(seatKey, { kind: "file", id: pf.id });
        else setReading({ kind: "file", id: pf.id });
        return;
      }
      setReading({ kind: "nomatch", query: q });
    },
    [findIndex, focusMark, origins, seatOfParty, visible, setReading],
  );
  const optionValues = useMemo(() => {
    const set = new Set<string>();
    for (const s of findIndex.seats) set.add(s.name);
    for (const m of findIndex.members) set.add(m.name);
    for (const p of findIndex.parties) set.add(p.name);
    for (const f of findIndex.files) set.add(f.name);
    return set;
  }, [findIndex]);

  // ---- emphasis from the tables and the reading line
  const litSeat =
    highlight && seatBy.has(highlight) ? highlight
    : highlight?.startsWith("party:") ? (seatOfParty.get(highlight.slice(6))?.key ?? null)
    : highlight?.startsWith("file:") ? (origins.placedAt.get(highlight.slice(5)) ?? null)
    : null;
  const litPair = highlight && pairBy.has(highlight) ? highlight : null;
  const readSeat =
    reading?.kind === "seat" ? reading.key
    : reading?.kind === "party" ? (seatOfParty.get(reading.id)?.key ?? null)
    : reading?.kind === "file" ? (origins.placedAt.get(reading.id) ?? null)
    : null;
  const readPair = reading?.kind === "pair" ? reading.key : null;
  const tieEmphasised = (p: OriginPair) =>
    p.key === litPair || p.key === readPair ||
    (litSeat !== null && (p.from.key === litSeat || p.to.key === litSeat)) ||
    (readSeat !== null && (p.from.key === readSeat || p.to.key === readSeat));

  const atFloor = marks.filter((m) => m.s.files < floorFiles(K)).length;
  const tieFiles = origins.pairs.reduce((n, p) => n + p.civs.length, 0);
  const ink = single ? `var(--cat-${single})` : "var(--ink)";
  const figureHeight = geo.height + (inset?.belowPlate ? inset.size.h + 2 * inset.size.m : 0);

  const disc = (x: number, y: number, r: number, cited: boolean) =>
    cited ? (
      <circle cx={x} cy={y} r={r} fill={ink} stroke="var(--ground)" strokeWidth={1} />
    ) : (
      <circle cx={x} cy={y} r={r} fill="var(--ground)" stroke={ink} strokeWidth={1.6} />
    );

  const renderMark = (
    key: string,
    x: number,
    y: number,
    r: number,
    nAll: number,
    nKept: number,
    cited: boolean,
    mixed: boolean,
    href: string,
    label: string,
  ) => {
    const filteredOut = nKept === 0;
    const partial = nKept > 0 && nKept < nAll;
    const ring = key === focused || key === litSeat || (key.startsWith("member:") ? false : key === readSeat && reading?.kind !== "seat");
    const g = Math.max(10, Math.round(r * 1.15));
    return (
      <a
        key={key}
        ref={(el) => { if (el) refs.current.set(key, el); else refs.current.delete(key); }}
        href={href}
        className={`plate-node${filteredOut ? " filtered" : ""}`}
        data-seat={key}
        tabIndex={key === active ? 0 : -1}
        aria-label={`${label} — opens its row in the table`}
        onFocus={() => { setFocused(key); setActive(key); setReading(readingFor(key)); }}
        onBlur={() => setFocused((f) => (f === key ? null : f))}
        onPointerEnter={() => setReading(readingFor(key))}
      >
        <title>{label}</title>
        {ring && <circle cx={x} cy={y} r={r + 4} fill="none" stroke="var(--cat-coordination)" strokeWidth={2} />}
        {filteredOut ? (
          <circle cx={x} cy={y} r={r} fill="none" stroke="var(--ink-dim)" strokeWidth={1} strokeDasharray="2 2" />
        ) : partial ? (
          <>
            <circle cx={x} cy={y} r={r} fill="none" stroke="var(--ink-dim)" strokeWidth={1} strokeDasharray="2 2" />
            {disc(x, y, seatRadius(nKept, K), cited)}
          </>
        ) : (
          disc(x, y, r, cited)
        )}
        {!filteredOut && mixed && (
          <circle cx={x} cy={y} r={r + 2} fill="none" stroke={ink} strokeWidth={0.75} strokeDasharray="3 2" />
        )}
        {!filteredOut && single && r >= 8 && (
          <Glyph category={single} filled={cited} size={g} ink={cited ? "var(--ground)" : ink} x={x - g / 2} y={y - g / 2} />
        )}
      </a>
    );
  };

  return (
    <div ref={wrap} className="plate-canvas">
      <div className="plate-find mono">
        <a className="sr-only-focusable" href="#plate-1-tables">
          Skip to the tables of record
        </a>
        <label>
          <span className="find-label">FIND A SEAT, PARTY OR FILE</span>
          <input
            type="search"
            list="plate1-index"
            autoComplete="off"
            spellCheck={false}
            value={query}
            placeholder="city, organisation, or file"
            aria-label="Find a seat, party or file on this plate"
            onChange={(e) => {
              const v = e.target.value;
              setQuery(v);
              // A datalist pick arrives without an inputType (or as a
              // replacement); a keystroke that happens to spell an option
              // must not fire find and steal focus mid-word.
              const it = (e.nativeEvent as InputEvent).inputType;
              if ((!it || it === "insertReplacementText") && optionValues.has(v)) find(v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                find(query);
              }
            }}
          />
        </label>
        <datalist id="plate1-index">
          {findIndex.seats.map((s) => (
            <option key={`s:${s.key}:${s.name}`} value={s.name}>{`${s.inSeat ? `in ${s.inSeat} · ` : ""}${s.country} · ${s.files} ${s.files === 1 ? "file" : "files"}`}</option>
          ))}
          {findIndex.members.map((m) => (
            <option key={`m:${m.key}:${m.name}`} value={m.name}>{`${m.folded ? `with ${m.folded} · ` : ""}in ${m.seat} · ${m.files} ${m.files === 1 ? "file" : "files"}`}</option>
          ))}
          {findIndex.parties.map((p) => {
            const s = seatOfParty.get(p.id);
            const placed = p.entry.placedCount ?? s?.parties.find((x) => x.actorId === p.id)?.files ?? 0;
            const text = s
              ? `${s.name}, ${s.country} · placed ${placed} ${placed === 1 ? "file" : "files"}`
              : !PLACING.has(p.entry.kind) ? `${p.entry.kind} · never places`
              : p.entry.origin.provenance === "unplaced" ? "UNPLACED"
              : `${p.entry.origin.city ?? "—"}, ${p.entry.origin.country ?? "—"} · places no file`;
            return <option key={`p:${p.id}`} value={p.name}>{text}</option>;
          })}
          {findIndex.files.map((f) => {
            if (findIndex.files.length > 500) return <option key={`f:${f.id}`} value={f.name} />;
            const seatKey = origins.placedAt.get(f.id);
            const c = civBy.get(f.id);
            const text = seatKey ? `${callNumber(f.id)} · placed at ${seatBy.get(seatKey)?.name ?? seatKey}` : c?.origin ? `${callNumber(f.id)} · unplaced` : `${callNumber(f.id)} · awaiting survey`;
            return <option key={`f:${f.id}`} value={f.name}>{text}</option>;
          })}
        </datalist>
      </div>
      <svg
        ref={svgRef}
        className="origins"
        width={W}
        height={figureHeight}
        viewBox={`0 0 ${W} ${figureHeight}`}
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

        {/* the inset — one ruled panel at a second scale */}
        {inset && (
          <g className="plate-inset">
            <line x1={inset.leader.x1} y1={inset.leader.y1} x2={inset.leader.x2} y2={inset.leader.y2} stroke="var(--rule)" strokeWidth={0.75} aria-hidden="true" />
            <rect x={inset.frame.x} y={inset.frame.y} width={inset.size.w} height={inset.size.h} fill="var(--ground)" stroke="var(--rule)" strokeWidth={1} />
            <text x={inset.frame.x + 6} y={inset.frame.y + 13} className="plate-caption" aria-hidden="true">
              {`INSET · ${inset.ins.region.name} · ${inset.ins.places} PLACES · ${inset.ins.files} FILES · ${inset.scale}× THE PLATE'S SCALE`}
            </text>
            <text x={inset.frame.x + 6} y={inset.frame.y + 26} className="plate-caption" aria-hidden="true">
              {`NO COASTLINE AT THIS SCALE · GRATICULE ${INSET_GRATICULE_DEG}° · PLACES WITHIN ${INSET_CLUSTER_KM} KM SHARE A MARK`}
            </text>
            <line x1={inset.frame.x} y1={inset.frame.y + inset.size.top - 4} x2={inset.frame.x + inset.size.w} y2={inset.frame.y + inset.size.top - 4} stroke="var(--rule)" strokeWidth={0.75} aria-hidden="true" />
            <path d={inset.graticule} fill="none" stroke="var(--rule)" strokeWidth={0.75} strokeDasharray="2 3" aria-hidden="true" />
            <g>
              {inset.members
                .filter((mm) => Number.isFinite(mm.x))
                .map((mm) =>
                  renderMark(
                    mm.key,
                    mm.x,
                    mm.y,
                    mm.r,
                    mm.m.civs.length,
                    mm.nKept,
                    mm.m.cited,
                    mm.m.mixed,
                    `#seat-${seatSlug(inset.ins.seat.key)}`,
                    memberLine(mm.m, inset.ins.seat, mm.nKept),
                  ),
                )}
            </g>
            <g aria-hidden="true">
              {inset.names.map((l) => {
                const i = l.text.lastIndexOf(" · ");
                return (
                  <text key={l.id} x={l.x} y={l.y} textAnchor={l.anchor}>
                    <tspan className="plate-label">{l.text.slice(0, i)}</tspan>
                    <tspan className="plate-caption">{l.text.slice(i)}</tspan>
                  </text>
                );
              })}
            </g>
          </g>
        )}

        {/* seats — anchors to their table rows; one tab stop, roving focus */}
        <g>
          {marks.map((m) => {
            if (!visible.has(m.s.key) || !Number.isFinite(m.x)) return null;
            const label = inset && inset.ins.seat.key === m.s.key ? `${seatLine(m.s)} · see the inset` : seatLine(m.s);
            return renderMark(m.s.key, m.x, m.y, m.r, m.s.files, m.nKept, m.s.cited, m.s.mixed, `#seat-${seatSlug(m.s.key)}`, label);
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
        {renderReading(reading, { seatBy, pairBy, memberBy, registryBy, civBy, seatOfParty, origins, kept })}
      </div>
      <div className="plate-figure-foot mono dim">
        {`${labels.names.length} OF ${labels.nameCandidates} NAMES PLACED · ${origins.counts.clusteredPlaces} PLACES SHARE A MARK · ${
          origins.pairs.filter((p) => pairClass(p.civs.length) !== "hairline" || ties.hairlinesDrawn).length
        } TIES DRAWN FOR ${tieFiles} FILES${origins.withinSeat ? ` · ${origins.withinSeat} WITHIN ONE SEAT` : ""}${
          ties.hairlinesHidden ? ` · ${ties.hairlinesHidden} HAIRLINES NOT DRAWN` : ""
        } · ${atFloor} SEATS AT THE MINIMUM SIZE${movedCount ? ` · ${movedCount} MARKS MOVED APART, LEADER TO TRUE POSITION` : ""}${
          inset ? ` · INSET · ${inset.ins.region.name} · ${inset.names.length} OF ${inset.members.length} NAMES PLACED${inset.belowPlate ? " · INSET BENEATH THE PLATE · NO CORNER CLEAR OF A SEAT" : inset.moved ? ` · INSET AT ${inset.frame.corner.toUpperCase()} · A SEAT BENEATH ITS DEFAULT CORNER` : ""}` : ""
        }${origins.insetOverflow ? ` · +${origins.insetOverflow} REGION IN THE TABLE` : ""} · BOUNDS ${fmtLat(band.s)}–${fmtLat(band.n)} · ${fmtLng(band.w)}–${fmtLng(band.e)}`}
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

const fileHref = (id: string) => `/civilization?id=${encodeURIComponent(id)}`;

function renderReading(
  reading: OriginReading,
  ctx: {
    seatBy: Map<string, OriginSeat>;
    pairBy: Map<string, OriginPair>;
    memberBy: Map<string, InsetMember>;
    registryBy: Map<string, ActorRegistryEntry>;
    civBy: Map<string, Civilization>;
    seatOfParty: Map<string, OriginSeat>;
    origins: Origins;
    kept: Set<string>;
  },
) {
  const { seatBy, pairBy, memberBy, registryBy, civBy, seatOfParty, origins, kept } = ctx;
  const fallback = "Mark a seat to read its parties — point, or press Tab then the arrow keys.";
  if (reading?.kind === "seat") {
    const s = seatBy.get(reading.key);
    if (!s) return fallback;
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
          <div className="reading-tie">— also here: {s.members.map((m) => `${m.city} ${m.civs.length}`).join(" · ")}{origins.inset?.seat.key === s.key ? " · drawn in the inset" : ""}</div>
        )}
        <div className="reading-tie">
          — files: {s.civs.slice(0, 4).map((c) => c.name).join(", ")}{s.civs.length > 4 ? ` … all ${s.civs.length} in the table` : ""}
        </div>
      </>
    );
  }
  if (reading?.kind === "member") {
    const m = memberBy.get(reading.key);
    const seat = origins.inset?.seat;
    if (!m || !seat) return fallback;
    return (
      <>
        <div className="reading-head">
          {m.city}, {regionName(seat.country)} · {m.civs.length} {m.civs.length === 1 ? "file" : "files"} · in the seat{" "}
          <a href={`#seat-${seatSlug(seat.key)}`}>{seat.name}</a>
          {m.places.length > 1 && <> · with {m.places.slice(1).map((p) => p.city).join(", ")}</>}
        </div>
        {m.parties.slice(0, 3).map((p) => (
          <div key={p.actorId} className="reading-tie">
            — {p.name} · {p.files} {p.files === 1 ? "file" : "files"} · <ProvenanceWord p={p.provenance} pref={p.provenanceRef} />
          </div>
        ))}
        {m.parties.length > 3 && <div className="reading-tie">— {m.parties.length - 3} further parties</div>}
        <div className="reading-tie">
          — files: {m.civs.slice(0, 4).map((c) => c.name).join(", ")}{m.civs.length > 4 ? ` … all ${m.civs.length} in the table` : ""}
        </div>
      </>
    );
  }
  if (reading?.kind === "pair") {
    const p = pairBy.get(reading.key);
    if (!p) return fallback;
    const toName = "tieOnly" in p.to ? `${p.to.city} (no file placed there)` : p.to.name;
    return (
      <>
        <div className="reading-head">
          {p.from.name} — {toName} · {p.civs.length} {p.civs.length === 1 ? "file whose parties sit" : "files whose parties sit"} in both ·{" "}
          {p.partyPairs.slice(0, 2).map((x) => `${x.a} × ${x.b} (${x.n})`).join(", ")}
        </div>
        {p.civs.slice(0, 3).map((c) => (
          <div key={c.id} className="reading-tie">— <a href={fileHref(c.id)}>{c.name}</a> · {callNumber(c.id)}</div>
        ))}
        {p.civs.length > 3 && <div className="reading-tie">— +{p.civs.length - 3} in the table</div>}
      </>
    );
  }
  if (reading?.kind === "party") {
    const e = registryBy.get(reading.id);
    if (!e) return fallback;
    const seat = seatOfParty.get(e.id);
    const placed = e.placedCount ?? seat?.parties.find((p) => p.actorId === e.id)?.files ?? 0;
    const leads = origins.unlocatedActors.find((u) => u.actorId === e.id);
    const canPlace = PLACING.has(e.kind);
    const located = e.origin.provenance !== "unplaced";
    return (
      <div className="reading-head">
        {e.name} · {e.kind}{e.productOf ? ` of ${registryBy.get(e.productOf)?.name ?? e.productOf}` : ""} ·{" "}
        {seat ? (
          <><a href={`#seat-${seatSlug(seat.key)}`}>{seat.name}, {regionName(seat.country)}</a> · <ProvenanceWord p={e.origin.provenance} pref={e.origin.provenanceRef} /> · placed {placed} {placed === 1 ? "file" : "files"}</>
        ) : !canPlace ? (
          <>recorded, never places a file</>
        ) : !located ? (
          <><span className="prov unplaced">UNPLACED</span>{leads ? <> · the {leads.files} {leads.files === 1 ? "file" : "files"} it leads {leads.files === 1 ? "is" : "are"} listed beneath</> : null}</>
        ) : (
          <>{e.origin.city ?? "—"}, {e.origin.country ? regionName(e.origin.country) : "—"} · <ProvenanceWord p={e.origin.provenance} pref={e.origin.provenanceRef} /> · places no file</>
        )}
        {" "}· named in {e.civilizationCount} {e.civilizationCount === 1 ? "file" : "files"}
      </div>
    );
  }
  if (reading?.kind === "file") {
    const c = civBy.get(reading.id);
    if (!c) return fallback;
    const co = c.origin;
    const seatKey = origins.placedAt.get(c.id);
    const seat = seatKey ? seatBy.get(seatKey) : undefined;
    let placement: React.ReactNode;
    if (!co) placement = <>awaiting the nightly survey (01:00 UTC)</>;
    else if (seat) {
      const sp = placingSponsor(co);
      const rank = co.placedBy?.rank ?? (sp ? co.sponsors.indexOf(sp) + 1 : 0);
      const first = co.sponsors[0];
      const second = co.sponsors.find((s) => sp && s.actorId !== sp.actorId && !s.excluded && s.origin && s.origin.provenance !== "unplaced");
      const secondSeat = second ? seatOfParty.get(second.actorId) : undefined;
      placement = (
        <>
          placed at <a href={`#seat-${seatSlug(seat.key)}`}>{seat.name}</a> by {sp?.actorName ?? "—"}, its {ordinal(rank)} party
          {sp && <> ({sp.mentions} mentions)</>}
          {rank > 1 && first && first.actorId !== sp?.actorId && <> — its 1st, {first.actorName}, is {first.excluded ? `not a party (${first.excluded})` : "unplaced"}</>}
          {second && secondSeat && secondSeat.key !== seat.key && <> · also names {second.actorName}, {secondSeat.name}</>}
        </>
      );
    } else if (co.reason === "no-actors" || co.sponsors.length === 0) placement = <>unplaced — no actor is named in its entries</>;
    else if (co.reason === "no-organisation" || co.sponsors.every((s) => s.excluded)) placement = <>unplaced — its entries name {co.sponsors.slice(0, 3).map((s) => s.actorName).join(", ")}: people, papers or groups, not an organisation</>;
    else {
      const names = (co.unlocated ?? co.sponsors.filter((s) => !s.excluded && (!s.origin || s.origin.provenance === "unplaced"))).slice(0, 3).map((s) => s.actorName);
      placement = <>unplaced — its {names.length === 1 ? "party" : "parties"} {names.join(", ")} could not be located · listed beneath</>;
    }
    return (
      <div className="reading-head">
        <a href={fileHref(c.id)}>{c.name}</a> · {callNumber(c.id)} · <CategoryLabel category={c.category} /> · {placement}
      </div>
    );
  }
  if (reading?.kind === "nomatch") {
    return <>No seat, party or file named “{reading.query}” on this plate.</>;
  }
  return fallback;
}
