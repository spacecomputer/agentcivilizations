// Formatting conventions of the register. See docs/DESIGN.md.

// Record numbers are written "No. 12,847" — never "№" (glyph coverage
// across the three faces is unverified; a fallback glyph in the crest
// is a brand wound).
export function recordNo(n: number): string {
  return `No. ${n.toLocaleString("en-US")}`;
}

// Hashes display chunked in 8-character groups; the raw string is
// preserved for copying.
export function chunkHash(hash: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < hash.length; i += 8) chunks.push(hash.slice(i, i + 8));
  return chunks;
}

export function shortHash(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-4)}`;
}

// Timestamps are always UTC, always mono.
export function utcDay(iso: string): string {
  return iso.slice(0, 10);
}

export function utcTime(iso: string): string {
  return `${iso.slice(11, 16)} UTC`;
}

export function utcStamp(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

// Call numbers: the civilization slug set as an archival call number.
export function callNumber(civilizationId: string): string {
  return `FILE ${civilizationId.toUpperCase()}`;
}

export function daysBetween(aIso: string, bIso: string): number {
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);
  return Math.round(Math.abs(b - a) / 86400_000);
}

// ---- file display names -------------------------------------------------
// Every one of the 293 files is named with its own URL slug, because
// scan.ts passes `civilizationName: o.civilizationHint` and the classifier
// prompt only ever asks for a kebab-case slug. So the <title>, the <h1> and
// the share card of every file page read "agent-driven-ransomware".
//
// The slug is the file's call number and stays visible as one, in mono, where
// the register uses call numbers. This is only for the places a person reads
// a name: the heading, the page title, the meta description, the card.
//
// A stored name that differs from the id means someone or something supplied
// a real name, and that always wins — so this quietly retires itself as the
// pipeline starts producing names.

const ACRONYMS = new Set([
  "ai", "ml", "nlp", "llm", "llms", "mas", "rag", "api", "apis", "sdk", "cli",
  "cve", "cwe", "rce", "ssrf", "xss", "csrf", "mcp", "dns", "http", "https",
  "url", "uri", "json", "xml", "csv", "sql", "db", "os", "ui", "ux", "qa",
  "ci", "cd", "iam", "sso", "mfa", "otp", "tls", "ssl", "c2", "apt", "edr",
  "siem", "iot", "p2p", "saas", "gpu", "cpu", "pr", "prs", "id", "ids", "ip",
  "eu", "us", "uk", "un", "gdpr", "nist", "oecd", "ietf", "aaai", "adk",
  "acl", "arxiv", "hn", "faq", "dao", "nft", "sre", "ceo", "cto",
  "aepd", "cnil", "ico", "fbi", "cisa", "enisa", "nsa", "sec", "ftc", "nhtsa",
]);

// Names the world spells a particular way and no rule would recover.
const BRANDS: Record<string, string> = {
  openai: "OpenAI", github: "GitHub", gitlab: "GitLab", huggingface: "Hugging Face",
  deepmind: "DeepMind", dolthub: "DoltHub", doltlite: "DoltLite", arxiv: "arXiv",
  npm: "npm", pypi: "PyPI", youtube: "YouTube", linkedin: "LinkedIn",
  javascript: "JavaScript", typescript: "TypeScript", postgres: "PostgreSQL",
  anthropic: "Anthropic", nvidia: "NVIDIA", ibm: "IBM", aws: "AWS", gcp: "GCP",
  langchain: "LangChain", autogpt: "AutoGPT", chatgpt: "ChatGPT", devops: "DevOps",
};

/** The name a person should read for a file, derived from its slug if needed. */
export function fileName(id: string, storedName?: string | null): string {
  // A real name was supplied — use it, untouched.
  if (storedName && storedName !== id) return storedName;
  return id
    .split("-")
    .map((w) => {
      if (!w) return w;
      if (BRANDS[w]) return BRANDS[w];
      if (ACRONYMS.has(w)) return w.toUpperCase();
      // A bare version or year stays as written: "gpt", "5", "2026".
      if (/^\d+$/.test(w)) return w;
      return w[0].toUpperCase() + w.slice(1);
    })
    .join(" ");
}
