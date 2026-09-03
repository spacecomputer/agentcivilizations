"use client";
// Data shaping for the Survey — the register's atlas leaf. Three plates,
// all derived client-side from the public ledger:
//   ties     — civilizations bound by shared named actors (the same
//              predicate cross-civilization corroboration uses)
//   cadence  — weekly entry counts per civilization
//   origins  — civilizations grouped by their sponsors' headquarters

import type {
  Category,
  Civilization,
  CivilizationOrigin,
  CivilizationStatus,
  Event,
  Origin,
  OriginProvenance,
  Sponsor,
  UnplacedReason,
} from "@agent-civilizations/schema";
import { normalizeActor } from "@agent-civilizations/schema";

// ------------------------------------------------------------------ ties
//
// The tie model of record. Every constant that decides a mark is a
// function of the register's size and is printed on the leaf:
//
//   UBIQ      an actor named in UBIQ or more files is ubiquitous
//             (max(8, 6% of the files with actors) — 15 today, 30 at 500)
//   weight    1 / df, where df is the number of files in which the tie's
//             shared actors appear TOGETHER — two files that alone share a
//             pair of actors bind tightly (1.0); a pair found together in
//             twenty files binds weakly (0.05)
//   strong    df ≤ STRONG_DF
//   drawn     in full when the tie rests on a specific actor and df < UBIQ,
//             or when it is among the K strongest of either file;
//             otherwise a hairline
//   situation a group bound by ties with df ≤ BIND_DF, named by the two
//             actors most particular to it; those two must cover at least
//             half the members or the group is not a situation
//
// Order is by id everywhere — ingestion order never moves a mark.

export type TieClass = "strong" | "full" | "hairline";

export interface TieNode {
  id: string;
  name: string;
  category: Category;
  status: CivilizationStatus;
  entries: number; // entries loaded for this plate (not the civ doc's count)
  confirmed: boolean; // holds at least one confirmed entry
  degree: number; // ties drawn in full
  degreeAll: number; // all ties
  strongest: { other: string; otherName: string; weight: number; edgeKey: string } | null;
}

export interface TieEdge {
  key: string; // `${a}|${b}` with a < b
  source: string;
  target: string;
  df: number;
  weight: number;
  actors: string[]; // display spellings, specific first
  specificActors: string[];
  ubiquitousActors: string[];
  cls: TieClass;
  drawn: boolean; // strong or full
}

// A situation is a group of files bound by specific ties — shared actors
// that appear together in BIND_DF files or fewer — named by the two
// actors most particular to the group. Deterministic: a union-find over
// binding ties, keyed by its sorted member ids. No algorithm that can
// churn between visits, no colour, no hull.
export interface Situation {
  key: string;
  name: string; // "Palo Alto Networks / Unit 42"
  actors: string[]; // the naming actors, display spelling
  members: string[]; // file ids, sorted
  size: number;
  strongestDf: number; // the tightest binding tie in the group
}

export interface IsolatedFile {
  id: string;
  name: string;
  entries: number;
}

export interface Ties {
  nodes: TieNode[]; // id order
  edges: TieEdge[]; // key order
  order: string[]; // node ids, the table's order (specific degree desc, then id)
  isolatedIds: string[]; // files with entries but no tie
  isolated: IsolatedFile[]; // the same, with names — reachable by find-a-file
  situations: Situation[]; // size desc, then tightest binding, then key
  bindDf: number;
  components: string[][]; // over all ties; size desc, then first id
  ubiqThreshold: number;
  ubiquitousActors: Array<{ actor: string; files: number }>;
  strongDf: number;
  topK: number;
  maxDf: number;
  counts: {
    files: number;
    ties: number;
    drawn: number;
    strong: number;
    hairline: number;
    ubiquitousOnly: number;
    withoutTies: number;
  };
}

