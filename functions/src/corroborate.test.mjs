// Corroboration predicate tests — the load-bearing rule.
//
// Usage: node functions/src/corroborate.test.mjs

import assert from "node:assert/strict";
import { corroborates, corroboratesCrossCiv, eventDomains, normalizeActor } from "../lib-modules/hashchain.js";

const ev = (id, sources) => ({
  id,
  civilizationId: "test-civ",
  title: "x",
  summary: "y",
  occurredAt: "2026-01-01T00:00:00Z",
  recordedAt: "2026-01-01T00:00:00Z",
  category: "coordination",
  confidence: "candidate",
  sources,
  actors: [],
  tags: [],
  retracts: [],
  prevHash: null,
  seq: 0,
  contentHash: `hash-${id}`,
});

const src = (opts) => ({
  url: "https://example.com/x",
  domain: "example.com",
  title: "t",
  fetchedAt: "2026-01-01T00:00:00Z",
  rawExcerpt: "",
  ...opts,
});

// -- happy: two different primary sources, no shared fingerprint --
{
  const a = ev("a", [src({ canonicalDomain: "arxiv.org", sourceTier: "primary" })]);
  const b = ev("b", [src({ canonicalDomain: "krebsonsecurity.com", sourceTier: "primary-trade" })]);
  assert.equal(corroborates(a, b), true, "different domains, no fp = corroborate");
  assert.equal(corroborates(b, a), true, "symmetry");
}

// -- BUG FIX: cs.AI + cs.MA cross-listing of the SAME arxiv paper — must NOT corroborate --
{
  const a = ev("a", [
    src({
      canonicalDomain: "arxiv.org",
      sourceTier: "primary",
      fingerprints: { arxivId: "2401.99999" },
    }),
  ]);
  const b = ev("b", [
    src({
      canonicalDomain: "arxiv.org",
      sourceTier: "primary",
      fingerprints: { arxivId: "2401.99999" },
    }),
  ]);
  assert.equal(corroborates(a, b), false, "shared arxivId = same report");
}

// -- BUG FIX: v1 and v2 of arxiv paper canonicalized identically --
{
  // extractFingerprints strips versions, so both should share id after that.
  // We assert the corroborates rule when the fingerprint has already been
  // canonicalized upstream.
  const a = ev("a", [
    src({ canonicalDomain: "arxiv.org", fingerprints: { arxivId: "2401.99999" } }),
  ]);
  const b = ev("b", [
    src({ canonicalDomain: "arxiv.org", fingerprints: { arxivId: "2401.99999" } }),
  ]);
  assert.equal(corroborates(a, b), false, "v1/v2 same paper");
}

// -- BUG FIX: news.google.com aggregator is DROPPED --
{
  const a = ev("a", [
    src({ canonicalDomain: "krebsonsecurity.com", sourceTier: "primary-trade" }),
  ]);
  const b = ev("b", [
    src({ canonicalDomain: "news.google.com", sourceTier: "aggregator-drop" }),
  ]);
  assert.equal(corroborates(a, b), false, "aggregator-drop peer excluded");
}

// -- BUG FIX: subdomain collapse — arxiv.org and export.arxiv.org are ONE --
{
  const a = ev("a", [src({ canonicalDomain: "arxiv.org" })]);
  const b = ev("b", [src({ canonicalDomain: "arxiv.org" })]);
  assert.equal(
    corroborates(a, b),
    false,
    "same canonicalDomain does not corroborate",
  );
}

// -- BUG FIX: covered even when different sources but shared DOI --
{
  const a = ev("a", [
    src({
      canonicalDomain: "arxiv.org",
      fingerprints: { doi: "10.1234/paper" },
    }),
  ]);
  const b = ev("b", [
    src({
      canonicalDomain: "theregister.com",
      fingerprints: { doi: "10.1234/paper" },
    }),
  ]);
  assert.equal(
    corroborates(a, b),
    false,
    "shared DOI = same report even across domains",
  );
}

// -- happy: shared civ, two independent primary sources, no shared fp --
{
  const a = ev("a", [
    src({
      canonicalDomain: "nvd.nist.gov",
      sourceTier: "primary",
      fingerprints: { cve: "CVE-2026-0001" },
    }),
  ]);
  const b = ev("b", [
    src({
      canonicalDomain: "krebsonsecurity.com",
      sourceTier: "primary-trade",
      fingerprints: { cve: "CVE-2026-0002" }, // DIFFERENT cve
    }),
  ]);
  assert.equal(corroborates(a, b), true, "different cve = independent coverage");
}

// -- edge: event with no sources cannot corroborate anyone --
{
  const a = ev("a", []);
  const b = ev("b", [src({ canonicalDomain: "arxiv.org" })]);
  assert.equal(corroborates(a, b), false);
  assert.equal(corroborates(b, a), false);
}

// -- eventDomains filters aggregator-drop --
{
  const e = ev("e", [
    src({ canonicalDomain: "arxiv.org", sourceTier: "primary" }),
    src({ canonicalDomain: "news.google.com", sourceTier: "aggregator-drop" }),
  ]);
  const domains = eventDomains(e).map((d) => d.canonical);
  assert.deepEqual(domains, ["arxiv.org"], "aggregator-drop stripped");
}

// ---- cross-civ ----

// normalizeActor should strip role suffixes
assert.equal(normalizeActor("OpenAI project"), "openai");
assert.equal(normalizeActor("Hugging Face"), "hugging face");
assert.equal(normalizeActor("Anthropic Labs"), "anthropic");
assert.equal(normalizeActor("Red Team"), "red");
// hyphens preserved
assert.equal(normalizeActor("agent-swarm-collective"), "agent-swarm-collective");

// two events in DIFFERENT civilizations sharing ≥2 actors — cross-civ fires
{
  const a = { ...ev("a", [src({ canonicalDomain: "example.com", sourceTier: "secondary" })]), civilizationId: "hf-hack", actors: ["OpenAI", "Hugging Face", "researchers"] };
  const b = { ...ev("b", [src({ canonicalDomain: "other.com", sourceTier: "secondary" })]), civilizationId: "openai-breach", actors: ["OpenAI project", "Hugging Face", "security team"] };
  assert.equal(corroboratesCrossCiv(a, b), true, "two shared actors across civs = cross-civ corroborate");
  // corroborates() alone (same-civ predicate) still fires because domains differ and no shared fingerprint
  assert.equal(corroborates(a, b), true, "same-civ predicate satisfied too");
}

// only ONE shared actor across civs — cross-civ does NOT fire
{
  const a = { ...ev("a", [src({ canonicalDomain: "example.com" })]), civilizationId: "openai-x", actors: ["OpenAI", "researchers"] };
  const b = { ...ev("b", [src({ canonicalDomain: "other.com" })]), civilizationId: "openai-y", actors: ["OpenAI", "security team"] };
  assert.equal(corroboratesCrossCiv(a, b), false, "one shared actor = insufficient for cross-civ");
}

// same civ + shared fingerprint = NOT cross-civ (would double-count)
{
  const a = { ...ev("a", [src({ canonicalDomain: "arxiv.org", fingerprints: { arxivId: "2401.X" } })]), actors: ["Lab A", "Author X"] };
  const b = { ...ev("b", [src({ canonicalDomain: "arxiv.org", fingerprints: { arxivId: "2401.X" } })]), actors: ["Lab A", "Author X"] };
  assert.equal(corroboratesCrossCiv(a, b), false, "shared fingerprint disqualifies");
}

console.log("corroborate.test: ALL PASS");
