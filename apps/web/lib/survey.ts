"use client";
// Data shaping for the Survey — the register's atlas leaf. Three plates,
// all derived client-side from the public ledger:
//   ties     — civilizations linked by shared named actors (the same
//              predicate cross-civilization corroboration uses)
//   cadence  — weekly entry counts per civilization
//   origins  — civilizations grouped by their sponsors' headquarters

import type {
  Category,
  Civilization,
  CivilizationStatus,
  Event,
  Origin,
} from "@agent-civilizations/schema";
import { normalizeActor } from "@agent-civilizations/schema";

export interface TieNode {
  id: string;
  name: string;
  category: Category;
  status: CivilizationStatus;
  eventCount: number;
  confirmed: boolean;
  degree: number;
}
export interface TieEdge {
  source: string;
  target: string;
  weight: number; // Σ 1/(files the actor touches) over shared actors
  actors: string[]; // display spellings
}
export interface Ties {
  nodes: TieNode[];
  edges: TieEdge[];
  isolated: number; // civilizations with events but no tie
}

const MIN_SHARED = 2;

export function buildTies(civs: Civilization[], events: Event[]): Ties {
  const civById = new Map(civs.map((c) => [c.id, c]));
  const actorsByCiv = new Map<string, Set<string>>();
  const civsByActor = new Map<string, Set<string>>();
  const spelling = new Map<string, string>();
  const confirmedCivs = new Set<string>();

  for (const e of events) {
    if (!civById.has(e.civilizationId)) continue;
    if (e.confidence === "confirmed") confirmedCivs.add(e.civilizationId);
    const set = actorsByCiv.get(e.civilizationId) ?? new Set<string>();
    actorsByCiv.set(e.civilizationId, set);
    for (const raw of e.actors) {
      const a = normalizeActor(raw);
      if (a.length < 3) continue;
      set.add(a);
      if (!spelling.has(a)) spelling.set(a, raw);
      const cs = civsByActor.get(a) ?? new Set<string>();
      cs.add(e.civilizationId);
      civsByActor.set(a, cs);
    }
  }

  const ids = [...actorsByCiv.keys()];
  const edges: TieEdge[] = [];
  const degree = new Map<string, number>();
  for (let i = 0; i < ids.length; i++) {
    const A = actorsByCiv.get(ids[i])!;
    for (let j = i + 1; j < ids.length; j++) {
      const B = actorsByCiv.get(ids[j])!;
      const shared: string[] = [];
      for (const a of A) if (B.has(a)) shared.push(a);
      if (shared.length < MIN_SHARED) continue;
      let weight = 0;
      for (const a of shared) weight += 1 / (civsByActor.get(a)?.size ?? 1);
      edges.push({
        source: ids[i],
        target: ids[j],
        weight,
        actors: shared.map((a) => spelling.get(a) ?? a),
      });
      degree.set(ids[i], (degree.get(ids[i]) ?? 0) + 1);
      degree.set(ids[j], (degree.get(ids[j]) ?? 0) + 1);
    }
  }

  const nodes: TieNode[] = [];
  let isolated = 0;
  for (const id of ids) {
    const c = civById.get(id)!;
    const d = degree.get(id) ?? 0;
    if (d === 0) {
      isolated++;
      continue;
    }
    nodes.push({
      id,
      name: c.name,
      category: c.category,
      status: c.status,
      eventCount: c.eventCount,
      confirmed: confirmedCivs.has(id),
      degree: d,
    });
  }
  return { nodes, edges, isolated };
}

// ---------------------------------------------------------------- cadence

export interface CadenceRow {
  id: string;
  name: string;
  category: Category;
  status: CivilizationStatus;
  buckets: number[]; // oldest → newest
  total: number;
}
export interface Cadence {
  rows: CadenceRow[];
  weekStarts: string[]; // ISO dates (UTC Mondays), oldest → newest
  max: number;
}

function utcMonday(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay(); // 0 Sun … 6 Sat
  x.setUTCDate(x.getUTCDate() - ((day + 6) % 7));
  return x;
}

