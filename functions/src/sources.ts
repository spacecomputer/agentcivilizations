export interface FeedSource {
  id: string;
  name: string;
  url: string;
  weight: number;
  categoryHint?: "coordination" | "security" | "community" | "speculative";
}

export const SOURCES: FeedSource[] = [
  {
    id: "hn-frontpage",
    name: "Hacker News",
    url: "https://hnrss.org/frontpage",
    weight: 1.0,
  },
  {
    id: "arxiv-cs-ai",
    name: "arXiv cs.AI",
    url: "http://export.arxiv.org/rss/cs.AI",
    weight: 0.8,
    categoryHint: "speculative",
  },
  {
    id: "arxiv-cs-ma",
    name: "arXiv cs.MA",
    url: "http://export.arxiv.org/rss/cs.MA",
    weight: 1.0,
    categoryHint: "coordination",
  },
  {
    id: "google-news-ai-agent",
    name: "Google News: AI agent",
    url: "https://news.google.com/rss/search?q=%22AI+agent%22&hl=en-US&gl=US&ceid=US:en",
    weight: 0.7,
  },
  {
    id: "google-news-autonomous-hack",
    name: "Google News: autonomous agent hack",
    url: "https://news.google.com/rss/search?q=%22autonomous+agent%22+hack&hl=en-US&gl=US&ceid=US:en",
    weight: 0.9,
    categoryHint: "security",
  },
  {
    id: "google-news-agent-swarm",
    name: "Google News: agent swarm",
    url: "https://news.google.com/rss/search?q=%22agent+swarm%22+OR+%22multi-agent%22&hl=en-US&gl=US&ceid=US:en",
    weight: 0.8,
    categoryHint: "coordination",
  },
  {
    id: "krebs",
    name: "Krebs on Security",
    url: "https://krebsonsecurity.com/feed/",
    weight: 0.6,
    categoryHint: "security",
  },
  {
    id: "the-register-ai",
    name: "The Register (AI/ML)",
    url: "https://www.theregister.com/software/ai_ml/headlines.atom",
    weight: 0.6,
  },
];
