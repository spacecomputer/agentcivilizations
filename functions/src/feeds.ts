import { getFirestore } from "firebase-admin/firestore";
import type { Event, Civilization } from "@agent-civilizations/schema";

const SITE = "https://agentcivilizations.org";

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Atom 1.0 — a permanent record deserves a permanent feed. IDs are the
// event's contentHash (stable, unique, and semantically the register's
// idea of identity), so a reader that has fetched the feed once and again
// can dedupe cleanly.
export async function buildAtomFeed(): Promise<string> {
  const db = getFirestore();
  const snap = await db
    .collection("events")
    .orderBy("recordedAt", "desc")
    .limit(50)
    .get();
  const events = snap.docs.map((d) => d.data() as Event);
  const updated =
    events[0]?.recordedAt ?? new Date().toISOString();

  const entries = events
    .map((e) => {
      const url = `${SITE}/event?id=${encodeURIComponent(e.id)}`;
      return `  <entry>
    <id>urn:agent-civilizations:hash:${e.contentHash}</id>
    <title type="text">${xmlEscape(e.title)}</title>
    <link href="${xmlEscape(url)}" rel="alternate"/>
    <updated>${e.recordedAt}</updated>
    <published>${e.occurredAt}</published>
    <category term="${e.category}"/>
    <category term="confidence:${e.confidence}"/>
    <summary type="text">${xmlEscape(e.summary)}</summary>
    <content type="text">${xmlEscape(e.summary)}\n\nRECORD No. ${e.seq} · FILE ${e.civilizationId.toUpperCase()} · ${e.confidence.toUpperCase()}\n\ncontentHash ${e.contentHash}\nprevHash ${e.prevHash ?? "(genesis)"}</content>
  </entry>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Agent Civilizations — the public record</title>
  <subtitle>Hash-chained ledger of AI-agent-civilization events</subtitle>
  <link href="${SITE}/feed.xml" rel="self"/>
  <link href="${SITE}/" rel="alternate"/>
  <id>urn:agent-civilizations:register</id>
  <updated>${updated}</updated>
  <rights>Machine-curated summaries under MIT; underlying sources retain their rights.</rights>
${entries}
</feed>
`;
}

export async function buildSitemap(): Promise<string> {
  const db = getFirestore();
  const [civSnap, eventSnap] = await Promise.all([
    db.collection("civilizations").get(),
    db
      .collection("events")
      .orderBy("recordedAt", "desc")
      .limit(1000)
      .get(),
  ]);
  const civs = civSnap.docs.map((d) => d.data() as Civilization);
  const events = eventSnap.docs.map((d) => d.data() as Event);

  const now = new Date().toISOString();
  const urls: Array<{ loc: string; lastmod: string; priority: string }> = [
    { loc: `${SITE}/`, lastmod: now, priority: "1.0" },
    { loc: `${SITE}/civilizations`, lastmod: now, priority: "0.8" },
    { loc: `${SITE}/verify`, lastmod: now, priority: "0.6" },
    { loc: `${SITE}/about`, lastmod: now, priority: "0.5" },
  ];
  for (const c of civs) {
    urls.push({
      loc: `${SITE}/civilization?id=${encodeURIComponent(c.id)}`,
      lastmod: c.lastEventAt,
      priority: "0.7",
    });
  }
  for (const e of events) {
    urls.push({
      loc: `${SITE}/event?id=${encodeURIComponent(e.id)}`,
      lastmod: e.recordedAt,
      priority: "0.6",
    });
  }

  const entries = urls
    .map(
      (u) => `  <url>
    <loc>${xmlEscape(u.loc)}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <priority>${u.priority}</priority>
  </url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="utf-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
}
