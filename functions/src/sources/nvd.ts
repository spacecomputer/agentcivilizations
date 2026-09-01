// NVD CVE 2.0 JSON API — the register's first primary security source.
//
// https://services.nvd.nist.gov/rest/json/cves/2.0
//
// Without an API key we get 5 requests / 30s. We poll one call per
// keyword bucket on the 30-minute scan tick, well under the limit. Each
// candidate is hydrated with a real cveId inside Source.fingerprints,
// so the corroboration predicate immediately links NVD entries to any
// Krebs/Register post that mentions the same CVE.
//
// Editorial: the classifier still gates every keyword hit as a
// false-positive filter (e.g. "user-agent" CVE bugs that regex-match
// "agent" but have nothing to do with AI agents).

import type { Candidate } from "./types.js";

const NVD_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0";
const WINDOW_HOURS = 24; // pull last 24h; dedupe by URL handles overlap

// Default keyword allowlist — treated as governance data, editable via
// the nvdKeywords Firestore collection at runtime (see
// loadKeywords()). Kept broad on the AI-agent axis; classifier does the
// heavy lifting on relevance.
export const DEFAULT_NVD_KEYWORDS = [
  "LLM agent",
  "AI agent",
  "prompt injection",
  "langchain",
  "autogen",
  "crewai",
  "llamaindex",
  "smolagents",
  "openhands",
  "browser-use",
  "MCP",
  "model context protocol",
  "function calling",
  "retrieval augmented",
];

interface NvdVulnerability {
  cve?: {
    id?: string;
    published?: string;
    lastModified?: string;
    descriptions?: Array<{ lang: string; value: string }>;
    metrics?: {
      cvssMetricV31?: Array<{
        cvssData?: { baseScore?: number; baseSeverity?: string };
      }>;
    };
    references?: Array<{ url: string; tags?: string[] }>;
    weaknesses?: Array<{ description: Array<{ lang: string; value: string }> }>;
  };
}

function firstEnglishDescription(v: NvdVulnerability): string {
  const d = v.cve?.descriptions ?? [];
  return d.find((x) => x.lang === "en")?.value ?? "";
}

function firstCwe(v: NvdVulnerability): string | undefined {
  const w = v.cve?.weaknesses ?? [];
  for (const weak of w) {
    for (const d of weak.description) {
      if (d.lang === "en" && d.value.startsWith("CWE-")) return d.value;
    }
  }
  return undefined;
}

async function fetchNvdKeyword(
  keyword: string,
  windowHours: number,
): Promise<Candidate[]> {
  const pubEnd = new Date();
  const pubStart = new Date(pubEnd.getTime() - windowHours * 3600_000);
  const params = new URLSearchParams({
    keywordSearch: keyword,
    pubStartDate: pubStart.toISOString(),
    pubEndDate: pubEnd.toISOString(),
    resultsPerPage: "50",
  });
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(`${NVD_URL}?${params}`, {
      headers: {
        "user-agent":
          "agent-civilizations/0.1 (+https://agentcivilizations.org)",
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`nvd(${keyword}): HTTP ${res.status}`);
    const body = (await res.json()) as {
      vulnerabilities?: NvdVulnerability[];
    };
    const vulns = body.vulnerabilities ?? [];
    return vulns
      .map((v): Candidate | null => {
        const cveId = v.cve?.id?.toUpperCase();
        if (!cveId || !/^CVE-\d{4}-\d{4,7}$/.test(cveId)) return null;
        const desc = firstEnglishDescription(v);
        const cwe = firstCwe(v);
        const cvss = v.cve?.metrics?.cvssMetricV31?.[0]?.cvssData?.baseScore;
        const severity =
          v.cve?.metrics?.cvssMetricV31?.[0]?.cvssData?.baseSeverity;
        const published = v.cve?.published ?? new Date().toISOString();
        const canonicalUrl = `https://nvd.nist.gov/vuln/detail/${cveId}`;
        return {
          sourceId: `nvd-${keyword.replace(/\s+/g, "-").toLowerCase()}`,
          sourceName: `NVD CVE (keyword: ${keyword})`,
          url: canonicalUrl,
          title: `${cveId}${severity ? ` (${severity})` : ""}: ${desc.slice(0, 140)}`,
          excerpt: [
            desc.slice(0, 1500),
            cwe ? `CWE: ${cwe}` : "",
            cvss !== undefined ? `CVSS v3.1: ${cvss}` : "",
          ]
            .filter(Boolean)
            .join(" — "),
          publishedAt: published,
          domain: "nvd.nist.gov",
          canonicalUrl,
          canonicalDomain: "nvd.nist.gov",
          sourceTier: "primary",
          categoryHint: "security",
          fingerprints: { cve: cveId },
        };
      })
      .filter((c): c is Candidate => c !== null);
  } finally {
    clearTimeout(t);
  }
}

// Fetch every keyword; report per-keyword errors but never throw. This
// mirrors the fetchAll pattern in ingest.ts.
export async function fetchNvd(
  keywords: string[] = DEFAULT_NVD_KEYWORDS,
  windowHours = WINDOW_HOURS,
): Promise<Candidate[]> {
  const results = await Promise.allSettled(
    keywords.map((k) => fetchNvdKeyword(k, windowHours)),
  );
  const out: Candidate[] = [];
  const seen = new Set<string>(); // dedupe CVEs across overlapping keywords
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const c of r.value) {
      const id = c.fingerprints?.cve;
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      out.push(c);
    }
  }
  return out;
}
