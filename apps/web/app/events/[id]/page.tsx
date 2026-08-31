"use client";
import { useEffect, useState } from "react";
import { event } from "@/lib/queries";
import { computeContentHash } from "@agent-civilizations/verify";
import type { Event } from "@agent-civilizations/schema";

export default function EventPage({ params }: { params: { id: string } }) {
  const [e, setEvent] = useState<Event | null>(null);
  const [check, setCheck] = useState<{ ok: boolean; computed: string } | null>(null);

  useEffect(() => {
    event(params.id).then(async (evt) => {
      setEvent(evt);
      if (evt) {
        const { contentHash, ...rest } = evt;
        const computed = await computeContentHash(rest);
        setCheck({ ok: computed === contentHash, computed });
      }
    });
  }, [params.id]);

  if (!e) return <p style={{ color: "var(--fg-dim)" }}>Loading…</p>;

  return (
    <>
      <div className="event-meta" style={{ marginBottom: "0.5rem" }}>
        <span className={`badge ${e.category}`}>{e.category}</span>
        <span className={`badge ${e.confidence}`}>{e.confidence}</span>
        <a href={`/civilizations/${e.civilizationId}`}>civ:{e.civilizationId}</a>
        <span>seq {e.seq}</span>
      </div>
      <h1>{e.title}</h1>
      <p className="lede">{e.summary}</p>
      <div className="event-meta" style={{ marginBottom: "1.5rem" }}>
        <span>occurred {new Date(e.occurredAt).toISOString()}</span>
        <span>recorded {new Date(e.recordedAt).toISOString()}</span>
      </div>

      {e.actors.length > 0 && (
        <>
          <h2>Actors</h2>
          <p>{e.actors.join(", ")}</p>
        </>
      )}

      <h2>Sources</h2>
      <ul className="source-list">
        {e.sources.map((s) => (
          <li key={s.url} className="source-item">
            <div>
              <a href={s.url} target="_blank" rel="noreferrer noopener">{s.title || s.url}</a>
            </div>
            <div className="domain">{s.domain} · fetched {new Date(s.fetchedAt).toISOString().slice(0, 10)}</div>
          </li>
        ))}
      </ul>

      <h2>Provenance</h2>
      <div className="verify-panel">
        <div>
          <span className="hash">contentHash: {e.contentHash}</span>
        </div>
        <div style={{ marginTop: "0.5rem" }}>
          <span className="hash">prevHash: {e.prevHash ?? "(genesis)"}</span>
        </div>
        {check && (
          <div
            style={{ marginTop: "1rem" }}
            className={check.ok ? "verify-ok" : "verify-fail"}
          >
            {check.ok ? "✓ contentHash recomputes to the stored value" : "✗ hash mismatch — investigate"}
            <br />
            <span className="hash">recomputed: {check.computed}</span>
          </div>
        )}
      </div>

      {e.retracts.length > 0 && (
        <>
          <h2>Retracts</h2>
          <p>
            This event supersedes: {e.retracts.map((id) => <a key={id} href={`/events/${id}`}>{id}</a>)}
            <br />
            Reason: {e.retractionReason} — {e.retractionNotes}
          </p>
        </>
      )}
    </>
  );
}

export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}