export const MIN_SHARED = 2;
export const STRONG_DF = 3;
export const BIND_DF = 5; // a tie binds a situation when its actors appear together in 5 files or fewer
export const SITUATION_COVERAGE = 0.5; // the two naming actors must cover at least half the members

export function ubiqThresholdFor(filesWithActors: number): number {
  return Math.max(8, Math.ceil(0.06 * filesWithActors));
}
export function topKFor(filesWithActors: number): number {
  return filesWithActors > 400 ? 2 : 3;
}

export function buildTies(civs: Civilization[], events: Event[]): Ties {
  const civById = new Map(civs.map((c) => [c.id, c]));
  const actorsByCiv = new Map<string, Set<string>>();
  const civsByActor = new Map<string, Set<string>>();
  const spelling = new Map<string, string>();
  const entries = new Map<string, number>();
  const confirmedCivs = new Set<string>();

  for (const e of events) {
    if (!civById.has(e.civilizationId)) continue;
    entries.set(e.civilizationId, (entries.get(e.civilizationId) ?? 0) + 1);
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

  const ids = [...actorsByCiv.keys()].sort();
  const N = ids.length;
  const UBIQ = ubiqThresholdFor(N);
  const K = topKFor(N);
  const isUbiq = (a: string) => (civsByActor.get(a)?.size ?? 0) >= UBIQ;

  // Pairs. O(n²) is fine to ~500 files (125k pairs).
  const edges: TieEdge[] = [];
  const incident = new Map<string, TieEdge[]>();
  let maxDf = 2;
  for (let i = 0; i < ids.length; i++) {
    const A = actorsByCiv.get(ids[i])!;
    for (let j = i + 1; j < ids.length; j++) {
      const B = actorsByCiv.get(ids[j])!;
      const shared: string[] = [];
      for (const a of A) if (B.has(a)) shared.push(a);
      if (shared.length < MIN_SHARED) continue;
      // df: files whose actor set contains every shared actor — iterate the
      // rarest actor's files.
      let rarest = shared[0];
      for (const a of shared)
        if (civsByActor.get(a)!.size < civsByActor.get(rarest)!.size) rarest = a;
      let df = 0;
      for (const id of civsByActor.get(rarest)!) {
        const set = actorsByCiv.get(id)!;
        if (shared.every((a) => set.has(a))) df++;
      }
      df = Math.max(2, df);
      maxDf = Math.max(maxDf, df);
      const specific = shared.filter((a) => !isUbiq(a)).sort();
      const ubiq = shared.filter(isUbiq).sort();
      const edge: TieEdge = {
        key: `${ids[i]}|${ids[j]}`,
        source: ids[i],
        target: ids[j],
        df,
        weight: 1 / df,
        actors: [...specific, ...ubiq].map((a) => spelling.get(a) ?? a),
        specificActors: specific.map((a) => spelling.get(a) ?? a),
        ubiquitousActors: ubiq.map((a) => spelling.get(a) ?? a),
        cls: "hairline",
        drawn: false,
      };
      edges.push(edge);
      for (const id of [ids[i], ids[j]]) {
        const list = incident.get(id) ?? [];
        list.push(edge);
        incident.set(id, list);
      }
    }
  }

  // Drawn-in-full rule, printable in one sentence: a tie is drawn in full
  // when it rests on at least one specific actor and its actors appear
  // together in fewer than UBIQ files, or when it is among the K
  // strongest ties of either file. Ties resting on ubiquitous names
  // alone are hairlines unless top-K. Strong: df ≤ STRONG_DF.
  const drawnKeys = new Set<string>();
  for (const [, list] of incident) {
    const top = [...list].sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key)).slice(0, K);
    for (const e of top) drawnKeys.add(e.key);
  }
  for (const e of edges) {
    if (e.df <= STRONG_DF) e.cls = "strong";
    else if ((e.specificActors.length > 0 && e.df < UBIQ) || drawnKeys.has(e.key)) e.cls = "full";
    else e.cls = "hairline";
    e.drawn = e.cls !== "hairline";
  }

  // Nodes.
  const nodes: TieNode[] = [];
  const isolatedIds: string[] = [];
  const isolated: IsolatedFile[] = [];
  for (const id of ids) {
    const c = civById.get(id)!;
    const list = incident.get(id) ?? [];
    if (list.length === 0) {
      isolatedIds.push(id);
      isolated.push({ id, name: c.name, entries: entries.get(id) ?? 0 });
      continue;
    }
    let best: TieEdge | null = null;
    for (const e of list) if (!best || e.weight > best.weight || (e.weight === best.weight && e.key < best.key)) best = e;
    const other = best ? (best.source === id ? best.target : best.source) : null;
    nodes.push({
      id,
      name: c.name,
      category: c.category,
      status: c.status,
      entries: entries.get(id) ?? 0,
      confirmed: confirmedCivs.has(id),
      degree: list.filter((e) => e.drawn).length,
      degreeAll: list.length,
      strongest:
        best && other
          ? { other, otherName: civById.get(other)?.name ?? other, weight: best.weight, edgeKey: best.key }
          : null,
    });
  }

  // Components over all ties.
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    (adj.get(e.source) ?? adj.set(e.source, new Set()).get(e.source)!).add(e.target);
    (adj.get(e.target) ?? adj.set(e.target, new Set()).get(e.target)!).add(e.source);
  }
  const seen = new Set<string>();
  const components: string[][] = [];
  for (const n of nodes) {
    if (seen.has(n.id)) continue;
    const comp: string[] = [];
    const stack = [n.id];
    while (stack.length) {
      const x = stack.pop()!;
      if (seen.has(x)) continue;
      seen.add(x);
      comp.push(x);
      for (const y of adj.get(x) ?? []) if (!seen.has(y)) stack.push(y);
    }
    comp.sort();
    components.push(comp);
  }
  components.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));

  // Situations: union-find over binding ties (df ≤ BIND_DF).
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let p = parent.get(x) ?? x;
    while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p;
    parent.set(x, p);
    return p;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    // deterministic: the lexically smaller root wins
    if (ra < rb) parent.set(rb, ra);
    else parent.set(ra, rb);
  };
  const bindingEdges = edges.filter((e) => e.df <= BIND_DF);
  for (const e of bindingEdges) union(e.source, e.target);
  const groups = new Map<string, string[]>();
  for (const e of bindingEdges) {
    for (const id of [e.source, e.target]) {
      const root = find(id);
      const g = groups.get(root) ?? [];
      if (!g.includes(id)) g.push(id);
      groups.set(root, g);
    }
  }
  const situations: Situation[] = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    members.sort();
    const memberSet = new Set(members);
    const tally = new Map<string, number>();
    for (const id of members) for (const a of actorsByCiv.get(id) ?? []) tally.set(a, (tally.get(a) ?? 0) + 1);
    const naming = [...tally.entries()]
      .filter(([a]) => !isUbiq(a))
      .map(([a, c]) => ({ a, c, lift: c / (civsByActor.get(a)?.size ?? 1) }))
      .sort((p, q) => q.lift - p.lift || q.c - p.c || p.a.localeCompare(q.a))
      .slice(0, 2);
    if (naming.length === 0) continue; // the record cannot name it
    // Self-check: a union-find chain can stitch clusters together; if the
    // two most particular actors cover fewer than half the members, two
    // names cannot stand for the group and it is not a situation.
    const namingSet = new Set(naming.map((x) => x.a));
    let covered = 0;
    for (const id of members) {
      const set = actorsByCiv.get(id) ?? new Set<string>();
      for (const a of namingSet) if (set.has(a)) { covered++; break; }
    }
    if (covered / members.length < SITUATION_COVERAGE) continue;
    let strongestDf = Infinity;
    for (const e of bindingEdges)
      if (memberSet.has(e.source) && memberSet.has(e.target)) strongestDf = Math.min(strongestDf, e.df);
    const actors = naming.map((x) => spelling.get(x.a) ?? x.a);
    situations.push({
      key: String(djb2(members.join(","))),
      name: actors.join(" / "),
      actors,
      members,
      size: members.length,
      strongestDf: strongestDf === Infinity ? BIND_DF : strongestDf,
    });
  }
  situations.sort((a, b) => b.size - a.size || a.strongestDf - b.strongestDf || a.key.localeCompare(b.key));

  const order = [...nodes]
    .sort((a, b) => b.degree - a.degree || b.degreeAll - a.degreeAll || a.id.localeCompare(b.id))
    .map((n) => n.id);

  const ubiquitousActors = [...civsByActor.entries()]
    .filter(([, s]) => s.size >= UBIQ)
    .map(([a, s]) => ({ actor: spelling.get(a) ?? a, files: s.size }))
    .sort((a, b) => b.files - a.files || a.actor.localeCompare(b.actor));

  return {
    nodes,
    edges: edges.sort((a, b) => a.key.localeCompare(b.key)),
    order,
    isolatedIds,
    isolated,
    situations,
    bindDf: BIND_DF,
    components,
    ubiqThreshold: UBIQ,
    ubiquitousActors,
    strongDf: STRONG_DF,
    topK: K,
    maxDf,
    counts: {
      files: nodes.length,
      ties: edges.length,
      drawn: edges.filter((e) => e.drawn).length,
      strong: edges.filter((e) => e.cls === "strong").length,
      hairline: edges.filter((e) => !e.drawn).length,
      ubiquitousOnly: edges.filter((e) => e.specificActors.length === 0).length,
      withoutTies: isolatedIds.length,
    },
  };
}

