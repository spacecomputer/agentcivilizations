"use client";
import { useEffect, useState } from "react";
import { activeCivilizations } from "@/lib/queries";
import type { Civilization } from "@agent-civilizations/schema";

export default function CivilizationsPage() {
  const [civs, setCivs] = useState<Civilization[] | null>(null);
  useEffect(() => {
    activeCivilizations(100).then(setCivs).catch(() => setCivs([]));
  }, []);

  return (
    <>
      <h1>Civilizations</h1>
      <p className="lede">
        Persistent agent groupings — sorted by most recent activity.
      </p>
      {civs === null && <p style={{ color: "var(--fg-dim)" }}>Loading…</p>}
      {civs !== null && civs.length === 0 && (
        <p style={{ color: "var(--fg-dim)" }}>No civilizations yet.</p>
      )}
      <div className="civ-grid">
        {civs?.map((c) => (
          <a key={c.id} className="civ-card" href={`/civilizations/${c.id}`}>
            <h3>{c.name}</h3>
            <p>
              <span className={`badge ${c.category}`}>{c.category}</span>
            </p>
            <p>{c.eventCount} events</p>
            <p>
              first seen {new Date(c.firstSeenAt).toISOString().slice(0, 10)} · last{" "}
              {new Date(c.lastEventAt).toISOString().slice(0, 10)}
            </p>
          </a>
        ))}
      </div>
    </>
  );
}