export function buildCadence(
  civs: Civilization[],
  events: Event[],
  weeks = 16,
  maxRows = 40,
): Cadence {
  const last = utcMonday(new Date());
  const first = new Date(last.getTime() - (weeks - 1) * 7 * 86400_000);
  const weekStarts: string[] = [];
  for (let i = 0; i < weeks; i++)
    weekStarts.push(new Date(first.getTime() + i * 7 * 86400_000).toISOString().slice(0, 10));

  const byCiv = new Map<string, number[]>();
  for (const e of events) {
    const t = Date.parse(e.occurredAt || e.recordedAt);
    if (Number.isNaN(t) || t < first.getTime()) continue;
    const idx = Math.min(weeks - 1, Math.floor((t - first.getTime()) / (7 * 86400_000)));
    const b = byCiv.get(e.civilizationId) ?? new Array<number>(weeks).fill(0);
    b[idx]++;
    byCiv.set(e.civilizationId, b);
  }
  const civById = new Map(civs.map((c) => [c.id, c]));
  const rows: CadenceRow[] = [];
  let max = 0;
  for (const [id, buckets] of byCiv) {
    const c = civById.get(id);
    if (!c) continue;
    const total = buckets.reduce((a, b) => a + b, 0);
    max = Math.max(max, ...buckets);
    rows.push({ id, name: c.name, category: c.category, status: c.status, buckets, total });
  }
  rows.sort((a, b) => {
    const la = civById.get(a.id)!.lastEventAt;
    const lb = civById.get(b.id)!.lastEventAt;
    return lb.localeCompare(la);
  });
  return { rows: rows.slice(0, maxRows), weekStarts, max };
}

// ---------------------------------------------------------------- origins

export interface OriginPoint {
  key: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  civs: Civilization[];
  dominantCategory: Category;
  provenance: Origin["provenance"];
}
export interface OriginTie {
  from: OriginPoint;
  to: OriginPoint;
  civ: Civilization;
}
export interface Origins {
  points: OriginPoint[];
  ties: OriginTie[]; // multi-origin files: dominant sponsor ↔ second placed sponsor
  unplaced: Civilization[];
  pending: Civilization[]; // never visited by the origins job
  byCountry: Array<{ country: string; files: number }>;
}

// A point is a place as a reader means it — city and country — not a
// coordinate. Two sponsors a mile apart in the same city share a mark;
// their coordinates are averaged so the mark sits between them.
function pointKey(o: Origin): string {
  if (o.city && o.country) return `${o.city.toLowerCase()}|${o.country.toLowerCase()}`;
  return `${(o.lat ?? 0).toFixed(1)},${(o.lng ?? 0).toFixed(1)}`;
}

export function buildOrigins(civs: Civilization[]): Origins {
  const points = new Map<string, OriginPoint>();
  const coordSums = new Map<string, { lat: number; lng: number; n: number }>();
  const unplaced: Civilization[] = [];
  const pending: Civilization[] = [];
  const ties: OriginTie[] = [];

  const upsert = (o: Origin, c: Civilization): OriginPoint => {
    const key = pointKey(o);
    const p = points.get(key) ?? {
      key,
      city: o.city ?? "—",
      country: o.country ?? "—",
      lat: o.lat!,
      lng: o.lng!,
      civs: [],
      dominantCategory: c.category,
      provenance: o.provenance,
    };
    points.set(key, p);
    const sum = coordSums.get(key) ?? { lat: 0, lng: 0, n: 0 };
    sum.lat += o.lat!;
    sum.lng += o.lng!;
    sum.n++;
    coordSums.set(key, sum);
    p.lat = sum.lat / sum.n;
    p.lng = sum.lng / sum.n;
    return p;
  };

  for (const c of civs) {
    const co = c.origin;
    if (!co) {
      pending.push(c);
      continue;
    }
    const o = co.origin;
    if (
      o.provenance === "unplaced" ||
      typeof o.lat !== "number" ||
      typeof o.lng !== "number" ||
      !Number.isFinite(o.lat) ||
      !Number.isFinite(o.lng)
    ) {
      unplaced.push(c);
      continue;
    }
    const p = upsert(o, c);
    p.civs.push(c);
    // prefer the stronger provenance for the point's label
    if (o.provenance === "curated") p.provenance = "curated";
    // a second placed sponsor in a different city makes a multi-origin file
    const second = co.sponsors.find(
      (s) =>
        s.origin &&
        s.origin.provenance !== "unplaced" &&
        typeof s.origin.lat === "number" &&
        typeof s.origin.lng === "number" &&
        pointKey(s.origin) !== p.key,
    );
    if (second?.origin) {
      const q = upsert(second.origin, c);
      ties.push({ from: p, to: q, civ: c });
    }
  }

  for (const p of points.values()) {
    const tally = new Map<Category, number>();
    for (const c of p.civs) tally.set(c.category, (tally.get(c.category) ?? 0) + 1);
    let best: Category = p.civs[0]?.category ?? "coordination";
    let n = 0;
    for (const [k, v] of tally) if (v > n) { best = k; n = v; }
    p.dominantCategory = best;
  }

  const byCountryMap = new Map<string, number>();
  for (const p of points.values())
    byCountryMap.set(p.country, (byCountryMap.get(p.country) ?? 0) + p.civs.length);
  const byCountry = [...byCountryMap.entries()]
    .map(([country, files]) => ({ country, files }))
    .sort((a, b) => b.files - a.files);

  return {
    points: [...points.values()].sort((a, b) => b.civs.length - a.civs.length),
    ties,
    unplaced,
    pending,
    byCountry,
  };
}

// Deterministic PRNG so the ties plate lays out the same way every visit.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
