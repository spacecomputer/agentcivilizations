// The reference desk's machinery: what a researcher or a journalist needs
// to cite this register and to stay right afterwards.
//
//   snapshot     the register as sealed on a given day, named for that
//                day's root, so a citation can pin a dataset rather than
//                a URL. Every entry it contains reseals to the roots it
//                contains, which is the whole point: a reader can
//                reconstruct exactly what a paper used and prove it has
//                not changed.
//   retractions  an Atom feed of corrections, because anyone who cited an
//                entry we later retract has no other way to find out.
//   figures      the register's own headline counts, as JSON and CSV, so a
//                newsroom chart does not have to be typed by hand.

import { getFirestore } from "firebase-admin/firestore";
import type { Civilization, Event, Root } from "@agent-civilizations/schema";
import { RIGHTS_STATEMENT } from "@agent-civilizations/schema";

const SITE = "https://agentcivilizations.org";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------- snapshot

export interface SnapshotResult {
  ok: boolean;
  status: number;
  body: string;
}

/**
 * Everything sealed through `day`, inclusive. Cumulative rather than
 * per-day, because a citation means "the register as it stood", and a
 * reader reproducing a paper needs the whole corpus as of that date.
 */
export async function buildSnapshot(day: string): Promise<SnapshotResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return { ok: false, status: 400, body: JSON.stringify({ error: "day must be YYYY-MM-DD" }) };
  }
  const db = getFirestore();
  const rootDoc = await db.collection("roots").doc(day).get();
  if (!rootDoc.exists) {
    // Refusing an unsealed day is the point: a snapshot with no root
    // behind it is just a download, and cannot be cited as fixed.
    return {
      ok: false,
      status: 404,
      body: JSON.stringify({
        error: `${day} is not sealed`,
        note: "Snapshots exist only for sealed days. Days seal at 00:15 UTC.",
      }),
    };
  }
  const root = rootDoc.data() as Root;
  const end = `${day}T23:59:59.999Z`;

  const [eventsSnap, civsSnap, rootsSnap] = await Promise.all([
    db.collection("events").where("recordedAt", "<=", end).get(),
    db.collection("civilizations").get(),
    db.collection("roots").where("id", "<=", day).orderBy("id", "asc").get(),
  ]);

  const events = eventsSnap.docs
    .map((d) => d.data() as Event)
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id));
  const seen = new Set(events.map((e) => e.civilizationId));
  // Only files that actually have an entry in the window: a file opened
  // later would be a fact from the future inside a fixed snapshot.
  const civilizations = civsSnap.docs
    .map((d) => d.data() as Civilization)
    .filter((c) => seen.has(c.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  const roots = rootsSnap.docs.map((d) => d.data() as Root);

  const body = JSON.stringify(
    {
      snapshot: {
        register: "Agent Civilizations",
        site: SITE,
        sealedThrough: day,
        merkleRoot: root.merkleRoot,
        rootAlgo: root.rootAlgo ?? "flat-v1",
        prevRootHash: root.prevRootHash,
        bitcoinBlockHeight: root.otsBitcoinBlockHeight ?? null,
        counts: { events: events.length, civilizations: civilizations.length, roots: roots.length },
        license: RIGHTS_STATEMENT,
        howToVerify: `npx @agent-civilizations/verify --root=${day}`,
        note:
          "Every entry here is covered by the roots here. Recompute any day's root from the entries whose recordedAt falls in it and compare with roots[].merkleRoot; the verifier does this for you.",
      },
      roots,
      civilizations,
      events,
    },
    null,
    2,
  );
  return { ok: true, status: 200, body };
}

// ------------------------------------------------------------- retractions

/** Atom feed of corrections, newest first. */
export async function buildRetractionsFeed(): Promise<string> {
  const db = getFirestore();
  // A retraction is an ordinary entry that names what it supersedes.
  const snap = await db
    .collection("events")
    .orderBy("recordedAt", "desc")
    .limit(500)
    .get();
  const retractions = snap.docs
    .map((d) => d.data() as Event)
    .filter((e) => (e.retracts ?? []).length > 0)
    .slice(0, 100);

  const updated = retractions[0]?.recordedAt ?? new Date().toISOString();
  const entries = retractions
    .map((e) => {
      const targets = (e.retracts ?? []).join(", ");
      return `  <entry>
    <id>urn:agent-civilizations:retraction:${esc(e.id)}</id>
    <title type="text">${esc(e.title)}</title>
    <link href="${SITE}/event/${encodeURIComponent(e.id)}" rel="alternate"/>
    <updated>${esc(e.recordedAt)}</updated>
    <published>${esc(e.recordedAt)}</published>
    <category term="retraction"/>
    <category term="reason:${esc(e.retractionReason ?? "unstated")}"/>
    <summary type="text">${esc(
      `This entry retracts ${targets}${e.retractionReason ? ` as ${e.retractionReason}` : ""}. ${e.retractionNotes ?? ""}`.trim(),
    )}</summary>
  </entry>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Agent Civilizations — corrections</title>
  <subtitle>Entries that supersede earlier entries. Subscribe if you have cited this register.</subtitle>
  <link href="${SITE}/corrections.xml" rel="self"/>
  <link href="${SITE}/reference" rel="alternate"/>
  <id>urn:agent-civilizations:retractions</id>
  <updated>${esc(updated)}</updated>
  <author><name>Agent Civilizations</name><uri>${SITE}</uri></author>
  <rights>${esc(RIGHTS_STATEMENT)}</rights>
${entries}
</feed>
`;
}

// ----------------------------------------------------------------- figures

export interface Figures {
  generatedAt: string;
  sealedThrough: string | null;
  events: number;
  confirmed: number;
  candidate: number;
  civilizations: number;
  byCategory: Record<string, number>;
  byStatus: Record<string, number>;
  earliestOccurrence: string | null;
  latestOccurrence: string | null;
  registerOpened: string | null;
  sealedDays: number;
  /**
   * Entries by the declared language of their sources. An entry counts
   * once per distinct language it cites, so an event carried by an English
   * and a Chinese source counts in both: that pairing is the strongest
   * corroboration the register can get, and hiding it would waste it.
   * Absent language means "en" on anything recorded before the register
   * could read another.
   */
  bySourceLanguage: Record<string, number>;
  /** Entries whose sources are all in one non-English language. */
  singleLanguageNonEnglish: number;
}

export async function buildFigures(): Promise<Figures> {
  const db = getFirestore();
  const [eventsSnap, civsSnap, rootsSnap] = await Promise.all([
    db.collection("events").get(),
    db.collection("civilizations").get(),
    db.collection("roots").orderBy("id", "asc").get(),
  ]);
  const events = eventsSnap.docs.map((d) => d.data() as Event);
  const civs = civsSnap.docs.map((d) => d.data() as Civilization);
  const roots = rootsSnap.docs.map((d) => d.data() as Root);

  const byCategory: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const c of civs) {
    byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
    byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
  }
  const bySourceLanguage: Record<string, number> = {};
  let singleLanguageNonEnglish = 0;
  for (const e of events) {
    const langs = new Set((e.sources ?? []).map((s) => s.language ?? "en"));
    for (const l of langs) bySourceLanguage[l] = (bySourceLanguage[l] ?? 0) + 1;
    if (langs.size === 1 && !langs.has("en")) singleLanguageNonEnglish++;
  }
  const occ = events.map((e) => e.occurredAt).filter(Boolean).sort();
  const rec = events.map((e) => e.recordedAt).filter(Boolean).sort();
  return {
    generatedAt: new Date().toISOString(),
    sealedThrough: roots.length ? roots[roots.length - 1].id : null,
    events: events.length,
    confirmed: events.filter((e) => e.confidence === "confirmed").length,
    candidate: events.filter((e) => e.confidence === "candidate").length,
    civilizations: civs.length,
    byCategory,
    byStatus,
    earliestOccurrence: occ[0] ?? null,
    latestOccurrence: occ[occ.length - 1] ?? null,
    registerOpened: rec[0] ?? null,
    sealedDays: roots.length,
    bySourceLanguage,
    singleLanguageNonEnglish,
  };
}

export function figuresToCsv(f: Figures): string {
  const rows: Array<[string, string | number]> = [
    ["generated_at", f.generatedAt],
    ["sealed_through", f.sealedThrough ?? ""],
    ["register_opened", f.registerOpened ?? ""],
    ["sealed_days", f.sealedDays],
    ["entries", f.events],
    ["entries_confirmed", f.confirmed],
    ["entries_candidate", f.candidate],
    ["files", f.civilizations],
    ["earliest_occurrence", f.earliestOccurrence ?? ""],
    ["latest_occurrence", f.latestOccurrence ?? ""],
  ];
  for (const [k, v] of Object.entries(f.bySourceLanguage)) rows.push([`entries_source_language_${k}`, v]);
  rows.push(["entries_non_english_only", f.singleLanguageNonEnglish]);
  for (const [k, v] of Object.entries(f.byCategory)) rows.push([`files_category_${k}`, v]);
  for (const [k, v] of Object.entries(f.byStatus)) rows.push([`files_status_${k}`, v]);
  return "measure,value\n" + rows.map(([k, v]) => `${k},${String(v).includes(",") ? `"${v}"` : v}`).join("\n") + "\n";
}
