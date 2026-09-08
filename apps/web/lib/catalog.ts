"use client";
// The catalog model.
//
// The register keeps two clocks and this page exists to keep them apart.
//
//   OCCURRENCE  when the entries in a file actually happened. Spans years:
//               the earliest entry occurred in 2018. This is the clock a
//               reader means by "when did this civilization exist".
//   RECORD      when the register wrote them. Spans days, because the
//               register opened on 2026-09-01. This is the clock that says
//               how much of the world we have got to yet.
//
// Growth measured on the occurrence clock is not growth in the world: the
// register's sensitivity changed the day it switched on, so a curve drawn
// across that date reads as an explosion when much of it is the scanner
// starting. Every series here therefore declares which clock it is on, and
// the coverage series carries the register's own opening as a marked
// boundary rather than a hidden one.

import type { Category, Civilization, CivilizationStatus } from "@agent-civilizations/schema";
import { DORMANT_AFTER_DAYS, EXTINCT_AFTER_DAYS, SOURCE_CHANGELOG } from "@agent-civilizations/schema";

export { DORMANT_AFTER_DAYS, EXTINCT_AFTER_DAYS };

/** The day the register opened and began observing as events happened. */
export const REGISTER_OPENED = "2026-09-01";

export const DAY = 86_400_000;
const day = (iso: string) => iso.slice(0, 10);
const ms = (iso: string) => Date.parse(iso);

// ---- eras -------------------------------------------------------------
// Curated and printed. Half-year granularity once the record thickens,
// coarser before it, because a year with four files is not five bars.
export interface Era {
  key: string;
  label: string;
  from: string; // inclusive
  to: string; // exclusive
}
export const ERAS: Era[] = [
  { key: "pre-2024", label: "BEFORE 2024", from: "0000", to: "2024-01-01" },
  { key: "2024", label: "2024", from: "2024-01-01", to: "2025-01-01" },
  { key: "2025", label: "2025", from: "2025-01-01", to: "2026-01-01" },
  { key: "2026-h1", label: "2026 · FIRST HALF", from: "2026-01-01", to: "2026-07-01" },
  { key: "2026-h2", label: "2026 · SECOND HALF", from: "2026-07-01", to: "9999" },
];
export function eraOf(iso: string): Era {
  const d = day(iso);
  return ERAS.find((e) => d >= e.from && d < e.to) ?? ERAS[ERAS.length - 1];
}

// ---- a row of the catalog ---------------------------------------------
export interface CatalogRow {
  civ: Civilization;
  /** Occurrence clock: when the file's entries happened. */
  from: string;
  to: string;
  spanDays: number;
  era: Era;
  /** Record clock: when the register opened the file, and last wrote to it. */
  openedAt: string | null;
  lastRecordedAt: string | null;
  /** Days between the first entry occurring and the register recording it. */
  lagDays: number | null;
  confirmed: number;
  candidate: number;
  /** Days of silence in occurrence time — what status is derived from. */
  silentDays: number;
}

export interface Bucket {
  key: string; // ISO day or month
  label: string;
  n: number;
}

export interface Axis {
  from: string;
  to: string;
  /** Position of an ISO date in the axis, 0 to 1. Clamped. */
  at: (iso: string) => number;
  /** Year gridlines inside the domain, as positions with labels. */
  ticks: Array<{ at: number; label: string }>;
}

export interface Catalog {
  rows: CatalogRow[];
  axis: Axis;
  /** Files by month of first occurrence — the OCCURRENCE clock. */
  coverage: Bucket[];
  /** Files by the day the register opened them — the RECORD clock. */
  intake: Bucket[];
  /** Where the register's own opening falls inside the coverage series. */
  registerOpenedIndex: number;
  /**
   * Every dated change to the source list, positioned in the coverage
   * series. Each one is a step change in what the register could see, so
   * each is drawn: a trend read across an unmarked one is not a trend.
   */
  sourceChanges: Array<{ date: string; note: string; index: number }>;
  counts: {
    files: number;
    entries: number;
    confirmed: number;
    candidate: number;
    byStatus: Record<CivilizationStatus, number>;
    byCategory: Record<Category, number>;
    byEra: Array<{ era: Era; n: number; entries: number }>;
    singletons: number;
    observedLive: number; // opened by the register within a week of occurring
  };
}

function makeAxis(from: string, to: string): Axis {
  const a = ms(from);
  const b = Math.max(ms(to), a + DAY);
  const at = (iso: string) => Math.min(1, Math.max(0, (ms(iso) - a) / (b - a)));
  const ticks: Array<{ at: number; label: string }> = [];
  const y0 = new Date(a).getUTCFullYear();
  const y1 = new Date(b).getUTCFullYear();
  // A tick per year while that stays legible, else per half-decade.
  const step = y1 - y0 > 12 ? 5 : 1;
  for (let y = y0 + 1; y <= y1; y += step) {
    const iso = `${y}-01-01T00:00:00.000Z`;
    if (ms(iso) < a || ms(iso) > b) continue;
    ticks.push({ at: at(iso), label: String(y) });
  }
  return { from, to, at, ticks };
}

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const yEnd = Number(to.slice(0, 4));
  const mEnd = Number(to.slice(5, 7));
  // A guard, not a limit: a domain this long means the data is wrong.
  for (let i = 0; i < 2400 && (y < yEnd || (y === yEnd && m <= mEnd)); i++) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = ms(from); t <= ms(to) && out.length < 400; t += DAY) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

