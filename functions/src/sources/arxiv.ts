import { XMLParser } from "fast-xml-parser";
import type { Candidate } from "./types.js";

// arXiv Query API — structured Atom with namespaced fields.
// See https://info.arxiv.org/help/api/user-manual.html
//
// We ask for the newest submissions in the target categories and hydrate
// every candidate with a real arxivId, DOI (when the author supplied one),
// and full author list — exactly the join keys the corroboration predicate
// needs. Compared to the RSS scrape this replaces:
// - the arxivId comes from <id>http://arxiv.org/abs/XXXX.YYYYY (canonical,
//   not a fuzzy regex match against a URL that might be a PDF variant),
// - the "domain" is arxiv.org (not export.arxiv.org — canonical from the
//   start, which composes with the tier map without needing the collapse),
// - the sourceTier is set explicitly to "primary".

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  removeNSPrefix: false, // KEEP arxiv:doi, arxiv:primary_category
});

interface ArxivEntry {
  id?: string;
  title?: string;
  summary?: string;
  updated?: string;
  published?: string;
  author?: unknown; // string | { name: string } | array of either
  "arxiv:doi"?: string;
  "arxiv:primary_category"?: { "@_term"?: string };
  link?: unknown;
}

function normalizeAuthors(a: unknown): string[] {
  if (!a) return [];
  const arr = Array.isArray(a) ? a : [a];
  return arr
    .map((x) => {
      if (typeof x === "string") return x;
      if (typeof x === "object" && x !== null) {
        const name = (x as { name?: unknown }).name;
        if (typeof name === "string") return name;
      }
      return "";
    })
    .filter(Boolean);
}

function pickAlternateLink(link: unknown): string {
  const links = Array.isArray(link) ? link : [link];
  for (const l of links) {
    if (typeof l === "string") return l;
    const rel = (l as { "@_rel"?: string })?.["@_rel"];
    const href = (l as { "@_href"?: string })?.["@_href"];
    if (rel === "alternate" && href) return href;
  }
  // fallback: first href we can find
  for (const l of links) {
    const href = (l as { "@_href"?: string })?.["@_href"];
    if (href) return href;
  }
  return "";
}

function extractArxivId(entry: ArxivEntry): string | undefined {
  const id = entry.id;
  if (typeof id !== "string") return undefined;
  // canonical id form: http://arxiv.org/abs/2401.12345v2
  const m = id.match(/abs\/([^/\s]+)$/);
  if (!m) return undefined;
  return m[1].replace(/v\d+$/, "").toLowerCase();
}

function stripWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export async function fetchArxiv(
  sourceId: string,
  sourceName: string,
  categories: string[],
  maxResults = 100,
): Promise<Candidate[]> {
  const q = categories.map((c) => `cat:${c}`).join("+OR+");
  const url = `http://export.arxiv.org/api/query?search_query=${q}&sortBy=submittedDate&sortOrder=descending&max_results=${maxResults}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15000);
  let xml: string;
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent":
          "agent-civilizations/0.1 (+https://agentcivilizations.org)",
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${sourceId}: HTTP ${res.status}`);
    xml = await res.text();
  } finally {
    clearTimeout(t);
  }
  const parsed = parser.parse(xml);
  const entries: ArxivEntry[] = (() => {
    const e = parsed?.feed?.entry;
    if (!e) return [];
    return Array.isArray(e) ? e : [e];
  })();

  const candidates: Candidate[] = [];
  for (const entry of entries) {
    const arxivId = extractArxivId(entry);
    if (!arxivId) continue;
    const title = stripWs(String(entry.title ?? ""));
    const summary = stripWs(String(entry.summary ?? "")).slice(0, 2000);
    const link = pickAlternateLink(entry.link) || `https://arxiv.org/abs/${arxivId}`;
    const publishedAt = String(entry.updated ?? entry.published ?? new Date().toISOString());
    const authors = normalizeAuthors(entry.author);
    const primaryCat =
      (entry["arxiv:primary_category"] as { "@_term"?: string } | undefined)?.[
        "@_term"
      ] ?? undefined;
    const doi =
      typeof entry["arxiv:doi"] === "string"
        ? entry["arxiv:doi"].toLowerCase()
        : undefined;

    // Compose the excerpt to include author list — the classifier and
    // downstream displays benefit from seeing the primary_category tag
    // (helps distinguish an autonomous-agents paper from an ML-theory
    // paper with agentic keywords).
    const excerpt = [
      primaryCat ? `[${primaryCat}] ${title}` : title,
      authors.length ? `Authors: ${authors.slice(0, 8).join(", ")}` : "",
      summary,
    ]
      .filter(Boolean)
      .join(" — ");

    candidates.push({
      sourceId,
      sourceName,
      url: link,
      title,
      excerpt: excerpt.slice(0, 2000),
      publishedAt,
      domain: "arxiv.org",
      canonicalUrl: link,
      canonicalDomain: "arxiv.org",
      sourceTier: "primary",
      fingerprints: {
        arxivId,
        ...(doi ? { doi } : {}),
      },
    });
  }
  return candidates;
}
