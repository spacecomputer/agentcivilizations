"use client";
import { useEffect, useMemo, useState } from "react";
import { allCivilizationsPaged } from "@/lib/queries";
import { CivSeal } from "@/components/CivSeal";
import { Stamp } from "@/components/Stamp";
import { CategoryLabel } from "@/components/Glyph";
import { ClockPlates } from "@/components/catalog/ClockPlates";
import { Lifeline, LifelineAxis } from "@/components/catalog/Lifeline";
import { utcDay, fileName } from "@/lib/format";
import {
  buildCatalog,
  sortRows,
  DORMANT_AFTER_DAYS,
  ERAS,
  EXTINCT_AFTER_DAYS,
  SORTS,
  type Axis,
  type CatalogRow,
  type SortKey,
} from "@/lib/catalog";
import type { Category, Civilization, CivilizationStatus } from "@agent-civilizations/schema";

// The catalog of files.
//
// Every file is an archival record with a span in the world and a history
// in the register, and this page shows both without letting them blur.
// The lifeline column puts all 292 spans on one axis so the catalog reads
// as a chronicle rather than a list; the two plates above it keep the
// occurrence clock and the record clock apart; and every threshold the
// page applies is printed beside the column it governs.

const CATEGORIES: Category[] = ["coordination", "security", "community", "speculative"];
const STATUSES: CivilizationStatus[] = ["active", "dormant", "extinct"];

