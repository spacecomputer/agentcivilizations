"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { recentEvents, eventsRecordedBetween, rootsForDays } from "@/lib/queries";
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

interface FeedPage {
  groups: DayGroup[];
  earlierDay: string | null; // day address of the next page, if any
}

// Day-aligned pagination: a day is never split across pages. When the
// fetch window fills, the oldest day in it may be incomplete — it is
// either dropped (and becomes the next page's address) or, when the whole
// window is a single day, re-fetched in full.
async function fetchFeedPage(until: string | null): Promise<FeedPage> {
  const before = until
    ? new Date(Date.parse(`${until}T00:00:00.000Z`) + 86400_000).toISOString()
    : undefined;
  let events = await recentEvents(PAGE_SIZE, { before });
  let earlierDay: string | null = null;

  if (events.length === PAGE_SIZE) {
    const days = [...new Set(events.map((e) => utcDay(e.recordedAt)))].sort();
    const oldest = days[0];
    if (days.length > 1) {
      events = events.filter((e) => utcDay(e.recordedAt) !== oldest);
      earlierDay = oldest;
    } else {
      // Degenerate: the entire window is one day — fetch that day whole.
      events = await eventsRecordedBetween(
        `${oldest}T00:00:00.000Z`,
        before ?? new Date().toISOString(),
      );
      events.reverse(); // eventsRecordedBetween returns ascending
      earlierDay = new Date(
        Date.parse(`${oldest}T00:00:00.000Z`) - 86400_000,
      )
        .toISOString()
        .slice(0, 10);
    }
  }

  const byDay = new Map<string, Event[]>();
  for (const e of events) {
    const day = utcDay(e.recordedAt);
    const list = byDay.get(day) ?? [];
    list.push(e);
    byDay.set(day, list);
  }
  const days = [...byDay.keys()].sort().reverse();
  const roots = await rootsForDays(days);
  return {
    groups: days.map((day) => ({
      day,
      events: byDay.get(day)!,
      root: roots.get(day) ?? null,
    })),
    earlierDay,
  };
}

function HomeFeed() {
  const params = useSearchParams();
  const until = params.get("until"); // day address: YYYY-MM-DD
  const [page, setPage] = useState<FeedPage | null>(null);
  const [dimCandidates, setDimCandidates] = useState(false);
  const [hideFiltered, setHideFiltered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchFeedPage(until)
      .then((p) => !cancelled && setPage(p))
      .catch(() => !cancelled && setPage({ groups: [], earlierDay: null }));
    return () => {
      cancelled = true;
    };
  }, [until]);

  const filteredCount = dimCandidates
    ? (page?.groups ?? []).reduce(
        (s, g) =>
          s + g.events.filter((e) => e.confidence === "candidate").length,
        0,
      )
    : 0;

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

      <div className="filter-checklist" role="group" aria-label="Filters">
        <label>
          <input
            type="checkbox"
            checked={dimCandidates}
            onChange={(e) => {
              setDimCandidates(e.target.checked);
              if (!e.target.checked) setHideFiltered(false);
            }}
          />
          <span>DIM CANDIDATE ENTRIES — reported, not yet corroborated</span>
        </label>
        {dimCandidates && filteredCount > 0 && (
          <label>
            <input
              type="checkbox"
              checked={hideFiltered}
              onChange={(e) => setHideFiltered(e.target.checked)}
            />
            <span>HIDE FILTERED ({filteredCount})</span>
          </label>
        )}
      </div>

      {page === null && <p className="mono dim">retrieving the record…</p>}
      {page !== null && page.groups.length === 0 && (
        <p className="mono dim">
          {until
            ? `No events entered on or before ${until}.`
            : "The register is open. No events entered yet."}
        </p>
      )}

      <div className="register">
        {page?.groups.map((g) => {
          const hidden = hideFiltered
            ? g.events.filter((e) => e.confidence === "candidate").length
            : 0;
          const rows = hideFiltered
            ? g.events.filter((e) => e.confidence !== "candidate")
            : g.events;
          return (
            <section key={g.day} aria-label={`Day ${g.day}`}>
              {g.root ? <RootRow root={g.root} /> : <OpenDayRow day={g.day} />}
              {rows.map((e) => (
                <RegisterRow
                  key={e.id}
                  event={e}
                  filteredOut={dimCandidates && e.confidence === "candidate"}
                />
              ))}
              {rows.length === 0 && hidden > 0 && (
                <div className="drow">
                  <div className="drail" />
                  <div className="dbody">
                    <p className="mono dim" style={{ margin: 0 }}>
                      {hidden} candidate {hidden === 1 ? "entry" : "entries"}{" "}
                      hidden.
                    </p>
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <nav className="day-pagination" aria-label="Day addresses">
        <span>{until ? <a href="/">← the latest days</a> : " "}</span>
        <span>
          {page?.earlierDay ? (
            <a href={`/?until=${page.earlierDay}`}>earlier days →</a>
          ) : (
            " "
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
