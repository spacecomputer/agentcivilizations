import type { ActorKind } from "@agent-civilizations/schema";

// Curated sponsor seed — the actors that account for most mentions in
// the ledger, with headquarters placed by hand. Provenance "curated";
// the nightly origins job never overwrites these. Editing this file is a
// governance act: keep coordinates to the organisation's principal
// headquarters, not a regional office.
export interface SeedActor {
  name: string;
  aliases?: string[];
  kind: ActorKind;
  city: string;
  country: string; // ISO 3166-1 alpha-2
  lat: number;
  lng: number;
  homepage?: string;
}

export const ACTOR_SEED: SeedActor[] = [
  // -- frontier labs --
  { name: "OpenAI", aliases: ["ChatGPT", "GPT", "Codex", "OpenAI Operator"], kind: "lab", city: "San Francisco", country: "US", lat: 37.762, lng: -122.397, homepage: "https://openai.com" },
  { name: "Anthropic", aliases: ["Claude", "Claude Code", "Anthropic PBC"], kind: "lab", city: "San Francisco", country: "US", lat: 37.79, lng: -122.401, homepage: "https://www.anthropic.com" },
  { name: "Google DeepMind", aliases: ["DeepMind", "Gemini"], kind: "lab", city: "London", country: "GB", lat: 51.532, lng: -0.126, homepage: "https://deepmind.google" },
  { name: "Google", aliases: ["Google AI", "Google Research", "Alphabet"], kind: "company", city: "Mountain View", country: "US", lat: 37.422, lng: -122.084, homepage: "https://google.com" },
  { name: "Meta", aliases: ["Meta AI", "Facebook", "FAIR", "Llama"], kind: "company", city: "Menlo Park", country: "US", lat: 37.453, lng: -122.182, homepage: "https://ai.meta.com" },
  { name: "Microsoft", aliases: ["Microsoft Research", "AutoGen", "Copilot", "Azure"], kind: "company", city: "Redmond", country: "US", lat: 47.674, lng: -122.122, homepage: "https://microsoft.com" },
  { name: "xAI", aliases: ["Grok"], kind: "lab", city: "Palo Alto", country: "US", lat: 37.442, lng: -122.143, homepage: "https://x.ai" },
  { name: "Mistral AI", aliases: ["Mistral"], kind: "lab", city: "Paris", country: "FR", lat: 48.857, lng: 2.352, homepage: "https://mistral.ai" },
  { name: "Cohere", kind: "lab", city: "Toronto", country: "CA", lat: 43.653, lng: -79.383, homepage: "https://cohere.com" },
  { name: "Hugging Face", aliases: ["HuggingFace", "HF"], kind: "company", city: "New York", country: "US", lat: 40.713, lng: -74.006, homepage: "https://huggingface.co" },
  { name: "NVIDIA", aliases: ["Nvidia"], kind: "company", city: "Santa Clara", country: "US", lat: 37.371, lng: -121.964, homepage: "https://nvidia.com" },
  { name: "IBM", aliases: ["IBM Research"], kind: "company", city: "Armonk", country: "US", lat: 41.108, lng: -73.715, homepage: "https://ibm.com" },
  { name: "Amazon", aliases: ["AWS", "Amazon Web Services", "Bedrock"], kind: "company", city: "Seattle", country: "US", lat: 47.606, lng: -122.332, homepage: "https://aws.amazon.com" },
  { name: "Apple", kind: "company", city: "Cupertino", country: "US", lat: 37.323, lng: -122.032, homepage: "https://apple.com" },
  { name: "Salesforce", aliases: ["Agentforce"], kind: "company", city: "San Francisco", country: "US", lat: 37.79, lng: -122.397, homepage: "https://salesforce.com" },
  { name: "ServiceNow", kind: "company", city: "Santa Clara", country: "US", lat: 37.39, lng: -121.965 },
  { name: "Cisco", kind: "company", city: "San Jose", country: "US", lat: 37.338, lng: -121.886 },
  { name: "Broadcom", aliases: ["VMware"], kind: "company", city: "Palo Alto", country: "US", lat: 37.442, lng: -122.143 },
  { name: "GitHub", kind: "company", city: "San Francisco", country: "US", lat: 37.783, lng: -122.392, homepage: "https://github.com" },
  { name: "Databricks", kind: "company", city: "San Francisco", country: "US", lat: 37.79, lng: -122.4 },
  { name: "Scale AI", kind: "company", city: "San Francisco", country: "US", lat: 37.79, lng: -122.4 },
  { name: "Perplexity", aliases: ["Perplexity AI"], kind: "company", city: "San Francisco", country: "US", lat: 37.79, lng: -122.4 },
  { name: "Cognition", aliases: ["Devin", "Cognition AI"], kind: "company", city: "San Francisco", country: "US", lat: 37.79, lng: -122.4 },
  { name: "Anysphere", aliases: ["Cursor"], kind: "company", city: "San Francisco", country: "US", lat: 37.79, lng: -122.4 },
  { name: "Replit", kind: "company", city: "Foster City", country: "US", lat: 37.559, lng: -122.271 },
  { name: "LangChain", aliases: ["LangGraph", "LangChain AI"], kind: "agent-framework", city: "San Francisco", country: "US", lat: 37.79, lng: -122.4, homepage: "https://langchain.com" },
  { name: "CrewAI", aliases: ["crewAI"], kind: "agent-framework", city: "San Francisco", country: "US", lat: 37.79, lng: -122.4 },
  { name: "Y Combinator", aliases: ["Hacker News"], kind: "company", city: "San Francisco", country: "US", lat: 37.776, lng: -122.417 },
  { name: "Palo Alto Networks", kind: "company", city: "Santa Clara", country: "US", lat: 37.39, lng: -121.965 },
  { name: "CrowdStrike", kind: "company", city: "Austin", country: "US", lat: 30.267, lng: -97.743 },
  { name: "Rescana", kind: "company", city: "Tel Aviv", country: "IL", lat: 32.085, lng: 34.782 },
  { name: "H Company", aliases: ["H"], kind: "lab", city: "Paris", country: "FR", lat: 48.857, lng: 2.352 },
  { name: "Sakana AI", kind: "lab", city: "Tokyo", country: "JP", lat: 35.676, lng: 139.65 },
  { name: "Naver", kind: "company", city: "Seongnam", country: "KR", lat: 37.36, lng: 127.105 },
  { name: "Samsung", aliases: ["Samsung Electronics", "Samsung Research"], kind: "company", city: "Suwon", country: "KR", lat: 37.264, lng: 127.029 },
  { name: "Alibaba", aliases: ["Alibaba Cloud", "Qwen"], kind: "company", city: "Hangzhou", country: "CN", lat: 30.274, lng: 120.155 },
  { name: "Tencent", kind: "company", city: "Shenzhen", country: "CN", lat: 22.543, lng: 114.058 },
  { name: "Baidu", aliases: ["ERNIE"], kind: "company", city: "Beijing", country: "CN", lat: 39.904, lng: 116.407 },
  { name: "ByteDance", aliases: ["TikTok", "Doubao"], kind: "company", city: "Beijing", country: "CN", lat: 39.904, lng: 116.407 },
  { name: "DeepSeek", kind: "lab", city: "Hangzhou", country: "CN", lat: 30.274, lng: 120.155 },
  { name: "Moonshot AI", aliases: ["Kimi"], kind: "lab", city: "Beijing", country: "CN", lat: 39.904, lng: 116.407 },
  { name: "Zhipu AI", aliases: ["Z.ai", "GLM"], kind: "lab", city: "Beijing", country: "CN", lat: 39.904, lng: 116.407 },
  { name: "MiniMax", kind: "lab", city: "Shanghai", country: "CN", lat: 31.23, lng: 121.474 },
  { name: "Technology Innovation Institute", aliases: ["TII", "Falcon"], kind: "lab", city: "Abu Dhabi", country: "AE", lat: 24.454, lng: 54.377 },
  { name: "G42", kind: "company", city: "Abu Dhabi", country: "AE", lat: 24.454, lng: 54.377 },
  { name: "National Payments Corporation of India", aliases: ["NPCI"], kind: "government", city: "Mumbai", country: "IN", lat: 19.076, lng: 72.878 },

  // -- universities --
  { name: "MIT", aliases: ["Massachusetts Institute of Technology", "MIT CSAIL"], kind: "university", city: "Cambridge", country: "US", lat: 42.36, lng: -71.094 },
  { name: "Stanford University", aliases: ["Stanford", "Stanford HAI"], kind: "university", city: "Stanford", country: "US", lat: 37.428, lng: -122.17 },
  { name: "UC Berkeley", aliases: ["Berkeley", "University of California, Berkeley"], kind: "university", city: "Berkeley", country: "US", lat: 37.872, lng: -122.259 },
  { name: "Carnegie Mellon University", aliases: ["CMU", "Carnegie Mellon"], kind: "university", city: "Pittsburgh", country: "US", lat: 40.443, lng: -79.944 },
  { name: "University of Oxford", aliases: ["Oxford"], kind: "university", city: "Oxford", country: "GB", lat: 51.755, lng: -1.254 },
  { name: "University of Cambridge", kind: "university", city: "Cambridge", country: "GB", lat: 52.204, lng: 0.115 },
  { name: "ETH Zurich", aliases: ["ETH"], kind: "university", city: "Zurich", country: "CH", lat: 47.376, lng: 8.548 },
  { name: "Tsinghua University", aliases: ["Tsinghua"], kind: "university", city: "Beijing", country: "CN", lat: 40.003, lng: 116.327 },
  { name: "Peking University", kind: "university", city: "Beijing", country: "CN", lat: 39.987, lng: 116.306 },
  { name: "University of Toronto", aliases: ["Vector Institute"], kind: "university", city: "Toronto", country: "CA", lat: 43.663, lng: -79.397 },

  // -- government / standards --
  { name: "NIST", aliases: ["NVD", "National Institute of Standards and Technology"], kind: "government", city: "Gaithersburg", country: "US", lat: 39.143, lng: -77.201 },
  { name: "MITRE", aliases: ["CVE Program"], kind: "government", city: "McLean", country: "US", lat: 38.934, lng: -77.177 },
  { name: "CISA", kind: "government", city: "Washington", country: "US", lat: 38.907, lng: -77.037 },
  { name: "European Commission", aliases: ["EU AI Office", "European Union"], kind: "government", city: "Brussels", country: "BE", lat: 50.85, lng: 4.352 },
  { name: "UK AI Security Institute", aliases: ["AISI", "AI Safety Institute"], kind: "government", city: "London", country: "GB", lat: 51.503, lng: -0.128 },
  { name: "Europol", kind: "government", city: "The Hague", country: "NL", lat: 52.071, lng: 4.301 },

  // -- publications (as sponsors of record) --
  { name: "arXiv", aliases: ["arXiv researchers", "arXiv authors"], kind: "publication", city: "Ithaca", country: "US", lat: 42.444, lng: -76.502, homepage: "https://arxiv.org" },
  { name: "Nature", aliases: ["Nature Portfolio", "Springer Nature"], kind: "publication", city: "London", country: "GB", lat: 51.507, lng: -0.128 },
  { name: "AAAI", aliases: ["Association for the Advancement of Artificial Intelligence"], kind: "publication", city: "Washington", country: "US", lat: 38.907, lng: -77.037 },
];
