"use client";
import { useEffect, useState } from "react";
import {
  event,
  eventByCivSeq,
  eventsRecordedBetween,
  retractedBy,
  rootForDay,
} from "@/lib/queries";
import {
  computeContentHash,
  inclusionProof,
  rootAlgoOf,
  verifyInclusion,
  verifyRoot,
  type InclusionProof,
} from "@agent-civilizations/verify";
import { CategoryLabel } from "@/components/Glyph";
import { HashBlock } from "@/components/HashBlock";
import { Tick } from "@/components/marks";
import { utcStamp } from "@/lib/format";
import type { Event, Root } from "@agent-civilizations/schema";

type RecomputeState =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "match"; computed: string }
  | { phase: "mismatch"; computed: string };

// Source URLs come from the open web via the ingestion pipeline — treat
// them as data. Only http(s) URLs become links; anything else (including
// javascript: and data: schemes) renders as inert text.
function isSafeHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function EventDetail({
  initialEvent,
  id: idProp,
}: {
  initialEvent?: Event | null;
  id?: string | null;
} = {}) {
  // Two ways in. A statically generated page hands the record straight
  // down as a prop, so the built HTML contains the entry itself rather
  // than the word "retrieving" — which is all a crawler used to receive.
  // The query-string route reads the id and fetches, so an entry recorded
  // since the last build is reachable before it has a page of its own.
  //
  // useSearchParams lives in that wrapper, not here: calling it in this
  // component opts the whole subtree out of prerendering, which would
  // hand the crawler back the empty shell this exists to remove.
  const id = initialEvent?.id ?? idProp ?? null;
  const [e, setEvent] = useState<Event | null | undefined>(initialEvent ?? undefined);
  const [prevId, setPrevId] = useState<string | null>(null);
  const [rec, setRec] = useState<RecomputeState>({ phase: "idle" });

  const [supersededBy, setSupersededBy] = useState<Event | null>(null);
  const [inc, setInc] = useState<
    | { phase: "idle" | "running" | "error" }
    | { phase: "unsealed"; day: string }
    | { phase: "mismatch"; day: string }
    | { phase: "resealed"; day: string; root: Root; count: number }
    | { phase: "proved"; day: string; root: Root; proof: InclusionProof }
  >({ phase: "idle" });

  useEffect(() => {
    if (initialEvent) return;
    if (!id) {
      setEvent(null);
      return;
    }
    let cancelled = false;
    event(id).then((evt) => {
      if (cancelled) return;
      setEvent(evt);
      if (evt && evt.seq > 0) {
        eventByCivSeq(evt.civilizationId, evt.seq - 1)
          .then((prev) => !cancelled && setPrevId(prev?.id ?? null))
          .catch(() => {});
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // A retracted entry cannot know it was retracted: the correction is a
  // later entry pointing back. Look forward for it.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    retractedBy(id)
      .then((r) => !cancelled && setSupersededBy(r))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Prove this entry sits inside its day's sealed, Bitcoin-anchored root.
  // The proof is self-verifying: a wrong sibling path cannot fold back to
  // the anchored root, so the register cannot fake one.
  async function proveInclusion() {
    if (!e) return;
    setInc({ phase: "running" });
    try {
      const day = e.recordedAt.slice(0, 10);
      const root = await rootForDay(day);
      if (!root) {
        setInc({ phase: "unsealed", day });
        return;
      }
      const dayEvents = await eventsRecordedBetween(
        `${day}T00:00:00.000Z`,
        `${day}T23:59:59.999Z`,
      );
      const hashes = dayEvents.map((x) => x.contentHash);
      if (rootAlgoOf(root) !== "merkle-v2") {
        // flat-v1 seals the day's set, not one entry's place in it; the
        // honest fallback is to reseal the whole day in the browser.
        const res = await verifyRoot(root, hashes);
        const present = hashes.includes(e.contentHash);
        setInc(
          res.ok && present
            ? { phase: "resealed", day, root, count: hashes.length }
            : { phase: "mismatch", day },
        );
        return;
      }
      const proof = await inclusionProof(hashes, e.contentHash, day);
      if (!proof) {
        setInc({ phase: "mismatch", day });
        return;
      }
      const check = await verifyInclusion(proof, root.merkleRoot);
      setInc(
        check.ok
          ? { phase: "proved", day, root, proof }
          : { phase: "mismatch", day },
      );
    } catch {
      setInc({ phase: "error" });
    }
  }

  async function recompute() {
    if (!e) return;
    setRec({ phase: "running" });
    // computeContentHash derives the preimage itself (contentHash and the
    // mutable confidence field are excluded).
    const computed = await computeContentHash(e);
    setRec(
      computed === e.contentHash
        ? { phase: "match", computed }
        : { phase: "mismatch", computed },
    );
  }

  if (!id) {
    return <p className="mono dim">No record requested. See <a href="/">the register</a>.</p>;
  }
  if (e === undefined) {
    return <p className="mono dim">retrieving the record…</p>;
  }
  if (e === null) {
    return (
      <p className="mono dim">
        The record could not be retrieved. The chain is unaffected.
      </p>
    );
  }

  const candidate = e.confidence === "candidate";

  return (
    <>
      <div className="dmeta" style={{ marginBottom: "10px" }}>
        <CategoryLabel category={e.category} filled={!candidate} />
        <span>{candidate ? "CANDIDATE □" : "CONFIRMED ■"}</span>
        <a href={`/civilization?id=${encodeURIComponent(e.civilizationId)}`}>
          → FILE {e.civilizationId.toUpperCase()}
        </a>
        <span>ENTRY No. {e.seq}</span>
      </div>
      <h1>{e.title}</h1>
      <p className="preamble">{e.summary}</p>
      <div className="dmeta" style={{ marginBottom: "24px" }}>
        <span>OCCURRED {utcStamp(e.occurredAt)}</span>
        <span>RECORDED {utcStamp(e.recordedAt)}</span>
      </div>
      {candidate && (
        <p className="dim" style={{ fontStyle: "italic" }}>
          This entry is provisional and has not met the confirmation standard.
        </p>
      )}
      {!candidate && e.confidencePromotedAt && (
        <p className="dim mono" style={{ fontSize: "12px" }}>
          CONFIRMED {utcStamp(e.confidencePromotedAt)} — corroborating source entered the ledger
          {(e as { corroboratedAcrossCivs?: boolean }).corroboratedAcrossCivs &&
            " · cross-civilization (shared actors)"}
          .
        </p>
      )}

      {e.actors.length > 0 && (
        <>
          <h3>Actors of record</h3>
          <p>{e.actors.join(" · ")}</p>
        </>
      )}

      {e.identifiers && Object.values(e.identifiers).some(Boolean) && (
        <>
          <h3>Identifiers</h3>
          <div className="ident-row">
            {e.identifiers.arxivId && (
              <a
                className="ident-chip"
                href={`https://arxiv.org/abs/${e.identifiers.arxivId}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                <span className="ident-kind">ARXIV</span>{" "}
                <span className="mono">{e.identifiers.arxivId}</span>
              </a>
            )}
            {e.identifiers.doi && (
              <a
                className="ident-chip"
                href={`https://doi.org/${e.identifiers.doi}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                <span className="ident-kind">DOI</span>{" "}
                <span className="mono">{e.identifiers.doi}</span>
              </a>
            )}
            {e.identifiers.cve && (
              <a
                className="ident-chip"
                href={`https://nvd.nist.gov/vuln/detail/${e.identifiers.cve}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                <span className="ident-kind">CVE</span>{" "}
                <span className="mono">{e.identifiers.cve}</span>
              </a>
            )}
            {e.identifiers.gitCommit && (
              <span className="ident-chip">
                <span className="ident-kind">GIT</span>{" "}
                <span className="mono">{e.identifiers.gitCommit.slice(0, 10)}</span>
              </span>
            )}
            {e.identifiers.hnItemId && (
              <a
                className="ident-chip"
                href={`https://news.ycombinator.com/item?id=${e.identifiers.hnItemId}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                <span className="ident-kind">HN</span>{" "}
                <span className="mono">{e.identifiers.hnItemId}</span>
              </a>
            )}
          </div>
        </>
      )}

      <h3>Sources consulted</h3>
      <ul className="source-list">
        {e.sources.map((s) => (
          <li key={s.url} className={`source-item tier-${s.sourceTier ?? "unknown"}`}>
            {isSafeHttpUrl(s.url) ? (
              <a href={s.url} target="_blank" rel="noreferrer noopener">
                {s.title || s.url}
              </a>
            ) : (
              <span>
                {s.title || s.url}{" "}
                <span className="mono dim">(link withheld — unsupported scheme)</span>
              </span>
            )}
            <div className="domain">
              {s.canonicalDomain ?? s.domain}
              {s.sourceTier && (
                <>
                  {" · "}
                  <span className={`source-tier tier-${s.sourceTier}`}>
                    {s.sourceTier.toUpperCase()}
                  </span>
                </>
              )}
              {" · fetched "}
              {utcStamp(s.fetchedAt)}
            </div>
            {s.rawExcerpt && <blockquote>“{s.rawExcerpt}”</blockquote>}
          </li>
        ))}
      </ul>

      {supersededBy && (
        <div className="panel superseded" role="note">
          <span className="caps panel-label">Superseded</span>
          <p>
            This entry was retracted on{" "}
            <span className="mono">{supersededBy.recordedAt.slice(0, 10)}</span>
            {supersededBy.retractionReason && (
              <> as <span className="mono">{supersededBy.retractionReason}</span></>
            )}
            . It stays on the record, unedited, because deleting it would break
            the chain that makes the rest of the record worth reading.{" "}
            <a href={`/event?id=${encodeURIComponent(supersededBy.id)}`}>
              Read the entry that supersedes it
            </a>
            .
          </p>
          {supersededBy.retractionNotes && (
            <p className="dim">{supersededBy.retractionNotes}</p>
          )}
        </div>
      )}

      <div className="panel">
        <span className="caps panel-label">Provenance</span>
        <div className="prov-line">
          <span className="k">contentHash</span>
          <HashBlock hash={e.contentHash} />
        </div>
        <div className="prov-line">
          <span className="k">prevHash</span>
          {e.prevHash ? (
            <>
              <HashBlock hash={e.prevHash} />
              {prevId && (
                <>
                  {" "}
                  <a href={`/event?id=${encodeURIComponent(prevId)}`}>
                    open the prior record
                  </a>
                </>
              )}
            </>
          ) : (
            <span className="dim">(genesis — the file opens here)</span>
          )}
        </div>
        <div className="prov-line">
          <span className="k">seq</span>
          <span>{e.seq}</span>
        </div>
        <div style={{ marginTop: "16px" }}>
          <button
            type="button"
            className="certify-btn"
            onClick={recompute}
            disabled={rec.phase === "running"}
          >
            Recompute this record
          </button>{" "}
          <span role="status">
            {rec.phase === "running" && (
              <span className="mono dim">recomputing…</span>
            )}
            {rec.phase === "match" && (
              <span className="mono verify-ok">
                <Tick /> RECOMPUTES TO THE STORED VALUE
              </span>
            )}
            {rec.phase === "mismatch" && (
              <span className="mono verify-fail">
                DISCREPANCY — computed {rec.computed.slice(0, 16)}…
              </span>
            )}
          </span>
        </div>

        <div className="prov-rule" />
        <div>
          <button
            type="button"
            className="certify-btn"
            onClick={proveInclusion}
            disabled={inc.phase === "running"}
          >
            Prove it is in a sealed day
          </button>{" "}
          <span role="status">
            {inc.phase === "running" && (
              <span className="mono dim">fetching the day and folding the path…</span>
            )}
            {inc.phase === "error" && (
              <span className="mono dim">
                the day could not be retrieved. The chain is unaffected.
              </span>
            )}
            {inc.phase === "unsealed" && (
              <span className="mono dim">
                {inc.day} IS NOT SEALED YET — DAYS SEAL AT 00:15 UTC
              </span>
            )}
            {inc.phase === "mismatch" && (
              <span className="mono verify-fail">
                NOT FOUND IN {inc.day}&apos;S SEALED ROOT
              </span>
            )}
            {inc.phase === "proved" && (
              <span className="mono verify-ok">
                <Tick /> PROVED IN {inc.day} · {inc.proof.path.length} SIBLING
                {inc.proof.path.length === 1 ? " HASH" : " HASHES"} OVER{" "}
                {inc.proof.treeSize} ENTRIES
              </span>
            )}
            {inc.phase === "resealed" && (
              <span className="mono verify-ok">
                <Tick /> IN {inc.day} · THE WHOLE DAY RESEALED ({inc.count} ENTRIES)
              </span>
            )}
          </span>
          {(inc.phase === "proved" || inc.phase === "resealed") && (
            <>
              <div className="prov-line" style={{ marginTop: "10px" }}>
                <span className="k">sealed root</span>
                <HashBlock hash={inc.root.merkleRoot} />
              </div>
              <p className="dim" style={{ marginTop: "6px" }}>
                {inc.phase === "proved" ? (
                  <>
                    The sibling hashes above fold this entry&apos;s hash back into{" "}
                    {inc.day}&apos;s root. A wrong path cannot reach that root, so
                    this holds whether or not you trust us.
                  </>
                ) : (
                  <>
                    {inc.day} was sealed under the register&apos;s first algorithm,
                    which seals a day as a set and carries no per-entry proof. Your
                    browser resealed the whole day instead and found this entry
                    inside it.
                  </>
                )}{" "}
                {inc.root.otsBitcoinBlockHeight ? (
                  <>
                    That root is anchored in Bitcoin block{" "}
                    <span className="mono">{inc.root.otsBitcoinBlockHeight}</span>.
                  </>
                ) : (
                  <>
                    That root is submitted to the OpenTimestamps calendars; its
                    Bitcoin attestation is added once the aggregation confirms.
                  </>
                )}{" "}
                <a href="/verify">Verify the day yourself</a>.
              </p>
            </>
          )}
        </div>
      </div>

      {e.retracts.length > 0 && (
        <>
          <h3>Supersedes</h3>
          <p>
            This entry retracts{" "}
            {e.retracts.map((rid, i) => (
              <span key={rid}>
                {i > 0 && ", "}
                <a href={`/event?id=${encodeURIComponent(rid)}`}>{rid}</a>
              </span>
            ))}
            {e.retractionReason && <> — {e.retractionReason}</>}
            {e.retractionNotes && <>. {e.retractionNotes}</>}
          </p>
        </>
      )}
    </>
  );
}
