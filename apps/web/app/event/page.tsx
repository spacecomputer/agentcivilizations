"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { event } from "@/lib/queries";
import { computeContentHash } from "@agent-civilizations/verify";
import { CategoryLabel } from "@/components/Glyph";
import { HashBlock } from "@/components/HashBlock";
import { Tick } from "@/components/marks";
import { utcStamp } from "@/lib/format";
import type { Event } from "@agent-civilizations/schema";

type RecomputeState =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "match"; computed: string }
  | { phase: "mismatch"; computed: string };

function EventDetail() {
  const params = useSearchParams();
  const id = params.get("id");
  const [e, setEvent] = useState<Event | null | undefined>(undefined);
  const [rec, setRec] = useState<RecomputeState>({ phase: "idle" });

  useEffect(() => {
    if (!id) {
      setEvent(null);
      return;
    }
    let cancelled = false;
    event(id).then((evt) => !cancelled && setEvent(evt));
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function recompute() {
    if (!e) return;
    setRec({ phase: "running" });
    const { contentHash, ...rest } = e;
    const computed = await computeContentHash(rest);
    setRec(
      computed === contentHash
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

      {e.actors.length > 0 && (
        <>
          <h3>Actors of record</h3>
          <p>{e.actors.join(" · ")}</p>
        </>
      )}

      <h3>Sources consulted</h3>
      <ul className="source-list">
        {e.sources.map((s) => (
          <li key={s.url} className="source-item">
            <a href={s.url} target="_blank" rel="noreferrer noopener">
              {s.title || s.url}
            </a>
            <div className="domain">
              {s.domain} · fetched {utcStamp(s.fetchedAt)}
            </div>
            {s.rawExcerpt && <blockquote>“{s.rawExcerpt}”</blockquote>}
          </li>
        ))}
      </ul>

      <div className="panel">
        <span className="caps panel-label">Provenance</span>
        <div className="prov-line">
          <span className="k">contentHash</span>
          <HashBlock hash={e.contentHash} />
        </div>
        <div className="prov-line">
          <span className="k">prevHash</span>
          {e.prevHash ? (
            <HashBlock hash={e.prevHash} />
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

export default function EventPage() {
  return (
    <Suspense fallback={<p className="mono dim">retrieving the record…</p>}>
      <EventDetail />
    </Suspense>
  );
}
