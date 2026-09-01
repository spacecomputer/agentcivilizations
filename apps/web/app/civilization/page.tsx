"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { civilization, eventsForCivilization } from "@/lib/queries";
import { verifyChain } from "@agent-civilizations/verify";
import { CivSeal } from "@/components/CivSeal";
import { Stamp } from "@/components/Stamp";
import { RegisterRow } from "@/components/RegisterRow";
import { Tick } from "@/components/marks";
import { utcDay, daysBetween } from "@/lib/format";
import type { Civilization, Event, Category } from "@agent-civilizations/schema";

const GAP_DAYS = 14;
const CATS: Category[] = ["coordination", "security", "community", "speculative"];

type CertState =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "intact"; verified: number }
  | { phase: "failed"; brokenAt: string; reason: string };

function FondsPage() {
  const params = useSearchParams();
  const id = params.get("id");
  const [civ, setCiv] = useState<Civilization | null | undefined>(undefined);
  const [events, setEvents] = useState<Event[] | null>(null);
  const [cert, setCert] = useState<CertState>({ phase: "idle" });

  useEffect(() => {
    if (!id) {
      setCiv(null);
      return;
    }
    let cancelled = false;
    civilization(id).then((c) => !cancelled && setCiv(c));
    eventsForCivilization(id).then((e) => !cancelled && setEvents(e));
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function certifyFile() {
    if (!events?.length) return;
    setCert({ phase: "running" });
    const result = await verifyChain(events);
    setCert(
      result.ok
        ? { phase: "intact", verified: result.verified }
        : {
            phase: "failed",
            brokenAt: result.brokenAt ?? "unknown",
            reason: result.reason ?? "unknown",
          },
    );
  }

  if (!id) {
    return <p className="mono dim">No file requested. See the <a href="/civilizations">catalog</a>.</p>;
  }
  if (civ === undefined) {
    return <p className="mono dim">retrieving the record…</p>;
  }
  if (civ === null) {
    return (
      <p className="mono dim">
        No file under that designation. The chain is unaffected. See the{" "}
        <a href="/civilizations">catalog</a>.
      </p>
    );
  }

  const catCounts = CATS.map((c) => ({
    cat: c,
    n: events?.filter((e) => e.category === c).length ?? 0,
  })).filter((x) => x.n > 0);
  const total = catCounts.reduce((s, x) => s + x.n, 0);

  // Interleave thread rows with honest gap annotations.
  const thread: React.ReactNode[] = [];
  events?.forEach((e, i) => {
    if (i > 0) {
      const gap = daysBetween(events[i - 1].occurredAt, e.occurredAt);
      if (gap > GAP_DAYS) {
        thread.push(
          <div key={`gap-${e.id}`} className="thread-gap">
            NO ENTRIES · {gap} DAYS
          </div>,
        );
      }
    }
    thread.push(<RegisterRow key={e.id} event={e} />);
  });

  return (
    <>
      <div className="fonds-header">
        <CivSeal id={civ.id} category={civ.category} size={64} />
        <div className="titleblock">
          <div className="fonds-callno">FILE {civ.id.toUpperCase()}</div>
          <h1>{civ.name}</h1>
        </div>
        <Stamp status={civ.status} closedAt={civ.lastEventAt} />
      </div>

      {civ.summary ? (
        <p className="preamble">{civ.summary}</p>
      ) : (
        <p className="mono dim">
          This file carries no summary yet. One is entered on the next weekly
          pass.
        </p>
      )}

      <div className="tablewrap fonds-meta">
        <table>
          <tbody>
            <tr>
              <th scope="row">File opened</th>
              <td className="mono">{utcDay(civ.firstSeenAt)}</td>
            </tr>
            <tr>
              <th scope="row">Last entry</th>
              <td className="mono">{utcDay(civ.lastEventAt)}</td>
            </tr>
            <tr>
              <th scope="row">Entries</th>
              <td className="mono">{civ.eventCount}</td>
            </tr>
            {total > 0 && (
              <tr>
                <th scope="row">Distribution</th>
                <td>
                  <span className="mono dim" style={{ fontSize: "12px" }}>
                    {catCounts
                      .map((x) => `${x.cat.toUpperCase()} ${x.n}`)
                      .join(" · ")}
                  </span>
                  <span className="catbar" aria-hidden="true">
                    {catCounts.map((x) => (
                      <span
                        key={x.cat}
                        className={x.cat}
                        style={{ width: `${(x.n / total) * 100}%` }}
                      />
                    ))}
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ margin: "24px 0" }}>
        <button
          type="button"
          className="certify-btn"
          onClick={certifyFile}
          disabled={cert.phase === "running" || !events?.length}
        >
          Certify this file
        </button>{" "}
        {cert.phase === "running" && (
          <span className="mono dim">recomputing the chain…</span>
        )}
        {cert.phase === "intact" && (
          <span className="mono verify-ok">
            <Tick /> CHAIN INTACT — {cert.verified}{" "}
            {cert.verified === 1 ? "entry" : "entries"} recomputed in this
            browser
          </span>
        )}
        {cert.phase === "failed" && (
          <span className="mono verify-fail">
            CERTIFICATION FAILED — first discrepancy at{" "}
            <a href={`/event?id=${encodeURIComponent(cert.brokenAt)}`}>
              {cert.brokenAt}
            </a>{" "}
            ({cert.reason})
          </span>
        )}
      </div>

      <h2>The thread</h2>
      {events === null && <p className="mono dim">retrieving the record…</p>}
      {events !== null && events.length === 0 && (
        <p className="mono dim">This file is open. No entries yet.</p>
      )}
      {events !== null && events.length > 0 && (
        <div className="register thread">{thread}</div>
      )}
    </>
  );
}

export default function CivilizationPage() {
  return (
    <Suspense fallback={<p className="mono dim">retrieving the record…</p>}>
      <FondsPage />
    </Suspense>
  );
}
