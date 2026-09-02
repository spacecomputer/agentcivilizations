"use client";
import { useEffect, useMemo, useState } from "react";
import type {
  ActorRegistryEntry,
  Category,
  Civilization,
  Event,
} from "@agent-civilizations/schema";
import { activeCivilizations, allEvents, actorRegistryAll } from "@/lib/queries";
import { buildCadence, buildOrigins, buildTies } from "@/lib/survey";
import { TiesPlate } from "@/components/survey/TiesPlate";
import { CadencePlate } from "@/components/survey/CadencePlate";
import { OriginsPlate } from "@/components/survey/OriginsPlate";
import { CategoryLabel } from "@/components/Glyph";
import { CivSeal } from "@/components/CivSeal";
import { utcDay } from "@/lib/format";

// The Survey — the register's atlas leaf. Three plates drawn from the
// public ledger, each with its ruled-table twin beneath it: the table is
// what a screen reader gets, what a phone gets, and what a reader who
// wants numbers rather than pictures gets.

const CATEGORIES: Category[] = ["coordination", "security", "community", "speculative"];

function ProvenanceMark({ p, ref: r }: { p: string; ref?: string }) {
  if (p === "wikidata" && r?.startsWith("wikidata:")) {
    const q = r.slice("wikidata:".length);
    return (
      <a className={`prov ${p}`} href={`https://www.wikidata.org/wiki/${q}`} target="_blank" rel="noreferrer noopener">
        WIKIDATA {q}
      </a>
    );
  }
  return <span className={`prov ${p}`}>{p.toUpperCase()}</span>;
}

