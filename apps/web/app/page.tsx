"use client";
import { useEffect, useState } from "react";
import { recentEvents } from "@/lib/queries";
import type { Event } from "@agent-civilizations/schema";

export default function TimelinePage() {
  const [events, setEvents] = useState<Event[] | null>(null);
  const [showCandidates, setShowCandidates] = useState(false);

  useEffect(() => {
    recentEvents(50, showCandidates ? undefined : "confirmed")
      .then(setEvents)
      .catch((e) => {
        console.error(e);
        setEvents([]);
      });
  }, [showCandidates]);

  return (
    <>
      <h1>Timeline</h1>
      <p className="lede">
        A running record of AI-agent-civilization events — coordination, incidents, communities,
        and near-future signals — mined continuously from public sources.
      </p>
      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
        <input
          type="checkbox"
          checked={showCandidates}
          onChange={(e) => setShowCandidates(e.target.checked)}
          style={{ width: "auto" }}
        />
        <span style={{ color: "var(--fg-dim)", fontSize: "0.85rem" }}>
          Show unconfirmed candidates
        </span>
      </label>

      {events === null && <p style={{ color: "var(--fg-dim)" }}>Loading…</p>}
      {events !== null && events.length === 0 && (
        <p style={{ color: "var(--fg-dim)" }}>
          No events yet. The first scheduled scan may not have run — try{" "}
          <code>curl .../scanNow</code> to trigger one.
        </p>
      )}

      <ul className="event-list">
        {events?.map((e) => (
          <li key={e.id} className="event-card">
            <div className="event-title">
              <a href={`/events/${e.id}`}>{e.title}</a>
            </div>
            <p className="event-summary">{e.summary}</p>
            <div className="event-meta">
              <span className={`badge ${e.category}`}>{e.category}</span>
              <span className={`badge ${e.confidence}`}>{e.confidence}</span>
              <a href={`/civilizations/${e.civilizationId}`}>civ:{e.civilizationId}</a>
              <span>{new Date(e.occurredAt).toISOString().slice(0, 10)}</span>
              <span>seq:{e.seq}</span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
