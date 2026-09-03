"use client";
import { useEffect, useMemo, useState } from "react";
import type {
  ActorRegistryEntry,
  Category,
  Civilization,
  Event,
} from "@agent-civilizations/schema";
import { allCivilizationsPaged, allEvents, actorRegistryAll } from "@/lib/queries";
import { buildCadence, buildTies } from "@/lib/survey";
import {
  TiesPlate,
  MarkSample,
  TieSample,
  type Reading,
} from "@/components/survey/TiesPlate";
import { CadencePlate } from "@/components/survey/CadencePlate";
import {
  OriginsPlate,
  SeatSample,
  ReferenceCircles,
  OriginTieSample,
  seatSlug,
  type OriginReading,
  type OriginLayoutInfo,
} from "@/components/survey/OriginsPlate";
import { buildOrigins as _buildOrigins, placingSponsor, CLUSTER_KM } from "@/lib/survey";
import { floorFiles, fmtLat, fmtLng, TIE_STRONG_FILES, PAIR_CAPTION_MIN } from "@/lib/origins-layout";
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
  const [originHighlight, setOriginHighlight] = useState<string | null>(null);
  const [originReading, setOriginReading] = useState<OriginReading>(null);
  const [layout, setLayout] = useState<OriginLayoutInfo | null>(null);
  const onLayout = useMemo(() => (info: OriginLayoutInfo) => setLayout(info), []);

  const [civsLimited, setCivsLimited] = useState(false);
  useEffect(() => {
    Promise.all([allCivilizationsPaged(), allEvents(), actorRegistryAll().catch(() => [])])
      .then(([c, e, r]) => {
        setCivs(c.civs);
        setCivsLimited(c.limited);
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
  // Plate I is laid out once from the whole surveyed ledger; the filter
  // restyles it through a kept set and never moves a mark.
  const origins = useMemo(() => (civs ? _buildOrigins(civs) : null), [civs]);
  const confirmedCivIds = useMemo(() => new Set((events ?? []).filter((e) => e.confidence === "confirmed").map((e) => e.civilizationId)), [events]);
  const keptFiles = useMemo(
    () => new Set((civs ?? []).filter((c) => cats.has(c.category) && (!confirmedOnly || confirmedCivIds.has(c.id))).map((c) => c.id)),
    [civs, cats, confirmedOnly, confirmedCivIds],
  );
  const originFiltering = cats.size < CATEGORIES.length || confirmedOnly;
  const readSeatKey = originReading?.kind === "seat" ? originReading.key : null;

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
        .sort((a, b) => b.civilizationCount - a.civilizationCount || b.eventCount - a.eventCount || a.id.localeCompare(b.id)),
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
                {origins.counts.placed} FILES PLACED AT {origins.counts.seats} SEATS · {origins.counts.unplaced} UNPLACED
                {origins.counts.unplaced > 0 && (
                  <> — {origins.counts.byReason["not-located"]} PARTY NOT LOCATED · {origins.counts.byReason["no-organisation"]} NO PARTY NAMED{origins.counts.byReason["no-actors"] > 0 && <> · {origins.counts.byReason["no-actors"]} NO ACTORS</>}</>
                )}
                {origins.counts.pending > 0 && <> · {origins.counts.pending} AWAITING THE NIGHTLY SURVEY</>}
                {origins.surveyedAt && <> · SURVEYED {utcDay(origins.surveyedAt)}</>}
                {originFiltering && <> · {origins.seats.reduce((n, st) => n + st.civs.filter((c) => keptFiles.has(c.id)).length, 0)} MATCH THE FILTER</>}
              </span>
            </div>

            {layout && (
              <div className="plate-key mono" id="plate-1-key">
                <span className="key-group">
                  <span className="key-item"><span className="sr-only">; </span><ReferenceCircles K={layout.K} nMax={origins.nMax} /> SIZE · FILES, AREA TRUE · SEATS OF FEWER THAN {floorFiles(layout.K)} FILES DRAWN AT THE MINIMUM</span>
                </span>
                <span className="key-group">
                  <span className="key-item"><span className="sr-only">; </span><SeatSample cited /> FILLED · CITED — CURATED SEED OR WIKIDATA HEADQUARTERS</span>
                  <span className="key-item"><span className="sr-only">; </span><SeatSample cited={false} /> HOLLOW · INFERRED BY THE MODEL, PROVISIONAL</span>
                  <span className="key-item"><span className="sr-only">; </span><SeatSample cited mixed /> DASHED RING · SOME FILES HERE ARE INFERRED</span>
                </span>
                <span className="key-group">
                  <span className="key-item"><span className="sr-only">; </span>TIE · A FILE WHOSE FIRST AND SECOND PARTIES SIT IN TWO SEATS</span>
                  <span className="key-item"><span className="sr-only">; </span><OriginTieSample cls="hairline" /> 1 FILE</span>
                  <span className="key-item"><span className="sr-only">; </span><OriginTieSample cls="full" /> 2–{TIE_STRONG_FILES - 1} FILES</span>
                  <span className="key-item"><span className="sr-only">; </span><OriginTieSample cls="strong" /> {TIE_STRONG_FILES} OR MORE · STRONG, COUNTED FROM {PAIR_CAPTION_MIN}</span>
                </span>
                <span className="key-group">
                  <span className="key-item"><span className="sr-only">; </span>SEATS WITHIN {CLUSTER_KM} KM IN ONE COUNTRY SHARE A MARK</span>
                  <span className="key-item"><span className="sr-only">; </span>BOUNDS {fmtLat(layout.band.s)}–{fmtLat(layout.band.n)} · {fmtLng(layout.band.w)}–{fmtLng(layout.band.e)} · EVERY SEAT AND TIE LIES WITHIN</span>
                  {layout.moved > 0 && (
                    <span className="key-item"><span className="sr-only">; </span>A HAIRLINE LEADS A MOVED MARK TO ITS TRUE POSITION · {layout.moved} MOVED APART THIS RENDER</span>
                  )}
                </span>
                <span className="key-group">
                  {cats.size === 1 ? (
                    <span className="key-item"><span className="sr-only">; </span><CategoryLabel category={[...cats][0]} /> INKED · ONE CATEGORY IN THE FILTER</span>
                  ) : (
                    <span className="key-item"><span className="sr-only">; </span>MARKS CARRY NO CATEGORY · FILTER TO ONE CATEGORY TO INK THE PLATE</span>
                  )}
                </span>
              </div>
            )}

            <div className="plate-figure">
              <OriginsPlate
                origins={origins}
                kept={keptFiles}
                cats={cats}
                hideFiltered={hideFiltered}
                highlight={originHighlight}
                onReading={setOriginReading}
                onLayout={onLayout}
              />
            </div>

            <p className="plate-note" id="plate-1-note">
              A file is placed at the seat of its party of record — the organisation its entries name most,
              taking the first of them that could be located. A product name counts as naming its maker:
              GPT names OpenAI, Claude names Anthropic. Publications are sources of record, never parties,
              and place nothing; people, author groups and protocols are recorded but never place a file.
              Naming is not sponsorship and not blame: a file placed at {origins.seats[0]?.name ?? "a seat"} is a
              file whose entries <em>name</em> an organisation seated there — as maker, target or witness.
              Filled marks are cited, by a curated entry or a Wikidata headquarters claim; hollow marks were
              placed by inference and are provisional; a dashed ring means some files at a seat are
              inferred. A seat is drawn at the headquarters of the party that placed most of its files; places
              within {CLUSTER_KM} km in one country share a mark. A line joins a file&apos;s first seat to its
              second where two named parties sit apart; its weight is the number of files.
              {origins.seats[0] && (
                <>
                  {" "}{origins.seats[0].files} of {origins.counts.placed} placed files sit at {origins.seats[0].name}
                  {origins.seats[0].parties.length >= 2 && (
                    <>, {origins.seats[0].parties[0].files + origins.seats[0].parties[1].files} of them by {origins.seats[0].parties[0].name} or {origins.seats[0].parties[1].name}</>
                  )}.
                </>
              )}{" "}
              Filtering restyles the plate; a file&apos;s seat does not depend on its entries&apos; confidence, so
              CONFIRMED ENTRIES ONLY marks which files are corroborated without moving any. Mark a seat — point
              at it, or press Tab and then the arrow keys — to read its parties beneath the plate; the tables
              carry every seat, every party and every file.
            </p>

            <div id="plate-1-tables">
              <h3>Seats of the parties of record</h3>
              <div className="tablewrap">
                <table>
                  <caption className="sr-only">Seats, largest first, with parties, provenance and category tallies</caption>
                  <thead>
                    <tr>
                      <th>Seat</th>
                      <th>Country</th>
                      <th>Files</th>
                      <th>Parties</th>
                      <th>Provenance</th>
                      <th>Categories</th>
                      <th>Ties</th>
                    </tr>
                  </thead>
                  <tbody>
                    {origins.seats.map((st) => {
                      const nKept = st.civs.filter((c) => keptFiles.has(c.id)).length;
                      const isReading = readSeatKey === st.key;
                      return (
                        <tr
                          key={st.key}
                          id={`seat-${seatSlug(st.key)}`}
                          data-seat={st.key}
                          tabIndex={-1}
                          className={`${isReading ? "is-reading" : ""}${nKept === 0 && originFiltering ? " filtered" : ""}`.trim() || undefined}
                          aria-current={isReading ? "true" : undefined}
                          onMouseEnter={() => setOriginHighlight(st.key)}
                          onMouseLeave={() => setOriginHighlight(null)}
                          onFocusCapture={() => setOriginHighlight(st.key)}
                          onBlurCapture={() => setOriginHighlight(null)}
                        >
                          <td>
                            <span className="rowlink">{st.name}</span>
                            {st.members.length > 1 && (
                              <span className="mono dim" style={{ display: "block", fontSize: 12 }}>
                                {st.members.map((m) => `${m.city} ${m.civs.length}`).join(" · ")}
                              </span>
                            )}
                          </td>
                          <td className="mono">{st.country}</td>
                          <td className="mono">{originFiltering && nKept !== st.files ? `${nKept} of ${st.files}` : st.files}</td>
                          <td>
                            {st.parties.slice(0, 3).map((p, i) => (
                              <span key={p.actorId}>{i > 0 && ", "}{p.name} <span className="mono dim">{p.files}</span></span>
                            ))}
                            {st.parties.length > 3 && <span className="dim"> +{st.parties.length - 3}</span>}
                          </td>
                          <td className="mono">
                            <span className="prov curated">CURATED {st.provenance.curated}</span>
                            {st.provenance.wikidata > 0 && <> <span className="prov wikidata">WIKIDATA {st.provenance.wikidata}</span></>}
                            {st.provenance.inferred > 0 && <> <span className="prov inferred">INFERRED {st.provenance.inferred}</span></>}
                          </td>
                          <td>
                            {(Object.keys(st.categories) as Category[]).filter((k) => st.categories[k] > 0).map((k, i) => (
                              <span key={k}>{i > 0 && " "}<CategoryLabel category={k} /> <span className="mono dim">{st.categories[k]}</span></span>
                            ))}
                          </td>
                          <td className="mono">{st.pairKeys.length}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <details>
                <summary className="mono dim">EVERY PLACED FILE, BY SEAT ({origins.counts.placed})</summary>
                <div className="tablewrap">
                  <table>
                    <caption className="sr-only">Every placed file with the party that placed it</caption>
                    <thead>
                      <tr><th>File</th><th>Category</th><th>Seat</th><th>Placed by</th><th>Provenance</th></tr>
                    </thead>
                    <tbody>
                      {origins.seats.flatMap((st) =>
                        st.civs.map((c) => {
                          const co = c.origin!;
                          const by = co.placedBy;
                          const sp = placingSponsor(co);
                          const o = sp?.origin ?? co.origin;
                          const rank = by?.rank ?? (sp ? co.sponsors.indexOf(sp) + 1 : 0);
                          const first = co.sponsors[0];
                          return (
                            <tr key={c.id} data-file={c.id} data-seat={st.key} className={originFiltering && !keptFiles.has(c.id) ? "filtered" : undefined}>
                              <td>
                                <span className="civrow-name">
                                  <CivSeal id={c.id} category={c.category} size={22} />
                                  <a className="rowlink" href={fileHref(c.id)}>{c.name}</a>
                                </span>
                              </td>
                              <td><CategoryLabel category={c.category} /></td>
                              <td><a href={`#seat-${seatSlug(st.key)}`}>{st.name}</a></td>
                              <td>
                                {sp?.actorName ?? "—"}{rank > 1 && first && <span className="dim"> · its {rank === 2 ? "2nd" : rank === 3 ? "3rd" : `${rank}th`} party — its 1st, {first.actorName}, is {first.excluded ? `not a party (${first.excluded})` : "unplaced"}</span>}
                              </td>
                              <td>
                                {o.provenance === "wikidata" && o.provenanceRef ? (
                                  <a className="prov wikidata" href={`https://www.wikidata.org/wiki/${o.provenanceRef.replace("wikidata:", "")}`} target="_blank" rel="noreferrer noopener">WIKIDATA {o.provenanceRef.replace("wikidata:", "")}</a>
                                ) : (
                                  <span className={`prov ${o.provenance}`}>{o.provenance.toUpperCase()}</span>
                                )}
                              </td>
                            </tr>
                          );
                        }),
                      )}
                    </tbody>
                  </table>
                </div>
              </details>

              <h3>Ties by seat pair</h3>
              <div className="tablewrap">
                <table>
                  <caption className="sr-only">Files whose first and second parties sit in two seats, by pair</caption>
                  <thead>
                    <tr><th>Seat</th><th>Seat</th><th>Files</th><th>Parties</th><th>Files listed</th></tr>
                  </thead>
                  <tbody>
                    {origins.pairs.map((p) => (
                      <tr
                        key={p.key}
                        data-pair={p.key}
                        onMouseEnter={() => setOriginHighlight(p.key)}
                        onMouseLeave={() => setOriginHighlight(null)}
                      >
                        <td><a href={`#seat-${seatSlug(p.from.key)}`}>{p.from.name}</a></td>
                        <td>{"tieOnly" in p.to ? <span>{p.to.city} <span className="dim">— no file placed here</span></span> : <a href={`#seat-${seatSlug(p.to.key)}`}>{p.to.name}</a>}</td>
                        <td className="mono">{p.civs.length}</td>
                        <td>{p.partyPairs.slice(0, 2).map((x, i) => <span key={i}>{i > 0 && ", "}{x.a} × {x.b} <span className="mono dim">{x.n}</span></span>)}</td>
                        <td>{p.civs.slice(0, 4).map((c, i) => <span key={c.id}>{i > 0 && ", "}<a href={fileHref(c.id)}>{c.name}</a></span>)}{p.civs.length > 4 && <span className="dim"> +{p.civs.length - 4}</span>}</td>
                      </tr>
                    ))}
                    {origins.pairs.length === 0 && <tr><td colSpan={5} className="dim">No file has two located parties in different seats.</td></tr>}
                  </tbody>
                </table>
              </div>

              {origins.unplaced.length > 0 && (
                <div id="plate-1-unplaced">
                  <h3>Unplaced</h3>
                  {origins.unplaced.map((g) => (
                    <div className="tablewrap" key={g.reason}>
                      <table>
                        <caption className="mono dim" style={{ textAlign: "left", padding: "6px 0" }}>
                          {g.reason === "not-located" && <>PARTY NAMED, NOT LOCATED ({g.civs.length})</>}
                          {g.reason === "no-organisation" && <>NO PARTY NAMED ({g.civs.length}) — the entries name people, papers or groups, not an organisation</>}
                          {g.reason === "no-actors" && <>NO ACTORS NAMED ({g.civs.length})</>}
                        </caption>
                        <thead>
                          <tr><th>File</th><th>{g.reason === "not-located" ? "Party named" : "Names in its entries"}</th><th>Category</th></tr>
                        </thead>
                        <tbody>
                          {g.civs.map((c) => {
                            const sponsors = c.origin?.sponsors ?? [];
                            return (
                              <tr key={c.id} data-file={c.id}>
                                <td><a className="rowlink" href={fileHref(c.id)}>{c.name}</a></td>
                                <td className="mono">
                                  {sponsors.slice(0, 4).map((sp, i) => (
                                    <span key={sp.actorId}>{i > 0 && ", "}{sp.actorName}{sp.excluded && <span className="dim"> ({sp.excluded})</span>}{!sp.excluded && (!sp.origin || sp.origin.provenance === "unplaced") && <span className="prov unplaced"> UNPLACED</span>}</span>
                                  ))}
                                  {sponsors.length === 0 && <span className="dim">—</span>}
                                </td>
                                <td><CategoryLabel category={c.category} /></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}

              {sponsorsRanked.length > 0 && (
                <>
                  <h3>Parties of record</h3>
                  <div className="tablewrap">
                    <table>
                      <caption className="sr-only">Parties of record, by files in which they are named</caption>
                      <thead>
                        <tr>
                          <th>Party</th>
                          <th>Kind</th>
                          <th>Seat</th>
                          <th>Files naming it</th>
                          <th>Files placed here</th>
                          <th>Entries</th>
                          <th>Provenance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sponsorsRanked.slice(0, 40).map((r) => <PartyRow key={r.id} r={r} origins={origins} setOriginHighlight={setOriginHighlight} />)}
                      </tbody>
                    </table>
                    {sponsorsRanked.length > 40 && (
                      <details>
                        <summary className="mono dim">THE REMAINING {sponsorsRanked.length - 40} PARTIES</summary>
                        <table>
                          <tbody>
                            {sponsorsRanked.slice(40).map((r) => <PartyRow key={r.id} r={r} origins={origins} setOriginHighlight={setOriginHighlight} />)}
                          </tbody>
                        </table>
                      </details>
                    )}
                  </div>
                </>
              )}
            </div>
          </section>

          {/* ---------------- Plate II ---------------- */}
          <section className="plate" aria-labelledby="plate-2">
            <div className="plate-head">
              <h2 id="plate-2">Plate II — Ties</h2>
              <span className="mono dim">
                {ties.counts.files} FILES · {ties.counts.ties} TIES · {ties.counts.drawn} DRAWN IN FULL ·{" "}
                {ties.counts.withoutTies} WITHOUT TIES · {ties.situations.length} SITUATIONS
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

              <h3>Situations</h3>
              <p className="plate-note">
                A situation is a group of files bound by specific ties — shared actors that appear together
                in {ties.bindDf} files or fewer — named by the two actors most particular to the group. A group
                whose two names cover fewer than half its files is not a situation the record can name, and is
                not listed. Groups are a deterministic function of the ledger and carry no colour and no outline;
                those of three or more files are captioned on the plate where a caption can be placed.
              </p>
              <div className="tablewrap">
                <table>
                  <caption className="sr-only">Situations, largest first</caption>
                  <thead>
                    <tr>
                      <th>Situation</th>
                      <th>Files</th>
                      <th>Tightest binding</th>
                      <th>Members</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ties.situations.map((sit) => (
                      <tr key={sit.key}>
                        <td className="mono">{sit.name.toUpperCase()}</td>
                        <td className="mono">{sit.size}</td>
                        <td className="mono">together in {sit.strongestDf} files</td>
                        <td>
                          {sit.members.map((id, i) => (
                            <span key={id}>
                              {i > 0 && ", "}
                              <a href={fileHref(id)}>{nodeById.get(id)?.name ?? civById.get(id)?.name ?? id}</a>
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))}
                    {ties.situations.length === 0 && (
                      <tr><td colSpan={4} className="dim">No two files are bound by a specific tie yet.</td></tr>
                    )}
                  </tbody>
                </table>
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
            {civsLimited && " · SURVEY LIMITED TO THE 5,000 MOST RECENTLY WRITTEN FILES"}
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

function PartyRow({
  r,
  origins,
  setOriginHighlight,
}: {
  r: ActorRegistryEntry;
  origins: ReturnType<typeof _buildOrigins>;
  setOriginHighlight: (v: string | null) => void;
}) {
  const seat = origins.seats.find((st) => st.parties.some((p) => p.actorId === r.id));
  const placedHere = seat?.parties.find((p) => p.actorId === r.id)?.files ?? 0;
  const excluded = !["lab", "company", "university", "government", "agent-framework"].includes(r.kind);
  return (
    <tr
      data-party={r.id}
      onMouseEnter={() => seat && setOriginHighlight(seat.key)}
      onMouseLeave={() => setOriginHighlight(null)}
    >
      <td>{r.homepage ? <a href={r.homepage} target="_blank" rel="noreferrer noopener">{r.name}</a> : r.name}</td>
      <td className="mono">{r.kind}{r.productOf && <span className="dim"> · of {r.productOf}</span>}</td>
      <td>
        {seat ? (
          <a href={`#seat-${seatSlug(seat.key)}`}>{seat.name}, {seat.country}</a>
        ) : r.origin.provenance === "unplaced" ? (
          <span className="prov unplaced">UNPLACED</span>
        ) : (
          <span className="dim">{r.origin.city ?? "—"}, {r.origin.country ?? "—"} · places no file</span>
        )}
      </td>
      <td className="mono">{r.civilizationCount}</td>
      <td className="mono">{excluded ? <span className="dim">—</span> : placedHere}</td>
      <td className="mono">{r.eventCount}</td>
      <td><ProvenanceMark p={r.origin.provenance} pref={r.origin.provenanceRef} /></td>
    </tr>
  );
}
