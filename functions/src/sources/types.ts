import type { Category, Fingerprints, SourceTier } from "@agent-civilizations/schema";

// A Candidate is the raw material of a scan: what one source returned,
// pre-classifier. Producers (rss, arxiv-api, nvd, github-releases, ...)
// all yield Candidate[]. Fields added by a specific producer land in
// `fingerprints` and `structured` so downstream code doesn't need to
// know which producer emitted the row.
export interface Candidate {
  sourceId: string;
  sourceName: string;
  url: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  domain: string;
  // Producers with rich metadata pre-fill these:
  fingerprints?: Fingerprints;
  canonicalUrl?: string;
  canonicalDomain?: string;
  sourceTier?: SourceTier;
  categoryHint?: Category;
}

// Discriminated union — sources.ts holds an array of these.
export type SourceSpec =
  | { kind: "rss"; id: string; name: string; url: string; categoryHint?: Category }
  | { kind: "arxiv-api"; id: string; name: string; categories: string[]; maxResults?: number }
  | { kind: "nvd"; id: string; name: string; keywords?: string[]; windowHours?: number };

export interface FetcherResult {
  candidates: Candidate[];
  errors: string[]; // one per source that failed
  perSource: Record<string, number>;
}
