"use client";
import { useEffect, useState } from "react";
import { activeCivilizations } from "@/lib/queries";
import { CivSeal } from "@/components/CivSeal";
import { Stamp } from "@/components/Stamp";
import { CategoryLabel } from "@/components/Glyph";
import { utcDay } from "@/lib/format";
import type { Civilization } from "@agent-civilizations/schema";

// The catalog — one civilization per ruled row, sorted by last entry,
// because the register privileges what is still being written.
export default function CivilizationsPage() {
  const [civs, setCivs] = useState<Civilization[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    activeCivilizations(200)
      .then((c) => !cancelled && setCivs(c))
      .catch(() => !cancelled && setCivs([]));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <span className="caps kicker">The catalog of files</span>
      <h1>Civilizations</h1>
      <p className="preamble">
        Persistent agent groupings, each kept as an archival file: opened when
        first observed, ruled off if it goes extinct. Sorted by last entry.
      </p>
      <div className="rule-double" />

      {civs === null && <p className="mono dim">retrieving the record…</p>}
      {civs !== null && civs.length === 0 && (
        <p className="mono dim">No files opened yet.</p>
      )}

      {civs !== null && civs.length > 0 && (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Category</th>
                <th>Status</th>
                <th className="num">Entries</th>
                <th>Opened</th>
                <th>Last entry</th>
              </tr>
            </thead>
            <tbody>
              {civs.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className="civrow-name">
                      <CivSeal id={c.id} category={c.category} size={34} />
                      <span>
                        <a
                          className="rowlink"
                          href={`/civilization?id=${encodeURIComponent(c.id)}`}
                        >
                          {c.name}
                        </a>
                        <br />
                        <span className="mono dim" style={{ fontSize: "11.5px" }}>
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
                  </td>
                  <td className="num mono">{c.eventCount}</td>
                  <td className="mono dim">{utcDay(c.firstSeenAt)}</td>
                  <td className="mono dim">{utcDay(c.lastEventAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
