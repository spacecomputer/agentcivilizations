"use client";
// The layout of record for Plate II. A pure, seeded, id-ordered function
// from a Ties object and a canvas width to coordinates in CSS pixels.
//
// - Components of six or more files are laid out by force in the main
//   field; forces act on the drawn ties (strong and full) with d3's
//   degree normalisation, hairline ties pull only faintly.
// - Components smaller than six are placed analytically in a ruled
//   inset at the right edge — never left to drift and clamp.
// - Initial positions come from a hash of the id, so ingestion order
//   cannot move a mark; a boundary force replaces the post-hoc clamp;
//   a collide-only settle follows the main run so discs never overlap.
// - Every constant is a function of the register's size.

import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Force,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import type { TieEdge, TieNode, Ties } from "./survey";
import { djb2, mulberry32 } from "./survey";

export interface LaidNode extends TieNode {
  x: number;
  y: number;
  r: number;
  comp: number; // index into ties.components
  inset: boolean;
}
export interface LaidEdge extends TieEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export interface Inset {
  x: number;
  y: number;
  w: number;
  h: number;
  groups: number; // components placed in the inset
  files: number;
  overflowGroups: number; // components that did not fit (listed in the table)
  overflowFiles: number;
}
export interface Layout {
  width: number;
  height: number;
  pad: number;
  field: { x: number; y: number; w: number; h: number };
  nodes: LaidNode[];
  edges: LaidEdge[];
  inset: Inset | null;
}

const SEED = 20260901; // the day the register opened
const PAD = 28;
const BIG = 6; // components of this size or more take the main field
const INSET_W = 224;
const INSET_ROW_H = 64;
const INSET_ROWS = 8;
const MAIN_TICKS = 300;
const SETTLE_TICKS = 60;

export function plateHeight(nodes: number): number {
  return Math.round(Math.min(900, Math.max(600, 600 + 0.9 * (nodes - 60))));
}
export function markRadius(entries: number): number {
  return 6.5 + 2.0 * Math.sqrt(Math.max(1, entries));
}
export function labelBudget(nodes: number): number {
  return Math.min(nodes, Math.max(12, 28 + Math.floor((nodes - 60) / 12)));
}

interface SimNode extends SimulationNodeDatum {
  id: string;
  r: number;
}
interface SimLink extends SimulationLinkDatum<SimNode> {
  drawn: boolean;
  strong: boolean;
}

function boundaryForce(box: { x: number; y: number; w: number; h: number }): Force<SimNode, undefined> {
  let nodes: SimNode[] = [];
  const force = ((alpha: number) => {
    const k = 0.9 * alpha;
    for (const n of nodes) {
      const minX = box.x + n.r;
      const maxX = box.x + box.w - n.r;
      const minY = box.y + n.r;
      const maxY = box.y + box.h - n.r;
      const x = n.x ?? 0;
      const y = n.y ?? 0;
      if (x < minX) n.vx = (n.vx ?? 0) + (minX - x) * k;
      else if (x > maxX) n.vx = (n.vx ?? 0) + (maxX - x) * k;
      if (y < minY) n.vy = (n.vy ?? 0) + (minY - y) * k;
      else if (y > maxY) n.vy = (n.vy ?? 0) + (maxY - y) * k;
    }
  }) as Force<SimNode, undefined>;
  force.initialize = (ns: SimNode[]) => {
    nodes = ns;
  };
  return force;
}

