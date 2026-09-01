import type { SourceTier } from "@agent-civilizations/schema";

// Editorial classification of source hostnames. Peers at tier
// 'aggregator-drop' are excluded from the corroboration set entirely.
// Peers at 'aggregator' still count when a fingerprint proves they carry
// a distinct underlying report (that's what fingerprints are for). This
// map is the register's editorial policy expressed as data — treat
// changes as governance events (documented commit + retraction of any
// events whose confidence tier flips).
export const SOURCE_TIERS: Record<string, SourceTier> = {
  // -- primary: the authoritative first party --
  "arxiv.org": "primary",
  "nvd.nist.gov": "primary",
  "cve.mitre.org": "primary",
  "github.com": "primary",
  "openai.com": "primary",
  "anthropic.com": "primary",
  "deepmind.google": "primary",
  "google.dev": "primary",
  "ai.google.dev": "primary",
  "ai.meta.com": "primary",
  "mistral.ai": "primary",
  "huggingface.co": "primary",
  "cohere.com": "primary",
  "microsoft.com": "primary",
  "research.microsoft.com": "primary",
  "aws.amazon.com": "primary",
  "cloud.google.com": "primary",
  "meta.com": "primary",
  "x.ai": "primary",
  "ollama.com": "primary",
  "openreview.net": "primary",
  "semanticscholar.org": "primary",
  "hackerone.com": "primary",
  "courtlistener.com": "primary",

  // -- primary-trade: named investigative journalism beats --
  "krebsonsecurity.com": "primary-trade",
  "schneier.com": "primary-trade",
  "arstechnica.com": "primary-trade",

  // -- secondary: reputable press coverage --
  "theregister.com": "secondary",
  "wired.com": "secondary",
  "technologyreview.com": "secondary",
  "nytimes.com": "secondary",
  "ft.com": "secondary",
  "economist.com": "secondary",
  "bloomberg.com": "secondary",
  "reuters.com": "secondary",
  "techcrunch.com": "secondary",
  "theverge.com": "secondary",

  // -- aggregator: links to primaries; fingerprint still lets them count --
  "news.ycombinator.com": "aggregator",

  // -- aggregator-drop: peerhood ignored for corroboration --
  "news.google.com": "aggregator-drop",
  "google.com": "aggregator-drop",
};

// Reduce a hostname to its eTLD+1-ish form so subdomain variants
// (export.arxiv.org vs arxiv.org, blog.google vs www.google.com) collapse.
// Conservative: only strips the leftmost label when the remainder still
// has a dot and the leftmost is a common alias (www, blog, api, m, mobile,
// export, feeds, feedproxy). Anything unusual is left alone so we don't
// accidentally collapse foo.co.uk to co.uk.
const COLLAPSIBLE = new Set([
  "www",
  "blog",
  "api",
  "m",
  "mobile",
  "export",
  "feeds",
  "feedproxy",
  "amp",
]);

export function canonicalHostname(host: string): string {
  const lower = host.toLowerCase();
  const parts = lower.split(".");
  if (parts.length >= 3 && COLLAPSIBLE.has(parts[0])) return parts.slice(1).join(".");
  return lower;
}

export function tierOf(canonicalDomain: string): SourceTier {
  return SOURCE_TIERS[canonicalDomain] ?? "secondary";
}

// A bounded HEAD/GET follow to unwrap known aggregator redirect URLs.
// Returns undefined when unwrapping is not possible or not safe.
// - 3s timeout, at most 3 redirect hops
// - Only follows HTTP(S) → HTTP(S), never chains through file/data/javascript
// - Never issues a body-fetching request; HEAD only
// - Never follows to a private-IP / localhost host (SSRF guard)
const AGGREGATOR_HOSTS = new Set([
  "news.google.com",
  "t.co",
  "lnkd.in",
  "buff.ly",
  "bit.ly",
  "ow.ly",
  "hnrss.org",
  "feedproxy.google.com",
]);

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost") return true;
  if (h.endsWith(".localhost")) return true;
  // IPv4 literals — reject 10., 127., 169.254., 172.16-31., 192.168.,
  // and anything that isn't a hostname
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    if (a === 10 || a === 127) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
}

export interface Canonicalized {
  canonicalUrl: string;
  canonicalDomain: string;
  resolvedAt: string;
}

export async function resolveCanonical(
  url: string,
): Promise<Canonicalized | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^www\./, "");
  // Not an aggregator we know how to unwrap — return the canonicalHostname
  // of the input URL.
  if (!AGGREGATOR_HOSTS.has(host)) {
    return {
      canonicalUrl: url,
      canonicalDomain: canonicalHostname(host),
      resolvedAt: new Date().toISOString(),
    };
  }

  try {
    let current = url;
    for (let hops = 0; hops < 3; hops++) {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 3000);
      let res: Response;
      try {
        res = await fetch(current, {
          method: "HEAD",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            "user-agent":
              "agent-civilizations/0.1 (+https://agentcivilizations.org)",
          },
        });
      } finally {
        clearTimeout(t);
      }
      if (res.status >= 200 && res.status < 300) break;
      const loc = res.headers.get("location");
      if (!loc) break;
      const next = new URL(loc, current);
      if (next.protocol !== "http:" && next.protocol !== "https:") return null;
      if (isPrivateHost(next.hostname)) return null;
      current = next.toString();
    }
    const currentUrl = new URL(current);
    if (isPrivateHost(currentUrl.hostname)) return null;
    return {
      canonicalUrl: current,
      canonicalDomain: canonicalHostname(
        currentUrl.hostname.replace(/^www\./, ""),
      ),
      resolvedAt: new Date().toISOString(),
    };
  } catch {
    return null; // timed out / DNS / TLS failure — caller falls back to raw
  }
}
