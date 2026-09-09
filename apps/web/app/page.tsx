import { Crest } from "@/components/Crest";
import { ActivityStrip } from "@/components/ActivityStrip";
import { HomeFeed, type DayGroup } from "@/components/HomeFeed";
import { allEventsAtBuild, allRootsAtBuild } from "@/lib/build-data";
import { utcDay } from "@/lib/format";

// The front page is a server component, and that is the whole point of it.
//
// It used to be a client component whose single call to useSearchParams —
// for the ?until= day address — suspended during prerender and took the
// entire subtree out of the static HTML with it. Not just the feed: the
// masthead, the crest and the preamble too. The served <main> was 22
// characters reading "retrieving the record…", on the page every share
// unfurls, every crawler starts from, and every citation points at.
//
// So the static prose lives here, outside any Suspense boundary, and the
// first page of the register is resolved at build time and handed down as a
// prop. The client component takes over for filtering and pagination and
// reads the day address off location.search instead.

const PAGE_SIZE = 60;

/** The newest page of the register, grouped by day, resolved at build time. */
async function firstPage(): Promise<{ groups: DayGroup[]; earlierDay: string | null }> {
  const [events, roots] = await Promise.all([allEventsAtBuild(), allRootsAtBuild()]);
  const newest = [...events]
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
    .slice(0, PAGE_SIZE);

  const byDay = new Map<string, typeof newest>();
  for (const e of newest) {
    const day = utcDay(e.recordedAt);
    const list = byDay.get(day) ?? [];
    list.push(e);
    byDay.set(day, list);
  }
  const days = [...byDay.keys()].sort().reverse();

  // A day is never split across pages: the oldest day in a full window may
  // be incomplete, so it becomes the next page's address rather than a
  // partial section. Same rule the client applies, so hydration agrees.
  let earlierDay: string | null = null;
  if (newest.length === PAGE_SIZE && days.length > 1) {
    earlierDay = days.pop() ?? null;
    if (earlierDay) byDay.delete(earlierDay);
  }

  const rootByDay = new Map(roots.map((r) => [r.id, r]));
  return {
    groups: days.map((day) => ({
      day,
      events: byDay.get(day)!,
      root: rootByDay.get(day) ?? null,
    })),
    earlierDay,
  };
}

export default async function TimelinePage() {
  const { groups, earlierDay } = await firstPage();
  return (
    <>
      <span className="caps kicker">The public record of the agent era</span>
      <p className="preamble">
        Agent Civilizations records events in which AI agents coordinate,
        attack, and form persistent communities — mined continuously from
        public sources and entered into a hash-chained register that anyone
        can certify without trusting its keeper.
      </p>
      <ActivityStrip />
      <HomeFeed initialGroups={groups} initialEarlierDay={earlierDay} />
      <Crest />
    </>
  );
}
