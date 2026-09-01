import type { Fingerprints } from "@agent-civilizations/schema";

// Extract strong external identifiers from a candidate's URL + excerpt.
// These are the join keys for identifier-based corroboration: two sources
// sharing any fingerprint are the same underlying report, so they cannot
// count as independent confirmation of each other.
//
// Rules:
// - Every regex is conservative — false positives poison corroboration.
// - Normalize to a canonical form (lowercase, prefix-stripped).
// - Return only fields we actually found; the caller stores the object
//   only if it has at least one key (canonicalize() drops undefined so
//   an all-undefined Fingerprints becomes {}). Callers should treat an
//   empty result as "no fingerprint" and skip attaching it.

const DOI_RE = /\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i;
const ARXIV_RE = /\barxiv(?:\.org)?[\/:](?:abs\/|pdf\/)?(\d{4}\.\d{4,5}(?:v\d+)?)/i;
const ARXIV_OLD_RE = /\barxiv[.\/:]([a-z-]+(?:\.[A-Z]{2})?\/\d{7})/i;
// CVE-YYYY-N+ where N has 4+ digits. Uppercase in output.
const CVE_RE = /\b(CVE-\d{4}-\d{4,7})\b/i;
// Git SHA: 40 hex chars, but ONLY count it when the URL is a github.com
// commit path — otherwise 40-hex strings collide with content hashes,
// SBOM digests, and other unrelated hexadecimal.
const GITHUB_COMMIT_URL_RE = /\bgithub\.com\/[^/\s]+\/[^/\s]+\/(?:commit|tree|blob)\/([a-f0-9]{40})\b/i;
// HN item id — canonical url form.
const HN_ITEM_RE = /news\.ycombinator\.com\/item\?id=(\d+)/i;

export function extractFingerprints(input: {
  url: string;
  excerpt?: string;
}): Fingerprints {
  const bag = `${input.url}\n${input.excerpt ?? ""}`;
  const out: Fingerprints = {};

  const doi = bag.match(DOI_RE);
  if (doi) out.doi = doi[1].toLowerCase();

  const arxiv = bag.match(ARXIV_RE) ?? bag.match(ARXIV_OLD_RE);
  if (arxiv) {
    // Strip version suffix (v2, v3) to canonicalise: v1 and v2 of the
    // same paper are the same underlying claim for corroboration
    // purposes.
    out.arxivId = arxiv[1].replace(/v\d+$/, "").toLowerCase();
  }

  const cve = bag.match(CVE_RE);
  if (cve) out.cve = cve[1].toUpperCase();

  const gh = input.url.match(GITHUB_COMMIT_URL_RE);
  if (gh) out.gitCommit = gh[1].toLowerCase();

  const hn = input.url.match(HN_ITEM_RE);
  if (hn) out.hnItemId = hn[1];

  return out;
}

export function isEmpty(fp: Fingerprints): boolean {
  return (
    fp.doi === undefined &&
    fp.arxivId === undefined &&
    fp.cve === undefined &&
    fp.gitCommit === undefined &&
    fp.hnItemId === undefined
  );
}

// True iff a and b share at least one fingerprint. Used to identify two
// sources of the same underlying report — they must NOT corroborate.
export function sharesFingerprint(a: Fingerprints, b: Fingerprints): boolean {
  return (
    (a.doi !== undefined && a.doi === b.doi) ||
    (a.arxivId !== undefined && a.arxivId === b.arxivId) ||
    (a.cve !== undefined && a.cve === b.cve) ||
    (a.gitCommit !== undefined && a.gitCommit === b.gitCommit) ||
    (a.hnItemId !== undefined && a.hnItemId === b.hnItemId)
  );
}

// Merge fingerprint sets, preferring the first-seen value for each field.
export function mergeFingerprints(...sets: Fingerprints[]): Fingerprints {
  const out: Fingerprints = {};
  for (const fp of sets) {
    if (out.doi === undefined && fp.doi !== undefined) out.doi = fp.doi;
    if (out.arxivId === undefined && fp.arxivId !== undefined)
      out.arxivId = fp.arxivId;
    if (out.cve === undefined && fp.cve !== undefined) out.cve = fp.cve;
    if (out.gitCommit === undefined && fp.gitCommit !== undefined)
      out.gitCommit = fp.gitCommit;
    if (out.hnItemId === undefined && fp.hnItemId !== undefined)
      out.hnItemId = fp.hnItemId;
  }
  return out;
}
