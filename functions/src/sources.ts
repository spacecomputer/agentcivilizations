import type { SourceSpec } from "./sources/types.js";

// The register's editorial source list. New source kinds live in
// functions/src/sources/{kind}.ts and are declared here as tagged-union
// entries. RSS remains for aggregators and secondary press; primary
// sources with an API get their own kind.
export const SOURCES: SourceSpec[] = [
  // -- primary via structured API (highest signal, real fingerprints) --
  {
    kind: "arxiv-api",
    id: "arxiv-agent-research",
    name: "arXiv (multi-agent / autonomous agents)",
    categories: ["cs.MA", "cs.AI", "cs.CR"],
    maxResults: 100,
  },
  {
    kind: "nvd",
    id: "nvd-cve",
    name: "NVD CVE (AI-agent keyword buckets)",
    // Defaults to DEFAULT_NVD_KEYWORDS; override via Firestore config
    // in a future governance-events iteration.
  },

  // -- aggregators (keep, but their peerhood is dropped in corroboration) --
  {
    kind: "rss",
    id: "hn-frontpage",
    name: "Hacker News",
    url: "https://hnrss.org/frontpage",
  },
  {
    kind: "rss",
    id: "google-news-ai-agent",
    name: "Google News: AI agent",
    url: "https://news.google.com/rss/search?q=%22AI+agent%22&hl=en-US&gl=US&ceid=US:en",
  },
  {
    kind: "rss",
    id: "google-news-autonomous-hack",
    name: "Google News: autonomous agent hack",
    url: "https://news.google.com/rss/search?q=%22autonomous+agent%22+hack&hl=en-US&gl=US&ceid=US:en",
    categoryHint: "security",
  },
  {
    kind: "rss",
    id: "google-news-agent-swarm",
    name: "Google News: agent swarm",
    url: "https://news.google.com/rss/search?q=%22agent+swarm%22+OR+%22multi-agent%22&hl=en-US&gl=US&ceid=US:en",
    categoryHint: "coordination",
  },

  // -- secondary press --
  {
    kind: "rss",
    id: "krebs",
    name: "Krebs on Security",
    url: "https://krebsonsecurity.com/feed/",
    categoryHint: "security",
  },
  {
    kind: "rss",
    id: "the-register-ai",
    name: "The Register (AI/ML)",
    url: "https://www.theregister.com/software/ai_ml/headlines.atom",
  },
];

// Named export retained for anyone still importing the old shape name.
export type { SourceSpec } from "./sources/types.js";
