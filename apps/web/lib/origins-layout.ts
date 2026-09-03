"use client";
// Layout law for Plate I. Every constant here is printed on the leaf by
// the key or the foot line, from the same variable the code uses.

import { forceCollide, forceSimulation, forceX, forceY, type SimulationNodeDatum } from "d3-force";
import { mulberry32 } from "./survey";

// The plate never renders narrower than this; below it the figure scrolls
// horizontally rather than shrinking the band to a strip.
export const MIN_W = 960;

// ---- symbol scale: area is quantity ----------------------------------
// r(n) = max(R_MIN, K·√n), K chosen each render so the largest seat is
// R_MAX. Seats below the floor are drawn at the minimum and the floor is
// printed.
export const R_MIN = 3.5;
export const R_MAX = 24;
export function radiusScale(nMax: number): number {
  return R_MAX / Math.sqrt(Math.max(1, nMax));
}
export function seatRadius(n: number, K: number): number {
  return Math.max(R_MIN, K * Math.sqrt(Math.max(0, n)));
}
export function floorFiles(K: number): number {
  return Math.ceil((R_MIN / K) ** 2);
}

// ---- frame: the register's occupied band -------------------------------
// The plate is bounded to a base band and widened outward, to the next
// 5°, until every seat and tie endpoint lies inside. The bounds are
// printed in the key so nothing is silently cropped.
export interface Band { w: number; s: number; e: number; n: number }
export const BAND_BASE: Band = { w: -135, s: -8, e: 150, n: 66 };
const PAD_LAT = 8;
const PAD_LNG = 10;
const snapOut = (v: number, dir: 1 | -1) => (dir > 0 ? Math.ceil(v / 5) * 5 : Math.floor(v / 5) * 5);

export function bandFor(points: Array<{ lat: number; lng: number }>): Band {
  let { w, s, e, n } = BAND_BASE;
  for (const p of points) {
    if (p.lng < w) w = snapOut(p.lng - PAD_LNG, -1);
    if (p.lng > e) e = snapOut(p.lng + PAD_LNG, 1);
    if (p.lat < s) s = snapOut(p.lat - PAD_LAT, -1);
    if (p.lat > n) n = snapOut(p.lat + PAD_LAT, 1);
  }
  return { w: Math.max(-180, w), s: Math.max(-90, s), e: Math.min(180, e), n: Math.min(90, n) };
}
export function fmtLat(v: number): string {
  return `${Math.abs(Math.round(v))}°${v < 0 ? "S" : "N"}`;
}
export function fmtLng(v: number): string {
  return `${Math.abs(Math.round(v))}°${v < 0 ? "W" : "E"}`;
}

// ---- ties -----------------------------------------------------------
export const TIE_STRONG_FILES = 4; // a pair of this many files is drawn strong
export const HAIRLINE_CAP_PER_SEAT = 4;
export const PAIR_CAPTION_MIN = 3; // pairs of this many files get their count captioned

// ---- residual conflict: leader displacement --------------------------
// After the band, the area-true radii and the 100 km clusters, two seats
// may still overprint at world scale (London and Paris are 346 km apart).
// Only then is the smaller mark moved, by a seeded, deterministic
// simulation that pulls every mark back toward its true position and
// pushes overlapping discs apart. A moved mark carries a hairline leader
// to its true position, and the count is printed every render. Marks
// that do not overlap are not moved.
export const DISPLACE_GAP = 3;
const DISPLACE_TICKS = 150;

interface DispNode extends SimulationNodeDatum {
  key: string;
  r: number;
  x0: number;
  y0: number;
}
export interface Displaced {
  key: string;
  x: number;
  y: number;
  x0: number; // true (projected) position
  y0: number;
  r: number;
  moved: boolean;
}

export function displaceSeats(nodes: Array<{ key: string; x: number; y: number; r: number }>): Displaced[] {
  const overlaps = (a: { x: number; y: number; r: number }, b: { x: number; y: number; r: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r + DISPLACE_GAP;
  let any = false;
  for (let i = 0; i < nodes.length && !any; i++)
    for (let j = i + 1; j < nodes.length; j++) if (overlaps(nodes[i], nodes[j])) { any = true; break; }
  if (!any) return nodes.map((n) => ({ ...n, x0: n.x, y0: n.y, moved: false }));

  const sim: DispNode[] = nodes.map((n) => ({ key: n.key, r: n.r, x: n.x, y: n.y, x0: n.x, y0: n.y }));
  const s = forceSimulation<DispNode>(sim)
    .randomSource(mulberry32(1))
    .force("x", forceX<DispNode>((d) => d.x0).strength(0.9))
    .force("y", forceY<DispNode>((d) => d.y0).strength(0.9))
    .force("collide", forceCollide<DispNode>((d) => d.r + DISPLACE_GAP).iterations(3))
    .stop();
  for (let i = 0; i < DISPLACE_TICKS; i++) s.tick();
  return sim.map((n) => {
    const x = Math.round((n.x ?? n.x0) * 10) / 10;
    const y = Math.round((n.y ?? n.y0) * 10) / 10;
    return { key: n.key, x, y, x0: n.x0, y0: n.y0, r: n.r, moved: x !== Math.round(n.x0 * 10) / 10 || y !== Math.round(n.y0 * 10) / 10 };
  });
}
