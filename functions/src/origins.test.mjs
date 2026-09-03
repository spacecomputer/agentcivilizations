// Unit tests for the origins job's rules — run with plain node.
//
// Usage: node functions/src/origins.test.mjs

import assert from "node:assert/strict";
import { _internal } from "../lib-modules/origins.js";

const { isCollectiveName, looksLikePerson, resolveActor, kindFromDescription, nameMatches, exclusionFor } = _internal;

// ---- person-name rule (applied only to names not in the registry) ----
for (const n of ["Anying Chen", "Aleksandr Smechov", "Peiying Zhu", "Ameya Ketkar", "Jean-Luc de Villiers", "Maria del Carmen Ruiz", "J. Robert Oppenheimer"])
  assert.equal(looksLikePerson(n), true, `person: ${n}`);
for (const n of ["Palo Alto Networks", "Cascadia Web Services", "Biggo Finance", "Scale AI", "Mezmo", "Agentimus", "OpenAI", "Reserve Bank", "Softaculous", "AIR Security", "Y Combinator", "Anthropic PBC", "Cognition Labs", "Turing Institute", "Bay Area", "Model Context Protocol"])
  assert.equal(looksLikePerson(n), false, `not a person: ${n}`);

// ---- collective gate ----
for (const n of [
  "arXiv authors (2608.22160)",
  "Unified-MAS authors",
  "researchers",
  "PRC-linked threat actors",
  "Individual litigant",
  "Court (Connecticut)",
  "infostealer operators",
  "OpenEnv community",
  "11 LLM judges",
  "2,500 downstream users",
  "enterprise customers",
  "AI agents",
  "72 benchmark entrants",
  "affected patients (millions)",
  "AI agent swarm",
]) assert.equal(isCollectiveName(n), true, `collective: ${n}`);
for (const n of ["OpenAI", "Hugging Face", "Palo Alto Networks", "National Payments Corporation of India", "Reuters", "Turing", "Scale AI", "Members Exchange", "Bell Labs", "Cisco Systems"])
  assert.equal(isCollectiveName(n), false, `not collective: ${n}`);

// ---- alias resolution ----
const idx = new Map([
  ["openai", "openai"], ["chatgpt", "openai"], ["gpt-5", "openai"],
  ["anthropic", "anthropic"], ["claude", "anthropic"], ["claude-opus", "anthropic"],
  ["google-deepmind", "google-deepmind"], ["google", "google"],
  ["mcp", "anthropic"], // product/protocol doc mapped to its maker
]);
assert.deepEqual(resolveActor("OpenAI", idx), { id: "openai", via: "exact" });
assert.deepEqual(resolveActor("OpenAI (GPT-5-mini)", idx), { id: "openai", via: "parenthetical" });
assert.equal(resolveActor("Google DeepMind Research", idx)?.id, "google-deepmind", "the longest match wins over 'google' (slug normalisation may already strip 'Research')");
assert.deepEqual(resolveActor("Google DeepMind Safety Team", idx), { id: "google-deepmind", via: "prefix" }, "longest prefix wins over 'google'");
assert.deepEqual(resolveActor("Google Cloud", idx), { id: "google", via: "prefix" });
assert.deepEqual(resolveActor("Claude Opus 5.1", idx), { id: "anthropic", via: "prefix" });
assert.equal(resolveActor("Googleplex", idx), null, "prefix must be whole-word");
assert.equal(resolveActor("Mezmo", idx), null);

// ---- kind from description ----
assert.equal(kindFromDescription("news agency"), "publication", "news agency is not government");
assert.equal(kindFromDescription("central bank of India"), "government");
assert.equal(kindFromDescription("American multinational technology company"), "company");
assert.equal(kindFromDescription("open standard protocol for AI tools"), "protocol");
assert.equal(kindFromDescription("Chinese researcher"), "individual");

// ---- Wikidata label match ----
assert.equal(nameMatches("Astra", { id: "Q1", label: "Astra" }, undefined), true);
assert.equal(nameMatches("Astra", { id: "Q1", label: "Astra Aerospace Corporation" }, undefined), false, "description-only hits are refused");
assert.equal(nameMatches("UPI", { id: "Q2", label: "Universitas Pendidikan Indonesia", aliases: ["UPI"] }, undefined), true, "an explicit alias match is accepted (the seed alias then wins)");
assert.equal(nameMatches("NPCI", { id: "Q3", label: "National Payments Corporation of India" }, { aliases: { en: [{ value: "NPCI" }] } }), true);

// ---- exclusions ----
assert.equal(exclusionFor("company"), undefined);
assert.equal(exclusionFor("lab"), undefined);
assert.equal(exclusionFor("individual"), "individual");
assert.equal(exclusionFor("collective"), "collective");
assert.equal(exclusionFor("product"), "product");
assert.equal(exclusionFor("protocol"), "protocol");
assert.equal(exclusionFor("publication"), "publication");
assert.equal(exclusionFor("unknown"), "unknown");

console.log("origins.test: ALL PASS");
