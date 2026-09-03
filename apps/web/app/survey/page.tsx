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
import {
  TiesPlate,
  MarkSample,
  TieSample,
  type Reading,
} from "@/components/survey/TiesPlate";
import { CadencePlate } from "@/components/survey/CadencePlate";
import { OriginsPlate } from "@/components/survey/OriginsPlate";
import { CategoryLabel } from "@/components/Glyph";
import { CivSeal } from "@/components/CivSeal";
import { callNumber, utcDay } from "@/lib/format";

// The Survey — the register's atlas leaf. Three plates drawn from the
// public ledger, each with its ruled-table twin beneath it: the table is
// what a screen reader gets, what a phone gets, and what a reader who
// wants numbers rather than pictures gets.

const CATEGORIES: Category[] = ["coordination", "security", "community", "speculative"];
const TIES_TABLE_FIRST = 60;

function ProvenanceMark({ p, pref }: { p: string; pref?: string }) {
  if (p === "wikidata" && pref?.startsWith("wikidata:")) {
    const q = pref.slice("wikidata:".length);
    return (
      <a className={`prov ${p}`} href={`https://www.wikidata.org/wiki/${q}`} target="_blank" rel="noreferrer noopener">
        WIKIDATA {q}
      </a>
    );
  }
  return <span className={`prov ${p}`}>{p.toUpperCase()}</span>;
}

function fileHref(id: string) {
  return `/civilization?id=${encodeURIComponent(id)}`;
}