export default function SurveyPage() {
  const [civs, setCivs] = useState<Civilization[] | null>(null);
  const [events, setEvents] = useState<Event[] | null>(null);
  const [registry, setRegistry] = useState<ActorRegistryEntry[]>([]);
  const [cats, setCats] = useState<Set<Category>>(new Set(CATEGORIES));
  const [confirmedOnly, setConfirmedOnly] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    Promise.all([activeCivilizations(400), allEvents(), actorRegistryAll().catch(() => [])])
      .then(([c, e, r]) => {
        setCivs(c);
        setEvents(e);
        setRegistry(r);
      })
      .catch(() => setFailed(true));
  }, []);

  const filtered = useMemo(() => {
    if (!civs || !events) return null;
    const keepCiv = new Set(civs.filter((c) => cats.has(c.category)).map((c) => c.id));
    const ev = events.filter(
      (e) => keepCiv.has(e.civilizationId) && (!confirmedOnly || e.confidence === "confirmed"),
    );
    const civIds = new Set(ev.map((e) => e.civilizationId));
    const cv = civs.filter((c) => keepCiv.has(c.id) && (confirmedOnly ? civIds.has(c.id) : true));
    return { civs: cv, events: ev };
  }, [civs, events, cats, confirmedOnly]);

  const ties = useMemo(() => (filtered ? buildTies(filtered.civs, filtered.events) : null), [filtered]);
  const cadence = useMemo(() => (filtered ? buildCadence(filtered.civs, filtered.events) : null), [filtered]);
  const origins = useMemo(() => (filtered ? buildOrigins(filtered.civs) : null), [filtered]);

  const strongestTie = useMemo(() => {
    if (!ties) return new Map<string, { other: string; actors: string[] }>();
    const m = new Map<string, { other: string; actors: string[]; w: number }>();
    for (const e of ties.edges) {
      for (const [a, b] of [
        [e.source, e.target],
        [e.target, e.source],
      ]) {
        const cur = m.get(a);
        if (!cur || e.weight > cur.w) m.set(a, { other: b, actors: e.actors, w: e.weight });
      }
    }
    return m;
  }, [ties]);

  const toggleCat = (c: Category) =>
    setCats((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  const registryById = useMemo(() => new Map(registry.map((r) => [r.id, r])), [registry]);
  const sponsorsRanked = useMemo(
    () =>
      [...registry]
        .filter((r) => r.kind !== "publication")
        .sort((a, b) => b.civilizationCount - a.civilizationCount || b.eventCount - a.eventCount)
        .slice(0, 40),
    [registry],
  );

  return (
    <>
      <span className="kicker caps">The Survey · atlas leaf of the register</span>
      <h1>The Survey</h1>
      <p className="preamble">
        Three plates drawn from the public ledger. Where the files&apos; sponsors sit; which files are
        bound to one another by the actors they share; and how each file has been keeping time. Every
        plate is an inference from entries already in the register — the register itself is unchanged
        by anything on this page.
      </p>

      {failed && <p className="dim">The survey could not be drawn. The register is unaffected.</p>}
      {!failed && !filtered && <p className="dim mono">Surveying the register…</p>}

      {filtered && ties && cadence && origins && (
        <>
          <div className="filter-checklist" role="group" aria-label="Filter the survey">
            {CATEGORIES.map((c) => (
              <label key={c}>
                <input type="checkbox" checked={cats.has(c)} onChange={() => toggleCat(c)} />
                <CategoryLabel category={c} />
              </label>
            ))}
            <label>
              <input type="checkbox" checked={confirmedOnly} onChange={(e) => setConfirmedOnly(e.target.checked)} />
              <span className="mono">CONFIRMED ENTRIES ONLY</span>
            </label>
          </div>

          {/* ---------------- Plate I ---------------- */}
          <section className="plate" aria-labelledby="plate-1">
            <div className="plate-head">
              <h2 id="plate-1">Plate I — Origins</h2>
              <span className="mono dim">
                {origins.points.reduce((n, p) => n + p.civs.length, 0)} FILES PLACED ·{" "}
                {origins.unplaced.length} UNPLACED · {origins.pending.length} NOT YET SURVEYED
              </span>
            </div>
            <div className="plate-figure">
              <OriginsPlate origins={origins} />
            </div>
            <p className="plate-note">
              A file sits at the headquarters of its dominant sponsor — the named organisation its
              entries mention most. Filled marks are cited: a curated seed or a Wikidata headquarters
              claim. Hollow marks are the model&apos;s inference. Bronze ties join the two sponsors of a
              multi-origin file. Sponsor is not perpetrator: a file placed at San Francisco is a file
              whose entries <em>name</em> a San Francisco sponsor. Publications are sources of record,
              never sponsors, and place nothing.
            </p>

            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>City</th>
                    <th>Country</th>
                    <th>Files</th>
                    <th>Provenance</th>
                    <th>Files placed here</th>
                  </tr>
                </thead>
                <tbody>
                  {origins.points.map((p) => (
                    <tr key={p.key}>
                      <td>{p.city}</td>
                      <td className="mono">{p.country}</td>
                      <td className="mono">{p.civs.length}</td>
                      <td>
                        <span className={`prov ${p.provenance}`}>{p.provenance.toUpperCase()}</span>
                      </td>
                      <td>
                        {p.civs.slice(0, 6).map((c, i) => (
                          <span key={c.id}>
                            {i > 0 && ", "}
                            <a href={`/civilization?id=${encodeURIComponent(c.id)}`}>{c.name}</a>
                          </span>
                        ))}
                        {p.civs.length > 6 && <span className="dim"> +{p.civs.length - 6} more</span>}
                      </td>
                    </tr>
                  ))}
                  {origins.points.length === 0 && (
                    <tr>
                      <td colSpan={5} className="dim">
                        No files placed yet. The origins survey runs nightly at 01:00 UTC.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {origins.unplaced.length > 0 && (
              <details>
                <summary className="mono dim">
                  UNPLACED — {origins.unplaced.length} {origins.unplaced.length === 1 ? "file" : "files"} whose sponsors could not be located
                </summary>
                <p className="plate-note">
                  {origins.unplaced.map((c, i) => (
                    <span key={c.id}>
                      {i > 0 && " · "}
                      <a href={`/civilization?id=${encodeURIComponent(c.id)}`}>{c.name}</a>
                    </span>
                  ))}
                </p>
              </details>
            )}

            {sponsorsRanked.length > 0 && (
              <>
                <h3>Sponsors of record</h3>
                <div className="tablewrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Sponsor</th>
                        <th>Kind</th>
                        <th>Headquarters</th>
                        <th>Files</th>
                        <th>Entries</th>
                        <th>Provenance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sponsorsRanked.map((r) => (
                        <tr key={r.id}>
                          <td>
                            {r.homepage ? (
                              <a href={r.homepage} target="_blank" rel="noreferrer noopener">
                                {r.name}
                              </a>
                            ) : (
                              r.name
                            )}
                          </td>
                          <td className="mono">{r.kind}</td>
                          <td>
                            {r.origin.provenance === "unplaced"
                              ? <span className="dim">—</span>
                              : `${r.origin.city ?? "—"}, ${r.origin.country ?? "—"}`}
                          </td>
                          <td className="mono">{r.civilizationCount}</td>
                          <td className="mono">{r.eventCount}</td>
                          <td>
                            <ProvenanceMark p={r.origin.provenance} ref={r.origin.provenanceRef} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          {/* ---------------- Plate II ---------------- */}
          <section className="plate" aria-labelledby="plate-2">
            <div className="plate-head">
              <h2 id="plate-2">Plate II — Ties</h2>
              <span className="mono dim">
                {ties.nodes.length} FILES · {ties.edges.length} TIES · {ties.isolated} STANDING ALONE
              </span>
            </div>
            <div className="plate-figure">
              <TiesPlate ties={ties} />
            </div>
            <p className="plate-note">
              Two files are tied when their entries share at least two named actors — the same test
              cross-civilization corroboration applies. Tie strength discounts ubiquitous actors: a
              sponsor named in eighty files binds weakly; one named in three binds tightly. Mark size
              follows entry count; a filled mark holds confirmed entries, a hollow one only candidates;
              a dashed ring is a dormant file. Hover a tie to read the shared actors; a mark opens the file.
            </p>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Ties</th>
                    <th>Entries</th>
                    <th>Strongest tie</th>
                    <th>Shared actors</th>
                  </tr>
                </thead>
                <tbody>
                  {[...ties.nodes]
                    .sort((a, b) => b.degree - a.degree || b.eventCount - a.eventCount)
                    .slice(0, 40)
                    .map((n) => {
                      const st = strongestTie.get(n.id);
                      return (
                        <tr key={n.id}>
                          <td>
                            <span className="civrow-name">
                              <CivSeal id={n.id} category={n.category} size={22} />
                              <a className="rowlink" href={`/civilization?id=${encodeURIComponent(n.id)}`}>
                                {n.name}
                              </a>
                            </span>
                          </td>
                          <td className="mono">{n.degree}</td>
                          <td className="mono">{n.eventCount}</td>
                          <td>
                            {st ? <a href={`/civilization?id=${encodeURIComponent(st.other)}`}>{st.other}</a> : "—"}
                          </td>
                          <td className="dim">{st ? st.actors.join(", ") : "—"}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </section>

          {/* ---------------- Plate III ---------------- */}
          <section className="plate" aria-labelledby="plate-3">
            <div className="plate-head">
              <h2 id="plate-3">Plate III — Cadence</h2>
              <span className="mono dim">
                {cadence.rows.length} FILES · {cadence.weekStarts.length} WEEKS ·{" "}
                {cadence.weekStarts[0]} — {utcDay(new Date().toISOString())}
              </span>
            </div>
            <div className="plate-figure">
              <CadencePlate cadence={cadence} />
            </div>
            <p className="plate-note">
              One bar per week of entries, by date of occurrence, sorted by most recent entry. Bar height
              is square-root scaled against the busiest week on the plate so a single loud week does not
              flatten every quiet one. Empty weeks are left empty.
            </p>
          </section>

          <div className="rule-double" />
          <p className="mono dim" style={{ fontSize: 12 }}>
            SURVEY DRAWN IN THIS BROWSER FROM {filtered.events.length} ENTRIES ACROSS {filtered.civs.length} FILES ·{" "}
            SPONSOR REGISTRY {registryById.size} ENTRIES · ORIGINS REVISED NIGHTLY 01:00 UTC
          </p>
        </>
      )}
    </>
  );
}