export function buildCatalog(civs: Civilization[], nowIso: string): Catalog {
  const rows: CatalogRow[] = civs.map((civ) => {
    // lastEventAt is the MAXIMUM occurrence after the catalog pass, but a
    // document written before that pass may still be inverted; showing a
    // negative span would be worse than ordering the pair.
    const a = civ.firstSeenAt <= civ.lastEventAt ? civ.firstSeenAt : civ.lastEventAt;
    const b = civ.firstSeenAt <= civ.lastEventAt ? civ.lastEventAt : civ.firstSeenAt;
    const confirmed = civ.confirmedCount ?? 0;
    return {
      civ,
      from: a,
      to: b,
      spanDays: Math.round((ms(b) - ms(a)) / DAY),
      era: eraOf(a),
      openedAt: civ.openedAt ?? null,
      lastRecordedAt: civ.lastRecordedAt ?? null,
      lagDays: civ.openedAt ? Math.round((ms(civ.openedAt) - ms(a)) / DAY) : null,
      confirmed,
      candidate: civ.candidateCount ?? Math.max(0, civ.eventCount - confirmed),
      silentDays: Math.round((ms(nowIso) - ms(b)) / DAY),
    };
  });

  const from = rows.reduce((m, r) => (r.from < m ? r.from : m), rows[0]?.from ?? nowIso);
  const to = rows.reduce((m, r) => (r.to > m ? r.to : m), rows[0]?.to ?? nowIso);
  const axis = makeAxis(from, nowIso > to ? nowIso : to);

  // Coverage — the occurrence clock, one bucket per month.
  const covCount = new Map<string, number>();
  for (const r of rows) covCount.set(r.from.slice(0, 7), (covCount.get(r.from.slice(0, 7)) ?? 0) + 1);
  const coverage: Bucket[] = monthsBetween(from.slice(0, 7), (nowIso > to ? nowIso : to).slice(0, 7)).map((k) => ({
    key: k,
    label: k,
    n: covCount.get(k) ?? 0,
  }));
  const registerOpenedIndex = coverage.findIndex((b) => b.key === REGISTER_OPENED.slice(0, 7));
  const sourceChanges = SOURCE_CHANGELOG.map((c) => ({
    date: c.date,
    note: c.note,
    index: coverage.findIndex((b) => b.key === c.date.slice(0, 7)),
  })).filter((c) => c.index >= 0);

  // Intake — the record clock, one bucket per day the register has run.
  const intCount = new Map<string, number>();
  for (const r of rows) if (r.openedAt) intCount.set(day(r.openedAt), (intCount.get(day(r.openedAt)) ?? 0) + 1);
  const firstRecord = rows.reduce<string | null>(
    (m, r) => (r.openedAt && (m === null || r.openedAt < m) ? r.openedAt : m),
    null,
  );
  const intake: Bucket[] = firstRecord
    ? daysBetween(day(firstRecord), day(nowIso)).map((k) => ({ key: k, label: k.slice(5), n: intCount.get(k) ?? 0 }))
    : [];

  const byStatus = { active: 0, dormant: 0, extinct: 0 } as Record<CivilizationStatus, number>;
  const byCategory = { coordination: 0, security: 0, community: 0, speculative: 0 } as Record<Category, number>;
  for (const r of rows) {
    byStatus[r.civ.status]++;
    byCategory[r.civ.category]++;
  }
  const byEra = ERAS.map((era) => {
    const sub = rows.filter((r) => r.era.key === era.key);
    return { era, n: sub.length, entries: sub.reduce((n, r) => n + r.civ.eventCount, 0) };
  });

  return {
    rows,
    axis,
    coverage,
    intake,
    registerOpenedIndex,
    sourceChanges,
    counts: {
      files: rows.length,
      entries: rows.reduce((n, r) => n + r.civ.eventCount, 0),
      confirmed: rows.reduce((n, r) => n + r.confirmed, 0),
      candidate: rows.reduce((n, r) => n + r.candidate, 0),
      byStatus,
      byCategory,
      byEra,
      singletons: rows.filter((r) => r.civ.eventCount === 1).length,
      observedLive: rows.filter((r) => r.lagDays !== null && r.lagDays <= 7).length,
    },
  };
}

// ---- sorting ----------------------------------------------------------
export type SortKey = "opened" | "last" | "entries" | "span" | "name" | "status" | "lag";
export const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "opened", label: "OPENED" },
  { key: "last", label: "LAST ENTRY" },
  { key: "entries", label: "ENTRIES" },
  { key: "span", label: "SPAN" },
  { key: "lag", label: "RECORDED AFTER" },
  { key: "status", label: "STATUS" },
  { key: "name", label: "NAME" },
];
const STATUS_ORDER: Record<CivilizationStatus, number> = { active: 0, dormant: 1, extinct: 2 };

export function sortRows(rows: CatalogRow[], key: SortKey, desc: boolean): CatalogRow[] {
  const dir = desc ? -1 : 1;
  const cmp: Record<SortKey, (a: CatalogRow, b: CatalogRow) => number> = {
    opened: (a, b) => a.from.localeCompare(b.from),
    last: (a, b) => a.to.localeCompare(b.to),
    entries: (a, b) => a.civ.eventCount - b.civ.eventCount,
    span: (a, b) => a.spanDays - b.spanDays,
    lag: (a, b) => (a.lagDays ?? -1) - (b.lagDays ?? -1),
    status: (a, b) => STATUS_ORDER[a.civ.status] - STATUS_ORDER[b.civ.status],
    name: (a, b) => a.civ.name.localeCompare(b.civ.name),
  };
  // Ties break on id so the order never depends on fetch order.
  return [...rows].sort((a, b) => dir * cmp[key](a, b) || a.civ.id.localeCompare(b.civ.id));
}