export default function SurveyPage() {
  const [civs, setCivs] = useState<Civilization[] | null>(null);
  const [events, setEvents] = useState<Event[] | null>(null);
  const [registry, setRegistry] = useState<ActorRegistryEntry[]>([]);
  const [cats, setCats] = useState<Set<Category>>(new Set(CATEGORIES));
  const [confirmedOnly, setConfirmedOnly] = useState(false);
  const [hideFiltered, setHideFiltered] = useState(false);
  const [drawHairlines, setDrawHairlines] = useState(true);
  const [failed, setFailed] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [reading, setReading] = useState<Reading>(null);

  useEffect(() => {
    Promise.all([activeCivilizations(400), allEvents(), actorRegistryAll().catch(() => [])])
      .then(([c, e, r]) => {
        setCivs(c);
        setEvents(e);
        setRegistry(r);
      })
      .catch(() => setFailed(true));
  }, []);

  // Plates I and III follow the filter; Plate II is laid out once from the
  // unfiltered ledger and restyled (confirmed-only changes the predicate,
  // so it carries its own seeded layout).
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

  const tiesAll = useMemo(() => (civs && events ? buildTies(civs, events) : null), [civs, events]);
  const tiesConfirmed = useMemo(
    () => (civs && events ? buildTies(civs, events.filter((e) => e.confidence === "confirmed")) : null),
    [civs, events],
  );
  const ties = confirmedOnly ? tiesConfirmed : tiesAll;
  const kept = useMemo(
    () => new Set((ties?.nodes ?? []).filter((n) => cats.has(n.category)).map((n) => n.id)),
    [ties, cats],
  );
  const filtering = cats.size < CATEGORIES.length;

  const cadence = useMemo(() => (filtered ? buildCadence(filtered.civs, filtered.events) : null), [filtered]);
  const origins = useMemo(() => (filtered ? buildOrigins(filtered.civs) : null), [filtered]);

  const toggleCat = (c: Category) =>
    setCats((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  const sponsorsRanked = useMemo(
    () =>
      [...registry]
        .filter((r) => r.kind !== "publication")
        .sort((a, b) => b.civilizationCount - a.civilizationCount || b.eventCount - a.eventCount || a.id.localeCompare(b.id))
        .slice(0, 40),
    [registry],
  );

  const nodeById = useMemo(() => new Map((ties?.nodes ?? []).map((n) => [n.id, n])), [ties]);
  const civById = useMemo(() => new Map((civs ?? []).map((c) => [c.id, c])), [civs]);
  const readNode = reading?.kind === "node" ? reading.id : null;
  const nearIds = useMemo(() => {
    if (!ties || !readNode) return new Set<string>();
    const s = new Set<string>();
    for (const e of ties.edges) {
      if (e.source === readNode) s.add(e.target);
      else if (e.target === readNode) s.add(e.source);
    }
    return s;
  }, [ties, readNode]);

  const tiesSorted = useMemo(
    () => (ties ? [...ties.edges].sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key)) : []),
    [ties],
  );
  const hairlineCount = ties ? ties.edges.filter((e) => !e.drawn).length : 0;
  const hairlineCap = ties ? 4 * ties.nodes.length : 0;

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
            {filtering && (
              <label>
                <input type="checkbox" checked={hideFiltered} onChange={(e) => setHideFiltered(e.target.checked)} />
                <span className="mono">HIDE FILTERED ({ties.nodes.length - kept.size})</span>
              </label>
            )}
            {hairlineCount > hairlineCap && (
              <label>
                <input type="checkbox" checked={drawHairlines} onChange={(e) => setDrawHairlines(e.target.checked)} />
                <span className="mono">DRAW HAIRLINE TIES ({hairlineCount})</span>
              </label>
            )}
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
                <caption className="sr-only">Files by sponsor headquarters</caption>
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
                            <a href={fileHref(c.id)}>{c.name}</a>
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
                      <a href={fileHref(c.id)}>{c.name}</a>
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
                    <caption className="sr-only">Sponsors of record, by files named</caption>
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
                            <ProvenanceMark p={r.origin.provenance} pref={r.origin.provenanceRef} />
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
                {ties.counts.files} FILES · {ties.counts.ties} TIES · {ties.counts.drawn} DRAWN IN FULL ·{" "}
                {ties.counts.withoutTies} WITHOUT TIES
                {filtering && ` · ${kept.size} MATCH THE FILTER`}
              </span>
            </div>

            <div className="plate-key mono" id="plate-2-key">
              <span className="key-group">
                <span className="key-item"><span className="sr-only">; </span><MarkSample confirmed /> HOLDS CONFIRMED ENTRIES</span>
                <span className="key-item"><span className="sr-only">; </span><MarkSample confirmed={false} /> CANDIDATES ONLY</span>
                <span className="key-item"><span className="sr-only">; </span><MarkSample confirmed={false} dormant /> DORMANT OR EXTINCT</span>
                <span className="key-item"><span className="sr-only">; </span>SIZE · ENTRIES</span>
              </span>
              <span className="key-group">
                <span className="key-item"><span className="sr-only">; </span><TieSample cls="strong" /> STRONG · ACTORS TOGETHER IN {ties.strongDf} FILES OR FEWER</span>
                <span className="key-item"><span className="sr-only">; </span><TieSample cls="full" /> DRAWN IN FULL · A SPECIFIC ACTOR, TOGETHER IN FEWER THAN {ties.ubiqThreshold} FILES, OR AMONG A FILE&apos;S {ties.topK} STRONGEST</span>
                <span className="key-item"><span className="sr-only">; </span><TieSample cls="hairline" /> HAIRLINE · UBIQUITOUS NAMES ONLY, OR TOGETHER IN {ties.ubiqThreshold} FILES OR MORE</span>
              </span>
              <span className="key-group">
                {CATEGORIES.map((c) => (
                  <span className="key-item" key={c}><CategoryLabel category={c} /></span>
                ))}
              </span>
            </div>

            <div className="plate-figure">
              <TiesPlate
                ties={ties}
                kept={kept}
                hideFiltered={hideFiltered}
                drawHairlines={drawHairlines}
                highlight={highlight}
                onReading={setReading}
              />
            </div>

            <p className="plate-note" id="plate-2-note">
              Two files are tied when their entries share at least two named actors — the test
              cross-civilization corroboration applies. A tie&apos;s strength is the number of files in which
              its shared actors appear together: together in two files binds tightly; together in{" "}
              {ties.maxDf} binds weakly. {ties.ubiquitousActors.map((u) => u.actor).join(", ")}{" "}
              {ties.ubiquitousActors.length === 1 ? "is" : "are"} each named in {ties.ubiqThreshold} or more
              files and count as ubiquitous; {ties.counts.ubiquitousOnly} of {ties.counts.ties} ties rest on
              ubiquitous names alone. A tie is drawn in full when it rests on at least one specific actor and its
              actors appear together in fewer than {ties.ubiqThreshold} files, or when it is among the{" "}
              {ties.topK} strongest ties of either file; the other {ties.counts.hairline} are hairlines. Distance on the plate is not a measure. Mark a
              file — point at it, or press Tab and then the arrow keys — to read its record and its ties
              beneath the plate; the tables carry every file and every tie.
            </p>

            <div id="plate-2-tables">
              <h3>Gazetteer of tied files</h3>
              <div className="tablewrap">
                <table>
                  <caption className="sr-only">
                    Every file with at least one tie, ordered by ties drawn in full
                  </caption>
                  <thead>
                    <tr>
                      <th>File</th>
                      <th>Category</th>
                      <th>Entries</th>
                      <th>Ties</th>
                      <th>Strongest tie</th>
                      <th>Shared actors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ties.order.map((id) => {
                      const n = nodeById.get(id)!;
                      const st = n.strongest;
                      const stEdge = st ? ties.edges.find((e) => e.key === st.edgeKey) : null;
                      const isReading = readNode === id;
                      const isNear = nearIds.has(id);
                      return (
                        <tr
                          key={id}
                          data-id={id}
                          className={isReading ? "is-reading" : isNear ? "is-near" : undefined}
                          aria-current={isReading ? "true" : undefined}
                          onMouseEnter={() => setHighlight(id)}
                          onMouseLeave={() => setHighlight(null)}
                          onFocusCapture={() => setHighlight(id)}
                          onBlurCapture={() => setHighlight(null)}
                        >
                          <td>
                            <span className="civrow-name">
                              <CivSeal id={id} category={n.category} size={22} />
                              <span>
                                <a className="rowlink" href={fileHref(id)}>{n.name}</a>
                                <span className="mono dim" style={{ display: "block", fontSize: 12 }}>
                                  {callNumber(id)}
                                </span>
                              </span>
                            </span>
                          </td>
                          <td><CategoryLabel category={n.category} /></td>
                          <td className="mono">{n.entries}</td>
                          <td className="mono">{n.degree} / {n.degreeAll}</td>
                          <td>{st ? <a href={fileHref(st.other)}>{st.otherName}</a> : "—"}</td>
                          <td>
                            {stEdge ? (
                              <>
                                {stEdge.specificActors.map((a, i) => (
                                  <span key={`s${i}`}>{i > 0 && ", "}<span className="tie-actor">{a}</span></span>
                                ))}
                                {stEdge.ubiquitousActors.map((a, i) => (
                                  <span key={`u${i}`}>{(i > 0 || stEdge.specificActors.length > 0) && ", "}<span className="tie-actor-ubiq">{a}</span></span>
                                ))}
                              </>
                            ) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <h3>Ties of record</h3>
              <div className="tablewrap">
                <table>
                  <caption className="sr-only">Every tie, strongest first</caption>
                  <thead>
                    <tr>
                      <th>File</th>
                      <th>File</th>
                      <th>Together in</th>
                      <th>Drawn</th>
                      <th>Shared actors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tiesSorted.slice(0, TIES_TABLE_FIRST).map((e) => (
                      <TieRow key={e.key} e={e} nodeById={nodeById} civById={civById} setHighlight={setHighlight} />
                    ))}
                  </tbody>
                </table>
                {tiesSorted.length > TIES_TABLE_FIRST && (
                  <details>
                    <summary className="mono dim">
                      THE REMAINING {tiesSorted.length - TIES_TABLE_FIRST} TIES
                    </summary>
                    <table>
                      <tbody>
                        {tiesSorted.slice(TIES_TABLE_FIRST).map((e) => (
                          <TieRow key={e.key} e={e} nodeById={nodeById} civById={civById} setHighlight={setHighlight} />
                        ))}
                      </tbody>
                    </table>
                  </details>
                )}
              </div>
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
            SURVEY DRAWN IN THIS BROWSER FROM {events!.length} ENTRIES ACROSS {civs!.length} FILES ·{" "}
            SPONSOR REGISTRY {registry.length} ENTRIES · ORIGINS REVISED NIGHTLY 01:00 UTC
          </p>
        </>
      )}
    </>
  );
}

