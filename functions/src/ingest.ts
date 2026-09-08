import { XMLParser } from "fast-xml-parser";
import type { SourceSpec } from "./sources.js";
import type { Candidate, FetcherResult } from "./sources/types.js";
import { fetchArxiv } from "./sources/arxiv.js";
import { fetchNvd, DEFAULT_NVD_KEYWORDS } from "./sources/nvd.js";
import { tierOf } from "./tiers.js";

// Re-export Candidate for backward compatibility with scan.ts imports.
export type { Candidate };
export type FetchAllResult = FetcherResult;

const PARSER_OPTS = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
} as const;
const parser = new XMLParser(PARSER_OPTS);

// GitHub's releases.atom carries release notes full of HTML entities, and
// fast-xml-parser's expansion guard trips at a thousand of them: every one
// of the eight framework release feeds failed with "Entity expansion limit
// exceeded" from the day they were added, silently, because a per-source
// error is only a line in the run record. Entity processing is a
// convenience, not a requirement — the fields we read are titles, links
// and short excerpts — so a feed that trips the guard is parsed again with
// it off rather than dropped.
const parserNoEntities = new XMLParser({ ...PARSER_OPTS, processEntities: false });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseFeed(xml: string): any {
  try {
    return parser.parse(xml);
  } catch (err) {
    if (!/entity expansion/i.test(err instanceof Error ? err.message : String(err))) throw err;
    return parserNoEntities.parse(xml);
  }
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

// Extract publisher info from an RSS <source url="..."> element. Google
// News, Yahoo News, and a handful of other aggregators emit this; when
// present it's the publisher's homepage URL, not the article URL.
function extractPublisher(
  src: unknown,
): { homepageUrl: string; domain: string } | null {
  if (!src) return null;
  // fast-xml-parser gives us either a plain string (when there is only
  // text content), or an object with @_url + #text.
  let raw: string | undefined;
  if (typeof src === "string") {
    // no url attribute — nothing usable
    return null;
  }
  if (typeof src === "object" && src !== null) {
    raw = (src as { "@_url"?: string })["@_url"];
  }
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return {
      homepageUrl: raw,
      domain: u.hostname.replace(/^www\./, ""),
    };
  } catch {
    return null;
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
  const parsed = parseFeed(xml);

  // RSS 2.0 shape
  const rssItems = parsed?.rss?.channel?.item;
  if (rssItems) {
    const items = Array.isArray(rssItems) ? rssItems : [rssItems];
    return items.map((item: Record<string, unknown>) => {
      const url = String(item.link ?? item.guid ?? "");
      // Google News RSS carries the underlying publisher in <source
      // url="https://www.example.com">Example</source>. When present,
      // hydrate the candidate with the publisher's canonicalDomain and
      // sourceTier so aggregator items get their real editorial weight
      // instead of collapsing to news.google.com's aggregator-drop tier.
      // See the research note in this commit for why we don't try to
      // decode the CBM token to the article URL (unreliable since
      // July 2024).
      const publisher = extractPublisher(item.source);
      const candidate: Candidate = {
        sourceId: source.id,
        sourceName: source.name,
        url,
        title: clean(String(item.title ?? "")),
        excerpt: clean(String(item.description ?? item.summary ?? "")).slice(0, 2000),
        publishedAt: String(item.pubDate ?? new Date().toUTCString()),
        domain: domainOf(url),
        categoryHint: source.categoryHint,
      };
      if (publisher) {
        candidate.canonicalUrl = publisher.homepageUrl;
        candidate.canonicalDomain = publisher.domain;
        candidate.sourceTier = tierOf(publisher.domain);
      }
      return candidate;
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
  const rows = await fetchFor(source);
  // The language is declared by the feed, so it is stamped once here
  // rather than guessed per item further down. Absent means English.
  const language = source.language;
  return language ? rows.map((c) => ({ ...c, language })) : rows;
}

async function fetchFor(source: SourceSpec): Promise<Candidate[]> {
  switch (source.kind) {
    case "rss":
      return fetchRss(source);
    case "arxiv-api":
      return fetchArxiv(source.id, source.name, source.categories, source.maxResults ?? 100);
    case "nvd":
      return fetchNvd(source.keywords ?? DEFAULT_NVD_KEYWORDS, source.windowHours ?? 24);
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
