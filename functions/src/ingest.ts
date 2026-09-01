import { XMLParser } from "fast-xml-parser";
import type { SourceSpec } from "./sources.js";
import type { Candidate, FetcherResult } from "./sources/types.js";
import { fetchArxiv } from "./sources/arxiv.js";

// Re-export Candidate for backward compatibility with scan.ts imports.
export type { Candidate };
export type FetchAllResult = FetcherResult;

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

// 10s timeout on any single feed fetch — a hung host must not eat the
// full 540s function timeout.
async function fetchWithTimeout(url: string, ms = 10_000): Promise<string> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent":
          "agent-civilizations/0.1 (+https://agentcivilizations.org)",
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

export async function fetchRss(
  source: Extract<SourceSpec, { kind: "rss" }>,
): Promise<Candidate[]> {
  const xml = await fetchWithTimeout(source.url);
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
        categoryHint: source.categoryHint,
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
        categoryHint: source.categoryHint,
      };
    });
  }

  return [];
}

async function fetchOne(source: SourceSpec): Promise<Candidate[]> {
  switch (source.kind) {
    case "rss":
      return fetchRss(source);
    case "arxiv-api":
      return fetchArxiv(source.id, source.name, source.categories, source.maxResults ?? 100);
  }
}

export async function fetchAll(sources: SourceSpec[]): Promise<FetcherResult> {
  const results = await Promise.allSettled(sources.map(fetchOne));
  const candidates: Candidate[] = [];
  const errors: string[] = [];
  const perSource: Record<string, number> = {};
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const src = sources[i];
    if (r.status === "fulfilled") {
      candidates.push(...r.value);
      perSource[src.id] = r.value.length;
    } else {
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      errors.push(`${src.id}: ${msg}`.slice(0, 300));
      perSource[src.id] = 0;
    }
  }
  return { candidates, errors, perSource };
}