function TieRow({
  e,
  nodeById,
  civById,
  setHighlight,
}: {
  e: ReturnType<typeof buildTies>["edges"][number];
  nodeById: Map<string, ReturnType<typeof buildTies>["nodes"][number]>;
  civById: Map<string, Civilization>;
  setHighlight: (v: string | null) => void;
}) {
  const nameOf = (id: string) => nodeById.get(id)?.name ?? civById.get(id)?.name ?? id;
  return (
    <tr
      data-tie={e.key}
      onMouseEnter={() => setHighlight(e.key)}
      onMouseLeave={() => setHighlight(null)}
      onFocusCapture={() => setHighlight(e.key)}
      onBlurCapture={() => setHighlight(null)}
    >
      <td><a href={fileHref(e.source)}>{nameOf(e.source)}</a></td>
      <td><a href={fileHref(e.target)}>{nameOf(e.target)}</a></td>
      <td className="mono">{e.df} files</td>
      <td className="mono">{e.cls.toUpperCase()}</td>
      <td>
        {e.specificActors.map((a, i) => (
          <span key={`s${i}`}>{i > 0 && ", "}<span className="tie-actor">{a}</span></span>
        ))}
        {e.ubiquitousActors.map((a, i) => (
          <span key={`u${i}`}>{(i > 0 || e.specificActors.length > 0) && ", "}<span className="tie-actor-ubiq">{a}</span></span>
        ))}
      </td>
    </tr>
  );
}
