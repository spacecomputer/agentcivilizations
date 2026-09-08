// Build-time reads, straight from Firestore's public REST endpoints.
//
// The site is a static export whose pages fetched everything in the
// browser, so the HTML a crawler received was 252 characters reading
// "retrieving the record". Google renders JavaScript on a second pass;
// most AI crawlers do not render at all, and 1,041 URLs sharing one title
// is a near-duplicate cluster besides. So entry and file pages are
// generated at build time with their own titles, their own text, and the
// record itself in the markup.
//
// No SDK and no credentials: the same read-open endpoints the standalone
// verifier uses, which keeps the build honest — if this can read it, so
// can any reader.

import type { Civilization, Event, Root } from "@agent-civilizations/schema";

const BASE =
  process.env.FIRESTORE_BASE ??
  "https://firestore.googleapis.com/v1/projects/agent-civilizations/databases/(default)/documents";

function decodeValue(v: unknown): unknown {
  const o = v as Record<string, unknown>;
  if ("stringValue" in o) return o.stringValue;
  if ("integerValue" in o) return Number(o.integerValue);
  if ("doubleValue" in o) return o.doubleValue;
  if ("booleanValue" in o) return o.booleanValue;
  if ("nullValue" in o) return null;
  if ("timestampValue" in o) return o.timestampValue;
  if ("arrayValue" in o) return ((o.arrayValue as { values?: unknown[] }).values ?? []).map(decodeValue);
  if ("mapValue" in o) return decodeFields((o.mapValue as { fields?: Record<string, unknown> }).fields ?? {});
  return null;
}
function decodeFields(f: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) out[k] = decodeValue(v);
  return out;
}

async function collection<T>(name: string, max = 20000): Promise<T[]> {
  const out: T[] = [];
  let token: string | undefined;
  // A build that silently truncates would publish a partial sitemap and
  // quietly drop pages, so the page cap is generous and the loop bounded.
  for (let i = 0; i < 200; i++) {
    const url = `${BASE}/${name}?pageSize=300${token ? `&pageToken=${token}` : ""}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`build read failed for ${name}: ${res.status}`);
    const json = (await res.json()) as { documents?: Array<{ fields: Record<string, unknown> }>; nextPageToken?: string };
    for (const d of json.documents ?? []) out.push(decodeFields(d.fields) as T);
    token = json.nextPageToken;
    if (!token || out.length >= max) break;
  }
  return out;
}

let eventsCache: Event[] | null = null;
let civsCache: Civilization[] | null = null;

export async function allEventsAtBuild(): Promise<Event[]> {
  if (!eventsCache) eventsCache = await collection<Event>("events");
  return eventsCache;
}
export async function allCivilizationsAtBuild(): Promise<Civilization[]> {
  if (!civsCache) civsCache = await collection<Civilization>("civilizations");
  return civsCache;
}
export async function eventAtBuild(id: string): Promise<Event | null> {
  return (await allEventsAtBuild()).find((e) => e.id === id) ?? null;
}
export async function civilizationAtBuild(id: string): Promise<Civilization | null> {
  return (await allCivilizationsAtBuild()).find((c) => c.id === id) ?? null;
}

let rootsCache: Root[] | null = null;
export async function allRootsAtBuild(): Promise<Root[]> {
  if (!rootsCache) rootsCache = await collection<Root>("roots");
  return rootsCache;
}

/** The most recently sealed day, for a citation that resolves. */
export async function latestSealedDayAtBuild(): Promise<string | null> {
  const roots = await allRootsAtBuild();
  return roots.map((r) => r.id).sort().pop() ?? null;
}

/** Earliest occurrence in the record, for the dataset's temporal coverage. */
export async function earliestOccurrenceAtBuild(): Promise<string | null> {
  const events = await allEventsAtBuild();
  return events.map((e) => e.occurredAt).filter(Boolean).sort()[0] ?? null;
}