export default function CivilizationsPage() {
  const [civs, setCivs] = useState<Civilization[] | null>(null);
  const [limited, setLimited] = useState(false);
  const [failed, setFailed] = useState(false);
  // Oldest first by default: read top to bottom and the catalog is a
  // chronicle. The first screen is the handful of files from 2018 to 2024,
  // which is the scale story the plates above summarise.
  const [sort, setSort] = useState<SortKey>("opened");
  const [desc, setDesc] = useState(false);
  const [cats, setCats] = useState<Set<Category>>(new Set(CATEGORIES));
  const [states, setStates] = useState<Set<CivilizationStatus>>(new Set(STATUSES));
  const [eras, setEras] = useState<Set<string>>(new Set(ERAS.map((e) => e.key)));
  const [query, setQuery] = useState("");
  const [now] = useState(() => new Date().toISOString());

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    allCivilizationsPaged(5000)
      .then((r) => {
        if (cancelled) return;
        setCivs(r.civs);
        setLimited(r.limited);
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        setCivs([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The whole catalog, for the plates and the counts: they describe the
  // record, not the reader's current filter.
  const all = useMemo(() => (civs && civs.length ? buildCatalog(civs, now) : null), [civs, now]);

  // The filtered set, with its own axis: narrowing the era rescales the
  // lifelines, which is how a reader zooms without a broken axis.
  const view = useMemo(() => {
    if (!all) return null;
    const q = query.trim().toLowerCase();
    const kept = all.rows.filter(
      (r) =>
        cats.has(r.civ.category) &&
        states.has(r.civ.status) &&
        eras.has(r.era.key) &&
        (!q || fileName(r.civ.id, r.civ.name).toLowerCase().includes(q) || r.civ.id.toLowerCase().includes(q)),
    );
    const civsKept = kept.map((r) => r.civ);
    const rebuilt = civsKept.length ? buildCatalog(civsKept, now) : null;
    return { rows: sortRows(kept, sort, desc), axis: rebuilt?.axis ?? all.axis, entries: kept.reduce((n, r) => n + r.civ.eventCount, 0) };
  }, [all, cats, states, eras, query, sort, desc, now]);

  const toggle = <T,>(set: Set<T>, v: T, apply: (s: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    if (next.size === 0) return; // never leave the catalog empty by accident
    apply(next);
  };

  const maxEntries = all ? Math.max(1, ...all.rows.map((r) => r.civ.eventCount)) : 1;
  const filtering =
    cats.size < CATEGORIES.length || states.size < STATUSES.length || eras.size < ERAS.length || query.trim() !== "";

  return (
    <>
      <span className="caps kicker">The catalog of files</span>
      <h1>Civilizations</h1>
      <p className="preamble">
        Persistent agent groupings, each kept as an archival file: opened when its
        first entry occurred, ruled off when it falls silent. The register keeps two
        clocks and this page keeps them apart — when a file&apos;s entries{" "}
        <em>happened</em>, and when the register got to them.
      </p>
      <div className="rule-double" />

      {civs === null && <p className="mono dim">retrieving the catalog…</p>}
      {failed && (
        <p className="dim">
          The catalog could not be read just now. The register is unaffected.
        </p>
      )}
      {!failed && civs !== null && civs.length === 0 && (
        <p className="mono dim">No files opened yet.</p>
      )}

      {all && view && (
        <div>
          <div className="catalog-head mono dim">
            {all.counts.files} FILES · {all.counts.entries} ENTRIES ·{" "}
            {all.counts.confirmed} CONFIRMED · {all.counts.candidate} CANDIDATE ·{" "}
            {all.counts.byStatus.active} ACTIVE · {all.counts.byStatus.dormant} DORMANT ·{" "}
            {all.counts.byStatus.extinct} EXTINCT · EARLIEST ENTRY{" "}
            {utcDay(all.axis.from)} · {all.counts.singletons} FILES HOLD ONE ENTRY
          </div>

          <ClockPlates catalog={all} />

          <h2 className="catalog-h2">The eras</h2>
          <div className="tablewrap">
            <table>
              <caption className="sr-only">Files and entries by the era in which their first entry occurred</caption>
              <thead>
                <tr>
                  <th>Era</th>
                  <th className="num">Files</th>
                  <th className="num">Entries</th>
                  <th>Category mix</th>
                </tr>
              </thead>
              <tbody>
                {all.counts.byEra.map(({ era, n, entries }) => {
                  const sub = all.rows.filter((r) => r.era.key === era.key);
                  return (
                    <tr key={era.key} className={eras.has(era.key) ? undefined : "filtered"}>
                      <td className="mono">{era.label}</td>
                      <td className="num mono">{n}</td>
                      <td className="num mono">{entries}</td>
                      <td>
                        {CATEGORIES.map((c) => {
                          const k = sub.filter((r) => r.civ.category === c).length;
                          if (!k) return null;
                          return (
                            <span key={c} style={{ marginRight: "10px" }}>
                              <CategoryLabel category={c} /> <span className="mono dim">{k}</span>
                            </span>
                          );
                        })}
                        {n === 0 && <span className="dim">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <h2 className="catalog-h2">The catalog</h2>
          <div className="catalog-controls mono">
            <div className="ctl-row">
              <span className="ctl-label">ERA</span>
              {ERAS.map((e) => (
                <button
                  key={e.key}
                  type="button"
                  className={`ctl${eras.has(e.key) ? " on" : ""}`}
                  aria-pressed={eras.has(e.key)}
                  onClick={() => toggle(eras, e.key, setEras)}
                >
                  {e.label}
                </button>
              ))}
            </div>
            <div className="ctl-row">
              <span className="ctl-label">CATEGORY</span>
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`ctl${cats.has(c) ? " on" : ""}`}
                  aria-pressed={cats.has(c)}
                  onClick={() => toggle(cats, c, setCats)}
                >
                  {c.toUpperCase()}
                </button>
              ))}
              <span className="ctl-label">STATUS</span>
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`ctl${states.has(s) ? " on" : ""}`}
                  aria-pressed={states.has(s)}
                  onClick={() => toggle(states, s, setStates)}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="ctl-row">
              <label>
                <span className="ctl-label">FIND A FILE</span>
                <input
                  type="search"
                  value={query}
                  placeholder="name or call number"
                  aria-label="Find a file by name or call number"
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <span className="ctl-label">SORT</span>
              {SORTS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className={`ctl${sort === s.key ? " on" : ""}`}
                  aria-pressed={sort === s.key}
                  onClick={() => (sort === s.key ? setDesc(!desc) : (setSort(s.key), setDesc(true)))}
                >
                  {s.label}
                  {sort === s.key && (desc ? " ↓" : " ↑")}
                </button>
              ))}
            </div>
          </div>

          <p className="mono dim catalog-foot">
            SHOWING {view.rows.length} OF {all.counts.files} FILES · {view.entries} ENTRIES
            {filtering && " · FILTERED"}{limited && " · CATALOG TRUNCATED AT THE FETCH LIMIT"} · SPAN AXIS {utcDay(view.axis.from)} TO{" "}
            {utcDay(view.axis.to)} · DORMANT AFTER {DORMANT_AFTER_DAYS} DAYS OF SILENCE ·
            RULED OFF AFTER {EXTINCT_AFTER_DAYS}
          </p>

          {view.rows.length === 0 ? (
            <p className="mono dim">No file matches that filter.</p>
          ) : (
            <div className="tablewrap">
              <table className="catalog-table">
                <caption className="sr-only">
                  Every file, with its span in occurrence time and its history in the register
                </caption>
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th className="num">Entries</th>
                    <th>
                      Span
                      <span className="th-axis">
                        <LifelineAxis axis={view.axis} />
                      </span>
                    </th>
                    <th className="num">Recorded after</th>
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((r) => (
                    <Row key={r.civ.id} row={r} axis={view.axis} maxEntries={maxEntries} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function Row({ row, axis, maxEntries }: { row: CatalogRow; axis: Axis; maxEntries: number }) {
  const c = row.civ;
  const w = Math.max(2, Math.round((44 * c.eventCount) / maxEntries));
  return (
    <tr>
      <td>
        <span className="civrow-name">
          <CivSeal id={c.id} category={c.category} size={34} />
          <span>
            <a className="rowlink" href={`/civilization/${encodeURIComponent(c.id)}`}>
              {fileName(c.id, c.name)}
            </a>
            <br />
            <span className="mono dim" style={{ fontSize: "12px" }}>
              FILE {c.id.toUpperCase()}
            </span>
          </span>
        </span>
      </td>
      <td>
        <CategoryLabel category={c.category} />
      </td>
      <td>
        <Stamp status={c.status} closedAt={c.lastEventAt} />
        {c.status !== "active" && (
          <span className="mono dim" style={{ display: "block", fontSize: "12px" }}>
            SILENT {row.silentDays} DAYS
          </span>
        )}
      </td>
      <td className="num mono entries-cell">
        <span className="entries-bar" style={{ width: `${w}px` }} aria-hidden="true" />
        <span className="entries-n">{c.eventCount}</span>
        <span className="mono dim entries-split">
          {row.confirmed} OF {c.eventCount} CONFIRMED
        </span>
      </td>
      <td className="span-cell">
        <Lifeline row={row} axis={axis} />
        <span className="mono dim span-dates">
          {utcDay(row.from)}
          {row.spanDays > 0 && <> → {utcDay(row.to)} · {row.spanDays}d</>}
        </span>
      </td>
      <td className="num mono">
        {row.lagDays === null ? <span className="dim">—</span> : row.lagDays === 0 ? "same day" : `${row.lagDays}d`}
      </td>
    </tr>
  );
}
