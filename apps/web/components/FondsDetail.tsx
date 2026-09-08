"use client";
import { useEffect, useState } from "react";
import { civilization, eventsForCivilization } from "@/lib/queries";
import { verifyChain } from "@agent-civilizations/verify";
import { CivSeal } from "@/components/CivSeal";
import { Stamp } from "@/components/Stamp";
import { RegisterRow } from "@/components/RegisterRow";
import { CategoryLabel, Glyph } from "@/components/Glyph";
import { Tick } from "@/components/marks";
import { utcDay, daysBetween, fileName } from "@/lib/format";
import type { Civilization, Event, Category } from "@agent-civilizations/schema";

const GAP_DAYS = 14;
const CATS: Category[] = ["coordination", "security", "community", "speculative"];

type CertState =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "intact"; verified: number }
  | { phase: "failed"; brokenAt: string; reason: string };

export function FondsDetail({
  initialCiv,
  initialEvents,
  id: idProp,
}: {
  initialCiv?: Civilization | null;
  initialEvents?: Event[] | null;
  id?: string | null;
} = {}) {
  // Handed its file by the statically generated page, or given an id to
  // fetch by the query-string route. useSearchParams stays in the
  // wrapper: calling it here opts the subtree out of prerendering, which
  // is what left every one of these pages empty to a crawler.
  const id = initialCiv?.id ?? idProp ?? null;
  const [civ, setCiv] = useState<Civilization | null | undefined>(initialCiv ?? undefined);
  const [events, setEvents] = useState<Event[] | null>(initialEvents ?? null);
  const [cert, setCert] = useState<CertState>({ phase: "idle" });

  useEffect(() => {
    if (initialCiv) return;
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

  // Interleave thread rows with honest gap annotations. Each row carries a
  // spine node: the category glyph, filled or hollow by confidence.
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
    thread.push(
      <div key={e.id} className="thread-row">
        <span className="spine-node" aria-hidden="true">
          <Glyph
            category={e.category}
            filled={e.confidence === "confirmed"}
            size={12}
          />
        </span>
        <RegisterRow event={e} />
      </div>,
    );
  });

  return (
    <>
      <div className="fonds-header">
        <CivSeal id={civ.id} category={civ.category} size={64} />
        <div className="titleblock">
          <div className="fonds-callno">FILE {civ.id.toUpperCase()}</div>
          <h1>{fileName(civ.id, civ.name)}</h1>
          <div className="dmeta">
            <CategoryLabel category={civ.category} />
          </div>
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
        <span role="status">
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
              <a href={`/event/${encodeURIComponent(cert.brokenAt)}`}>
                {cert.brokenAt}
              </a>{" "}
              ({cert.reason})
            </span>
          )}
        </span>
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