// --------------------------------------------------------------- cadence

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
  const day = x.getUTCDay();
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
    return lb.localeCompare(la) || a.id.localeCompare(b.id);
  });
  return { rows: rows.slice(0, maxRows), weekStarts, max };
}

// --------------------------------------------------------------- origins
//
// The seat model. A file's origin is the headquarters of its party of
// record — the first located organisation in its ranked actor list. A
// PLACE is a (city, country); a SEAT is a place, or a group of places
// within CLUSTER_KM in one country, drawn at the headquarters of the
// party that placed most of its files — coordinates are never averaged,
// so a mark never drifts. Ties are aggregated by seat pair. A tie
// endpoint with no files is never a seat. Unplaced files are grouped by
// the reason the job recorded.

export const CLUSTER_KM = 100;

export interface OriginParty {
  actorId: string;
  name: string;
  files: number;
  provenance: OriginProvenance;
  provenanceRef?: string;
}
export interface ProvenanceTally { curated: number; wikidata: number; inferred: number }
export type CategoryTally = Record<Category, number>;

export interface OriginPlace {
  key: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  civs: Civilization[];
  parties: OriginParty[];
  provenance: ProvenanceTally;
  categories: CategoryTally;
}
export interface OriginSeat {
  key: string; // the lead place's key
  name: string; // "San Francisco +6"
  city: string;
  country: string;
  lat: number;
  lng: number;
  members: OriginPlace[]; // lead first
  civs: Civilization[];
  files: number;
  parties: OriginParty[]; // merged across members, files desc
  provenance: ProvenanceTally;
  categories: CategoryTally;
  cited: boolean; // no inferred placements here
  mixed: boolean; // inferred and cited placements together
  pairKeys: string[];
}
export interface OriginPair {
  key: string;
  from: OriginSeat;
  to: OriginSeat | TieOnlySeat;
  civs: Civilization[];
  partyPairs: Array<{ a: string; b: string; n: number }>;
}
export interface TieOnlySeat {
  key: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  civs: Civilization[]; // files whose second party sits here
  tieOnly: true;
}
export interface UnplacedGroup {
  reason: UnplacedReason;
  civs: Civilization[];
}
export interface Origins {
  seats: OriginSeat[]; // files desc, then key
  pairs: OriginPair[]; // files desc, then key
  tieOnly: TieOnlySeat[];
  withinSeat: number; // files whose second party sits in the same seat
  unplaced: UnplacedGroup[];
  pending: Civilization[]; // never visited by the origins job
  surveyedAt: string | null;
  placedAt: Map<string, string>; // civ id → seat key
  byCountry: Array<{ country: string; files: number }>;
  counts: {
    placed: number;
    seats: number;
    places: number;
    clusteredPlaces: number; // places sharing a mark with a lead
    unplaced: number;
    pending: number;
    byReason: Record<UnplacedReason, number>;
  };
  nMax: number; // files at the largest seat
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLng = toR(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function normaliseCity(s: string): string {
  return s
    .toLowerCase()
    .replace(/,?\s*d\.?\s*c\.?$/, "")
    .replace(/\s+/g, " ")
    .trim();
}
function placeKey(o: Origin): string {
  return `${normaliseCity(o.city ?? "")}|${(o.country ?? "").toUpperCase()}`;
}

const emptyCategories = (): CategoryTally => ({ coordination: 0, security: 0, community: 0, speculative: 0 });
const emptyProvenance = (): ProvenanceTally => ({ curated: 0, wikidata: 0, inferred: 0 });

// The party that placed a file: the job's record when present, else the
// first non-excluded located sponsor. One function, used by page and plate.
export function placingSponsor(co: CivilizationOrigin): Sponsor | null {
  if (co.placedBy) {
    const s = co.sponsors.find((x) => x.actorId === co.placedBy!.actorId);
    if (s) return s;
    return { actorId: co.placedBy.actorId, actorName: co.placedBy.actorName, mentions: co.placedBy.mentions, origin: co.origin };
  }
  return co.sponsors.find((s) => !s.excluded && s.origin && s.origin.provenance !== "unplaced") ?? null;
}
function located(o: Origin | undefined): o is Origin & { lat: number; lng: number } {
  return (
    !!o &&
    o.provenance !== "unplaced" &&
    typeof o.lat === "number" &&
    typeof o.lng === "number" &&
    Number.isFinite(o.lat) &&
    Number.isFinite(o.lng)
  );
}

export function buildOrigins(civs: Civilization[]): Origins {
  const sorted = [...civs].sort((a, b) => a.id.localeCompare(b.id));
  type PlaceAcc = OriginPlace & { coordVotes: Map<string, { lat: number; lng: number; n: number }> };
  const places = new Map<string, PlaceAcc>();
  const unplacedBy = new Map<UnplacedReason, Civilization[]>();
  const pending: Civilization[] = [];
  let surveyedAt: string | null = null;
  const placedParty = new Map<string, Sponsor>(); // civ id → placing sponsor

  for (const c of sorted) {
    const co = c.origin;
    if (!co) { pending.push(c); continue; }
    if (co.updatedAt && (!surveyedAt || co.updatedAt > surveyedAt)) surveyedAt = co.updatedAt;
    const party = placingSponsor(co);
    const o = party?.origin ?? co.origin;
    if (!party || !located(o)) {
      const reason: UnplacedReason =
        co.reason ?? (co.sponsors.length === 0 ? "no-organisation" : "not-located");
      const list = unplacedBy.get(reason) ?? [];
      if (!unplacedBy.has(reason)) unplacedBy.set(reason, list);
      list.push(c);
      continue;
    }
    placedParty.set(c.id, party);
    const key = placeKey(o);
    const p: PlaceAcc =
      places.get(key) ??
      {
        key,
        city: o.city ?? "—",
        country: (o.country ?? "—").toUpperCase(),
        lat: o.lat,
        lng: o.lng,
        civs: [],
        parties: [],
        provenance: emptyProvenance(),
        categories: emptyCategories(),
        coordVotes: new Map(),
      };
    places.set(key, p);
    p.civs.push(c);
    p.categories[c.category]++;
    if (o.provenance === "curated" || o.provenance === "wikidata" || o.provenance === "inferred") p.provenance[o.provenance]++;
    const pk = party.actorId;
    const existing = p.parties.find((x) => x.actorId === pk);
    if (existing) existing.files++;
    else p.parties.push({ actorId: pk, name: party.actorName, files: 1, provenance: o.provenance, ...(o.provenanceRef && { provenanceRef: o.provenanceRef }) });
    const v = p.coordVotes.get(pk) ?? { lat: o.lat, lng: o.lng, n: 0 };
    v.n++;
    p.coordVotes.set(pk, v);
  }

  // A place is drawn at the headquarters of the party that placed most of
  // its files — never an average.
  for (const p of places.values()) {
    p.parties.sort((a, b) => b.files - a.files || a.name.localeCompare(b.name));
    const lead = p.parties[0];
    const v = lead ? p.coordVotes.get(lead.actorId) : undefined;
    if (v) { p.lat = v.lat; p.lng = v.lng; }
  }

  // Seats: places within CLUSTER_KM in one country share a mark at the
  // lead place's coordinates.
  const orderedPlaces = [...places.values()].sort((a, b) => b.civs.length - a.civs.length || a.key.localeCompare(b.key));
  const seats: OriginSeat[] = [];
  const seatOfPlace = new Map<string, OriginSeat>();
  for (const p of orderedPlaces) {
    const home = seats.find((s) => s.country === p.country && haversineKm(s, p) <= CLUSTER_KM);
    if (home) {
      home.members.push(p);
      seatOfPlace.set(p.key, home);
    } else {
      const seat: OriginSeat = {
        key: p.key,
        name: p.city,
        city: p.city,
        country: p.country,
        lat: p.lat,
        lng: p.lng,
        members: [p],
        civs: [],
        files: 0,
        parties: [],
        provenance: emptyProvenance(),
        categories: emptyCategories(),
        cited: true,
        mixed: false,
        pairKeys: [],
      };
      seats.push(seat);
      seatOfPlace.set(p.key, seat);
    }
  }
  const placedAt = new Map<string, string>();
  for (const s of seats) {
    const partyMap = new Map<string, OriginParty>();
    for (const m of s.members) {
      s.civs.push(...m.civs);
      for (const c of m.civs) placedAt.set(c.id, s.key);
      s.provenance.curated += m.provenance.curated;
      s.provenance.wikidata += m.provenance.wikidata;
      s.provenance.inferred += m.provenance.inferred;
      for (const k of Object.keys(s.categories) as Category[]) s.categories[k] += m.categories[k];
      for (const p of m.parties) {
        const e = partyMap.get(p.actorId);
        if (e) e.files += p.files;
        else partyMap.set(p.actorId, { ...p });
      }
    }
    s.files = s.civs.length;
    s.parties = [...partyMap.values()].sort((a, b) => b.files - a.files || a.name.localeCompare(b.name));
    s.name = s.members.length > 1 ? `${s.city} +${s.members.length - 1}` : s.city;
    s.cited = s.provenance.inferred === 0;
    s.mixed = s.provenance.inferred > 0 && s.provenance.curated + s.provenance.wikidata > 0;
    s.civs.sort((a, b) => a.id.localeCompare(b.id));
  }
  seats.sort((a, b) => b.files - a.files || a.key.localeCompare(b.key));

  // Pairs: a file whose first and second parties sit in different seats.
  const pairMap = new Map<string, OriginPair>();
  const tieOnlyMap = new Map<string, TieOnlySeat>();
  let withinSeat = 0;
  for (const c of sorted) {
    const co = c.origin;
    const first = placedParty.get(c.id);
    const fromKey = placedAt.get(c.id);
    if (!co || !first || !fromKey) continue;
    const fromSeat = seatOfPlace.get(fromKey) ?? seats.find((s) => s.key === fromKey);
    if (!fromSeat) continue;
    const second = co.sponsors.find((s) => s.actorId !== first.actorId && !s.excluded && located(s.origin));
    if (!second || !located(second.origin)) continue;
    const toPlaceKey = placeKey(second.origin);
    const toSeat = seatOfPlace.get(toPlaceKey);
    if (toSeat && toSeat.key === fromSeat.key) { withinSeat++; continue; }
    let to: OriginSeat | TieOnlySeat;
    if (toSeat) to = toSeat;
    else {
      const t: TieOnlySeat =
        tieOnlyMap.get(toPlaceKey) ??
        {
          key: toPlaceKey,
          city: second.origin.city ?? "—",
          country: (second.origin.country ?? "—").toUpperCase(),
          lat: second.origin.lat,
          lng: second.origin.lng,
          civs: [],
          tieOnly: true as const,
        };
      tieOnlyMap.set(toPlaceKey, t);
      t.civs.push(c);
      to = t;
    }
    const key = [fromSeat.key, to.key].sort().join("|");
    const pair: OriginPair =
      pairMap.get(key) ?? { key, from: fromSeat, to, civs: [], partyPairs: [] };
    pairMap.set(key, pair);
    pair.civs.push(c);
    const pp = pair.partyPairs.find((x) => x.a === first.actorName && x.b === second.actorName);
    if (pp) pp.n++;
    else pair.partyPairs.push({ a: first.actorName, b: second.actorName, n: 1 });
    if (!fromSeat.pairKeys.includes(key)) fromSeat.pairKeys.push(key);
    if (!("tieOnly" in to) && !to.pairKeys.includes(key)) to.pairKeys.push(key);
  }
  const pairs = [...pairMap.values()].sort((a, b) => b.civs.length - a.civs.length || a.key.localeCompare(b.key));
  for (const p of pairs) p.partyPairs.sort((a, b) => b.n - a.n || a.a.localeCompare(b.a));

  const reasons: UnplacedReason[] = ["not-located", "no-organisation", "no-actors"];
  const unplaced: UnplacedGroup[] = reasons
    .filter((r) => (unplacedBy.get(r) ?? []).length > 0)
    .map((r) => ({ reason: r, civs: unplacedBy.get(r)! }));
  const byReason: Record<UnplacedReason, number> = {
    "no-actors": unplacedBy.get("no-actors")?.length ?? 0,
    "no-organisation": unplacedBy.get("no-organisation")?.length ?? 0,
    "not-located": unplacedBy.get("not-located")?.length ?? 0,
  };
  const byCountryMap = new Map<string, number>();
  for (const s of seats) byCountryMap.set(s.country, (byCountryMap.get(s.country) ?? 0) + s.files);
  const byCountry = [...byCountryMap.entries()]
    .map(([country, files]) => ({ country, files }))
    .sort((a, b) => b.files - a.files || a.country.localeCompare(b.country));
  const placed = seats.reduce((n, s) => n + s.files, 0);

  return {
    seats,
    pairs,
    tieOnly: [...tieOnlyMap.values()].sort((a, b) => a.key.localeCompare(b.key)),
    withinSeat,
    unplaced,
    pending,
    surveyedAt,
    placedAt,
    byCountry,
    counts: {
      placed,
      seats: seats.length,
      places: places.size,
      clusteredPlaces: places.size - seats.length,
      unplaced: byReason["no-actors"] + byReason["no-organisation"] + byReason["not-located"],
      pending: pending.length,
      byReason,
    },
    nMax: seats[0]?.files ?? 1,
  };
}

// --------------------------------------------------------------- utilities

// Deterministic PRNG so plates lay out the same way every visit.
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

export function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}
