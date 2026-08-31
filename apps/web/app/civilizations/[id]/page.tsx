"use client";
import { useEffect, useState } from "react";
import { civilization, eventsForCivilization } from "@/lib/queries";
import { verifyChain } from "@agent-civilizations/verify";
import type { Civilization, Event } from "@agent-civilizations/schema";

export default function CivilizationPage({ params }: { params: { id: string } }) {
  const [civ, setCiv] = useState<Civilization | null>(null);
  const [events, setEvents] = useState<Event[] | null>(null);
  const [verifyState, setVerifyState] = useState<
    { status: "idle" | "running" | "ok" | "fail"; detail?: string }
  >({ status: "idle" });

  useEffect(() => {
    civilization(params.id).then(setCiv);
    eventsForCivilization(params.id).then(setEvents);
  }, [params.id]);

  async function runVerify() {
    if (!events) return;
    setVerifyState({ status: "running" });
    const result = await verifyChain(events);
    if (result.ok) {
      setVerifyState({ status: "ok", detail: `${result.verified} events verified` });
    } else {
      setVerifyState({
        status: "fail",
        detail: `broken at ${result.brokenAt} (${result.reason})`,
      });
    }
  }

  if (!civ) return <p style={{ color: "var(--fg-dim)" }}>Loading…</p>;

  return (
    <>
      <h1>{civ.name}</h1>
      <p className="lede">{civ.summary || "No summary yet — one will be generated on the next weekly pass."}</p>
      <div className="event-meta" style={{ marginBottom: "1rem" }}>
        <span className={`badge ${civ.category}`}>{civ.category}</span>
        <span>{civ.eventCount} events</span>
        <span>first seen {new Date(civ.firstSeenAt).toISOString().slice(0, 10)}</span>
        <span>status: {civ.status}</span>
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <button onClick={runVerify}>Verify hash chain</button>
        {verifyState.status !== "idle" && (
          <span
            style={{ marginLeft: "1rem" }}
            className={verifyState.status === "ok" ? "verify-ok" : verifyState.status === "fail" ? "verify-fail" : ""}
          >
            {verifyState.status === "running" ? "verifying…" : verifyState.detail}
          </span>
        )}
      </div>

      <h2>Events</h2>
      <ul className="event-list">
        {events?.map((e) => (
          <li key={e.id} className="event-card">
            <div className="event-title">
              <a href={`/events/${e.id}`}>#{e.seq} {e.title}</a>
            </div>
            <p className="event-summary">{e.summary}</p>
            <div className="event-meta">
              <span className={`badge ${e.confidence}`}>{e.confidence}</span>
              <span>{new Date(e.occurredAt).toISOString().slice(0, 10)}</span>
              <span className="hash">hash: {e.contentHash.slice(0, 16)}…</span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}
