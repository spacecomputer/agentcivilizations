"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { recentEvents, rootsForDays } from "@/lib/queries";
import { utcDay } from "@/lib/format";
import { Crest } from "@/components/Crest";
import { ActivityStrip } from "@/components/ActivityStrip";
import { RegisterRow } from "@/components/RegisterRow";
import { RootRow, OpenDayRow } from "@/components/RootRow";
import type { Event, Root } from "@agent-civilizations/schema";

const PAGE_SIZE = 60;

interface DayGroup {
  day: string;
  events: Event[];
  root: Root | null;
}

function HomeFeed() {
  const params = useSearchParams();
  const until = params.get("until"); // day address: YYYY-MM-DD
  const [groups, setGroups] = useState<DayGroup[] | null>(null);
  const [oldestDay, setOldestDay] = useState<string | null>(null);
  const [showCandidates, setShowCandidates] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const before = until
          ? new Date(Date.parse(`${until}T00:00:00.000Z`) + 86400_000)
              .toISOString()
          : undefined;
        const events = await recentEvents(PAGE_SIZE, { before });
        if (cancelled) return;
        const byDay = new Map<string, Event[]>();
        for (const e of events) {
          const day = utcDay(e.recordedAt);
          const list = byDay.get(day) ?? [];
          list.push(e);
          byDay.set(day, list);
        }
        const days = [...byDay.keys()].sort().reverse();
        const roots = await rootsForDays(days);
        if (cancelled) return;
        setGroups(
          days.map((day) => ({
            day,
            events: byDay.get(day)!,
            root: roots.get(day) ?? null,
          })),
        );
        setOldestDay(days.length ? days[days.length - 1] : null);
      } catch {
        if (!cancelled) setGroups([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [until]);

  const today = utcDay(new Date().toISOString());
  const earlierDay = oldestDay
    ? new Date(Date.parse(`${oldestDay}T00:00:00.000Z`) - 86400_000)
        .toISOString()
        .slice(0, 10)
    : null;

  const visible = (events: Event[]) =>
    showCandidates
      ? events
      : events.filter((e) => e.confidence === "confirmed");

  return (
    <>
      <span className="caps kicker">The public record of the agent era</span>
      <Crest />
      <p className="preamble">
        Agent Civilizations records events in which AI agents coordinate,
        attack, and form persistent communities — mined continuously from
        public sources and entered into a hash-chained register that anyone
        can certify without trusting its keeper.
      </p>
      {!until && <ActivityStrip />}

      <div className="dmeta" style={{ marginBottom: "16px" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={showCandidates}
            onChange={(e) => setShowCandidates(e.target.checked)}
          />
          <span>SHOW CANDIDATE ENTRIES — reported, not yet corroborated</span>
        </label>
      </div>

      {groups === null && (
        <p className="mono dim">retrieving the record…</p>
      )}
      {groups !== null && groups.length === 0 && (
        <p className="mono dim">
          {until
            ? `No events entered on or before ${until}.`
            : "The register is open. No events entered yet."}
        </p>
      )}

      <div className="register">
        {groups?.map((g) => {
          const rows = visible(g.events);
          return (
            <section key={g.day} aria-label={`Day ${g.day}`}>
              {g.root ? (
                <RootRow root={g.root} />
              ) : g.day === today ? (
                <OpenDayRow day={g.day} />
              ) : (
                <OpenDayRow day={g.day} />
              )}
              {rows.length === 0 ? (
                <div className="drow">
                  <div className="drail" />
                  <div className="dbody">
                    <p className="mono dim" style={{ margin: 0 }}>
                      No events entered for this day.
                    </p>
                  </div>
                </div>
              ) : (
                rows.map((e) => <RegisterRow key={e.id} event={e} />)
              )}
            </section>
          );
        })}
      </div>

      <nav className="day-pagination" aria-label="Day addresses">
        <span>
          {until ? <a href="/">← the latest days</a> : " "}
        </span>
        <span>
          {earlierDay && groups && groups.length > 0 ? (
            <a href={`/?until=${earlierDay}`}>earlier days →</a>
          ) : (
            " "
          )}
        </span>
      </nav>
    </>
  );
}

export default function TimelinePage() {
  return (
    <Suspense fallback={<p className="mono dim">retrieving the record…</p>}>
      <HomeFeed />
    </Suspense>
  );
}
