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

  // -- primary via GitHub release feeds --
  // A framework's own release notes are the first party on its own
  // behaviour: a new protocol, a new autonomy default, a security fix in
  // an agent loop. github.com is tiered primary, so one of these plus an
  // independent report confirms an entry on its own.
  ...[
    ["langchain-ai/langgraph", "LangGraph"],
    ["microsoft/autogen", "AutoGen"],
    ["crewAIInc/crewAI", "CrewAI"],
    ["Significant-Gravitas/AutoGPT", "AutoGPT"],
    ["openai/openai-agents-python", "OpenAI Agents SDK"],
    ["modelcontextprotocol/servers", "Model Context Protocol servers"],
    ["All-Hands-AI/OpenHands", "OpenHands"],
    ["browser-use/browser-use", "Browser Use"],
  ].map(([repo, name]) => ({
    kind: "rss" as const,
    id: `github-releases-${repo.split("/")[1].toLowerCase()}`,
    name: `${name} releases`,
    url: `https://github.com/${repo}/releases.atom`,
  })),

  // -- Chinese-language sources --
  // The register placed files in Beijing, Hangzhou, Shanghai and Shenzhen
  // for a week before it could read a word of Chinese; it learned of them
  // through Western coverage, late and thinned. These are read directly.
  // Feeds verified live before being added; three candidates (jiqizhixin,
  // 36kr, freebuf) returned nothing usable and were left out rather than
  // shipped as dead weight.
  { kind: "rss", id: "qbitai", name: "量子位 QbitAI", url: "https://www.qbitai.com/feed", language: "zh" },
  { kind: "rss", id: "anquanke", name: "安全客 Anquanke", url: "https://api.anquanke.com/data/v1/rss", language: "zh" },
  { kind: "rss", id: "infoq-cn", name: "InfoQ 中国", url: "https://www.infoq.cn/feed", language: "zh" },
  {
    kind: "rss",
    id: "google-news-zh",
    name: "Google News 智能体 (zh-Hans)",
    url: "https://news.google.com/rss/search?q=%22AI+agent%22+OR+%22%E6%99%BA%E8%83%BD%E4%BD%93%22+OR+%22%E5%A4%9A%E6%99%BA%E8%83%BD%E4%BD%93%22&hl=zh-CN&gl=CN&ceid=CN:zh-Hans",
    language: "zh",
  },

  // -- Russian-language sources --
  { kind: "rss", id: "habr-ai", name: "Habr — искусственный интеллект", url: "https://habr.com/ru/rss/hub/artificial_intelligence/?fl=ru", language: "ru" },
  { kind: "rss", id: "habr-infosec", name: "Habr — информационная безопасность", url: "https://habr.com/ru/rss/hub/infosecurity/?fl=ru", language: "ru" },
  { kind: "rss", id: "securelist-ru", name: "Securelist (RU)", url: "https://securelist.ru/feed/", language: "ru" },
  { kind: "rss", id: "xakep", name: "Хакер", url: "https://xakep.ru/feed/", language: "ru" },
  {
    kind: "rss",
    id: "google-news-ru",
    name: "Google News ИИ-агент (ru)",
    url: "https://news.google.com/rss/search?q=%22%D0%98%D0%98-%D0%B0%D0%B3%D0%B5%D0%BD%D1%82%22+OR+%22AI-%D0%B0%D0%B3%D0%B5%D0%BD%D1%82%22+OR+%22%D0%B0%D0%B2%D1%82%D0%BE%D0%BD%D0%BE%D0%BC%D0%BD%D1%8B%D0%B9+%D0%B0%D0%B3%D0%B5%D0%BD%D1%82%22&hl=ru&gl=RU&ceid=RU:ru",
    language: "ru",
  },

  // -- aggregators (kept but peerhood dropped in corroboration by
  // default; individual items get their canonical publisher tier via
  // the RSS <source url> unwrap in ingest.ts) --
  {
    kind: "rss",
    id: "hn-frontpage",
    name: "Hacker News",
    url: "https://hnrss.org/frontpage",
  },
  // Consolidated to two Google News queries — five was tripping their
  // rate limit (HTTP 503) on every scan. These two queries cover the
  // agent-civilization surface without redundancy.
  {
    kind: "rss",
    id: "google-news-ai-agents",
    name: "Google News: AI agents",
    url: "https://news.google.com/rss/search?q=%22AI+agent%22+OR+%22autonomous+agent%22+OR+%22agentic+AI%22&hl=en-US&gl=US&ceid=US:en",
  },
  {
    kind: "rss",
    id: "google-news-agent-incidents",
    name: "Google News: agent incidents",
    url: "https://news.google.com/rss/search?q=%22agent+swarm%22+OR+%22multi-agent%22+OR+%22prompt+injection%22&hl=en-US&gl=US&ceid=US:en",
    categoryHint: "security",
  },
  // Anthropic doesn't publish RSS — use a targeted Google News query
  // as its proxy so their announcements aren't invisible to the ledger.
  {
    kind: "rss",
    id: "google-news-anthropic",
    name: "Google News: Anthropic",
    url: "https://news.google.com/rss/search?q=Anthropic+Claude&hl=en-US&gl=US&ceid=US:en",
  },

  // -- primary vendor blogs (agent-first labs) --
  // Anthropic publishes no RSS; covered by targeted Google News below.
  {
    kind: "rss",
    id: "openai-news",
    name: "OpenAI News",
    url: "https://openai.com/news/rss.xml",
  },
  {
    kind: "rss",
    id: "deepmind-blog",
    name: "Google DeepMind",
    url: "https://deepmind.google/blog/rss.xml",
  },
  {
    kind: "rss",
    id: "huggingface-blog",
    name: "Hugging Face Blog",
    url: "https://huggingface.co/blog/feed.xml",
  },

  // -- primary-trade security beats --
  {
    kind: "rss",
    id: "krebs",
    name: "Krebs on Security",
    url: "https://krebsonsecurity.com/feed/",
    categoryHint: "security",
  },
  {
    kind: "rss",
    id: "schneier",
    name: "Schneier on Security",
    url: "https://www.schneier.com/feed/atom/",
    categoryHint: "security",
  },

  // -- reputable secondary press --
  {
    kind: "rss",
    id: "the-register-ai",
    name: "The Register (AI/ML)",
    url: "https://www.theregister.com/software/ai_ml/headlines.atom",
  },
  {
    kind: "rss",
    id: "the-register-security",
    name: "The Register (Security)",
    url: "https://www.theregister.com/security/headlines.atom",
    categoryHint: "security",
  },
  {
    kind: "rss",
    id: "arstechnica-ai",
    name: "Ars Technica (AI)",
    url: "https://arstechnica.com/ai/feed/",
  },
  {
    kind: "rss",
    id: "arstechnica-security",
    name: "Ars Technica (Security)",
    url: "https://arstechnica.com/security/feed/",
    categoryHint: "security",
  },
  {
    kind: "rss",
    id: "techcrunch-ai",
    name: "TechCrunch (AI)",
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
  },
  {
    kind: "rss",
    id: "mit-technology-review",
    name: "MIT Technology Review (AI)",
    url: "https://www.technologyreview.com/topic/artificial-intelligence/feed",
  },

];

// Named export retained for anyone still importing the old shape name.
export type { SourceSpec } from "./sources/types.js";
