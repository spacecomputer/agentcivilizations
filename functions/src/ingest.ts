import { XMLParser } from "fast-xml-parser";
import type { FeedSource } from "./sources.js";

export interface Candidate {
  sourceId: string;
  sourceName: string;
  url: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  domain: string;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
});

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

function clean(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchFeed(source: FeedSource): Promise<Candidate[]> {
  const res = await fetch(source.url, {
    headers: { "user-agent": "agent-civilizations/0.1 (+https://agentcivilizations.org)" },
  });
  if (!res.ok) throw new Error(`${source.id}: HTTP ${res.status}`);
  const xml = await res.text();
  const parsed = parser.parse(xml);

  // RSS 2.0 shape
  const rssItems = parsed?.rss?.channel?.item;
  if (rssItems) {
    const items = Array.isArray(rssItems) ? rssItems : [rssItems];
    return items.map((item: Record<string, unknown>) => {
      const url = String(item.link ?? item.guid ?? "");
      return {
        sourceId: source.id,
        sourceName: source.name,
        url,
        title: clean(String(item.title ?? "")),
        excerpt: clean(String(item.description ?? item.summary ?? "")).slice(0, 2000),
        publishedAt: String(item.pubDate ?? new Date().toUTCString()),
        domain: domainOf(url),
      };
    });
  }

  // Atom shape
  const atomEntries = parsed?.feed?.entry;
  if (atomEntries) {
    const entries = Array.isArray(atomEntries) ? atomEntries : [atomEntries];
    return entries.map((entry: Record<string, unknown>) => {
      const linkField = entry.link as unknown;
      const url =
        typeof linkField === "string"
          ? linkField
          : Array.isArray(linkField)
            ? String((linkField[0] as { ["@_href"]?: string })?.["@_href"] ?? "")
            : String((linkField as { ["@_href"]?: string })?.["@_href"] ?? "");
      return {
        sourceId: source.id,
        sourceName: source.name,
        url,
        title: clean(String(entry.title ?? "")),
        excerpt: clean(String(entry.summary ?? entry.content ?? "")).slice(0, 2000),
        publishedAt: String(entry.updated ?? entry.published ?? new Date().toISOString()),
        domain: domainOf(url),
      };
    });
  }

  return [];
}

export async function fetchAll(sources: FeedSource[]): Promise<Candidate[]> {
  const results = await Promise.allSettled(sources.map(fetchFeed));
  const out: Candidate[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") out.push(...r.value);
  }
  return out;
}