export function layoutTies(ties: Ties, width: number): Layout {
  const W = Math.max(640, Math.round(width));
  const H = plateHeight(ties.nodes.length);
  const byId = new Map(ties.nodes.map((n) => [n.id, n]));
  const compIndex = new Map<string, number>();
  ties.components.forEach((c, i) => c.forEach((id) => compIndex.set(id, i)));

  const big = ties.components.filter((c) => c.length >= BIG);
  const small = ties.components.filter((c) => c.length < BIG);
  const insetW = small.length ? INSET_W : 0;
  const field = { x: PAD, y: PAD, w: W - insetW - 2 * PAD, h: H - 2 * PAD };

  const laid = new Map<string, LaidNode>();

  // ---- main field: force layout per big component -------------------
  // Split the field width between big components in proportion to sqrt(size).
  const weights = big.map((c) => Math.sqrt(c.length));
  const wsum = weights.reduce((a, b) => a + b, 0) || 1;
  let cursorX = field.x;
  big.forEach((comp, ci) => {
    const fw = big.length === 1 ? field.w : Math.floor((field.w * weights[ci]) / wsum);
    const box = { x: cursorX, y: field.y, w: fw, h: field.h };
    cursorX += fw;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const ids = [...comp].sort();
    const inComp = new Set(ids);
    const nodes: SimNode[] = ids.map((id) => {
      const h = djb2(id);
      const theta = ((h % 3600) / 3600) * Math.PI * 2;
      const rho = 40 + ((h >> 12) % 160);
      return {
        id,
        r: markRadius(byId.get(id)!.entries),
        x: cx + rho * Math.cos(theta),
        y: cy + rho * Math.sin(theta),
      };
    });
    const links: SimLink[] = ties.edges
      .filter((e) => inComp.has(e.source) && inComp.has(e.target))
      .map((e) => ({ source: e.source, target: e.target, drawn: e.drawn, strong: e.cls === "strong" }));
    const degDrawn = new Map<string, number>();
    const degAll = new Map<string, number>();
    for (const l of links) {
      const s = l.source as string;
      const t = l.target as string;
      degAll.set(s, (degAll.get(s) ?? 0) + 1);
      degAll.set(t, (degAll.get(t) ?? 0) + 1);
      if (l.drawn) {
        degDrawn.set(s, (degDrawn.get(s) ?? 0) + 1);
        degDrawn.set(t, (degDrawn.get(t) ?? 0) + 1);
      }
    }
    // Before the simulation starts, d3 link endpoints are the ids we
    // supplied (strings); after initialisation they are node objects.
    const idOf = (n: string | number | SimNode) => (typeof n === "object" ? n.id : String(n));
    const link = forceLink<SimNode, SimLink>(links)
      .id((d) => d.id)
      .distance((l) => (l.strong ? 60 : l.drawn ? 100 : 150))
      .strength((l) => {
        const s = idOf(l.source);
        const t = idOf(l.target);
        if (l.drawn) {
          const m = Math.max(1, Math.min(degDrawn.get(s) ?? 1, degDrawn.get(t) ?? 1));
          return (l.strong ? 1.0 : 0.6) / m;
        }
        const m = Math.max(1, Math.min(degAll.get(s) ?? 1, degAll.get(t) ?? 1));
        return 0.15 / m;
      })
      .iterations(2);
    const sim = forceSimulation<SimNode>(nodes)
      .randomSource(mulberry32(SEED + ci))
      .force("link", link)
      .force("charge", forceManyBody<SimNode>().strength(-210).distanceMax(340))
      .force("x", forceX<SimNode>(cx).strength(0.035))
      .force("y", forceY<SimNode>(cy).strength(0.05))
      .force("collide", forceCollide<SimNode>((n) => n.r + 6).iterations(3))
      .force("boundary", boundaryForce(box))
      .stop();
    for (let i = 0; i < MAIN_TICKS; i++) sim.tick();
    // Settle: collision and boundary only, so discs never overlap.
    sim.force("link", null).force("charge", null).force("x", null).force("y", null);
    sim.alpha(0.3);
    for (let i = 0; i < SETTLE_TICKS; i++) sim.tick();
    // Centre the component in its box by translation — never by scaling.
    // The centring forces are kept weak so ties, not the frame, shape the
    // cluster; this step just puts the finished shape where it belongs.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, (n.x ?? cx) - n.r);
      maxX = Math.max(maxX, (n.x ?? cx) + n.r);
      minY = Math.min(minY, (n.y ?? cy) - n.r);
      maxY = Math.max(maxY, (n.y ?? cy) + n.r);
    }
    const dx = cx - (minX + maxX) / 2;
    const dy = cy - (minY + maxY) / 2;
    for (const n of nodes) {
      const base = byId.get(n.id)!;
      laid.set(n.id, {
        ...base,
        x: Math.round(((n.x ?? cx) + dx) * 10) / 10,
        y: Math.round(((n.y ?? cy) + dy) * 10) / 10,
        r: n.r,
        comp: compIndex.get(n.id) ?? 0,
        inset: false,
      });
    }
  });

  // ---- inset: small components placed by rule ------------------------
  let inset: Inset | null = null;
  if (small.length) {
    const ix = W - PAD - INSET_W;
    const iy = PAD + 18; // room for the caption
    const rows = Math.min(INSET_ROWS, small.length);
    inset = {
      x: ix,
      y: PAD,
      w: INSET_W,
      h: field.h,
      groups: rows,
      files: 0,
      overflowGroups: small.length - rows,
      overflowFiles: small.slice(rows).reduce((n, c) => n + c.length, 0),
    };
    small.slice(0, rows).forEach((comp, row) => {
      const ids = [...comp].sort();
      const cy = iy + INSET_ROW_H * row + INSET_ROW_H / 2;
      const cxm = ix + INSET_W / 2;
      const n = ids.length;
      ids.forEach((id, i) => {
        const base = byId.get(id)!;
        const r = markRadius(base.entries);
        let x = cxm;
        let y = cy;
        if (n === 2) {
          x = cxm + (i === 0 ? -34 : 34);
        } else if (n === 3) {
          const ang = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
          x = cxm + 30 * Math.cos(ang);
          y = cy + 22 * Math.sin(ang);
        } else if (n >= 4) {
          const ang = -Math.PI / 4 + (i * 2 * Math.PI) / n;
          x = cxm + 36 * Math.cos(ang);
          y = cy + 22 * Math.sin(ang);
        }
        laid.set(id, {
          ...base,
          x: Math.round(x * 10) / 10,
          y: Math.round(y * 10) / 10,
          r,
          comp: compIndex.get(id) ?? 0,
          inset: true,
        });
        inset!.files++;
      });
    });
  }

  const nodes = ties.nodes.map((n) => laid.get(n.id)).filter((n): n is LaidNode => !!n);
  const pos = new Map(nodes.map((n) => [n.id, n]));
  const edges: LaidEdge[] = [];
  for (const e of ties.edges) {
    const s = pos.get(e.source);
    const t = pos.get(e.target);
    if (!s || !t) continue; // an endpoint in an overflowed inset group
    edges.push({ ...e, x1: s.x, y1: s.y, x2: t.x, y2: t.y });
  }

  return { width: W, height: H, pad: PAD, field, nodes, edges, inset };
}
