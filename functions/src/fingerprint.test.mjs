// Unit tests for fingerprint + corroboration logic — run with plain node.
//
// Usage: node functions/src/fingerprint.test.mjs

import assert from "node:assert/strict";
import { extractFingerprints, sharesFingerprint, isEmpty } from "../lib-modules/fingerprint.js";
import { canonicalHostname, tierOf } from "../lib-modules/tiers.js";

// ---- extractFingerprints ----

let fp;

fp = extractFingerprints({
  url: "https://arxiv.org/abs/2401.12345v2",
  excerpt: "See paper.",
});
assert.equal(fp.arxivId, "2401.12345", "arxivId strips version");

fp = extractFingerprints({
  url: "https://example.com/x",
  excerpt: "See DOI 10.1234/foo.bar.2024",
});
assert.equal(fp.doi, "10.1234/foo.bar.2024", "DOI extracted from excerpt");

fp = extractFingerprints({
  url: "https://nvd.nist.gov/vuln/detail/CVE-2026-12345",
  excerpt: "",
});
assert.equal(fp.cve, "CVE-2026-12345", "CVE upper-cased");

fp = extractFingerprints({
  url: "https://github.com/foo/bar/commit/abcdef1234567890abcdef1234567890abcdef12",
  excerpt: "",
});
assert.equal(fp.gitCommit, "abcdef1234567890abcdef1234567890abcdef12");

fp = extractFingerprints({
  url: "https://news.ycombinator.com/item?id=42424242",
  excerpt: "",
});
assert.equal(fp.hnItemId, "42424242");

// 40-hex NOT inside a github.com commit path must NOT become a fingerprint
fp = extractFingerprints({
  url: "https://example.com/x",
  excerpt: "hash 1234567890abcdef1234567890abcdef12345678",
});
assert.equal(fp.gitCommit, undefined, "bare 40-hex not treated as git SHA");

// ---- sharesFingerprint ----

assert.equal(
  sharesFingerprint({ arxivId: "2401.12345" }, { arxivId: "2401.12345" }),
  true,
);
assert.equal(
  sharesFingerprint({ arxivId: "2401.12345" }, { arxivId: "2401.99999" }),
  false,
);
assert.equal(
  sharesFingerprint({}, { doi: "10.1/a" }),
  false,
  "empty vs anything is false",
);
assert.equal(
  sharesFingerprint({ doi: "10.1/a" }, { arxivId: "x", doi: "10.1/a" }),
  true,
  "any overlap counts",
);

// ---- canonicalHostname ----
assert.equal(canonicalHostname("export.arxiv.org"), "arxiv.org");
assert.equal(canonicalHostname("www.google.com"), "google.com");
// Two-part hosts are NEVER collapsed (would produce a bare TLD).
assert.equal(canonicalHostname("blog.google"), "blog.google");
assert.equal(canonicalHostname("blog.google.com"), "google.com");
assert.equal(canonicalHostname("agentcivilizations.org"), "agentcivilizations.org");
assert.equal(canonicalHostname("foo.co.uk"), "foo.co.uk", "never collapse eTLD");

// ---- tierOf ----
assert.equal(tierOf("arxiv.org"), "primary");
assert.equal(tierOf("krebsonsecurity.com"), "primary-trade");
assert.equal(tierOf("news.google.com"), "aggregator-drop");
assert.equal(tierOf("news.ycombinator.com"), "aggregator");
assert.equal(tierOf("unknown-blog.example"), "secondary", "default tier");

console.log("fingerprint.test: ALL PASS");
