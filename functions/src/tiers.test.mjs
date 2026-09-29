// Publisher-alias tests — a corroboration control, not cosmetics.
//
// Usage: node functions/src/tiers.test.mjs

import assert from "node:assert/strict";
import { canonicalHostname, tierOf } from "../lib-modules/tiers.js";

// A lab's safety blog is the same publisher as its newsroom. If these
// resolved to different canonical domains, one company covering its own
// incident twice would satisfy the corroboration rule and the entry would
// be marked CONFIRMED on nobody's word but its own.
assert.equal(canonicalHostname("alignment.openai.com"), "openai.com");
assert.equal(canonicalHostname("openai.com"), "openai.com");
assert.equal(
  canonicalHostname("alignment.openai.com"),
  canonicalHostname("www.openai.com"),
  "OpenAI's alignment blog and newsroom must not corroborate each other",
);

// And it must still be tiered as what it is: a first party.
assert.equal(tierOf(canonicalHostname("alignment.openai.com")), "primary");

// The generic collapse still works, and unrelated hosts are left alone.
assert.equal(canonicalHostname("export.arxiv.org"), "arxiv.org");
assert.equal(canonicalHostname("www.dwarkesh.com"), "dwarkesh.com");
assert.equal(canonicalHostname("www.planned-obsolescence.org"), "planned-obsolescence.org");
assert.notEqual(canonicalHostname("alignment.example.com"), "example.com");

// Independent analysis is secondary, and genuinely independent of the lab.
assert.equal(tierOf("planned-obsolescence.org"), "secondary");
assert.notEqual(
  canonicalHostname("www.planned-obsolescence.org"),
  canonicalHostname("alignment.openai.com"),
  "a METR researcher's analysis must be able to corroborate OpenAI",
);

console.log("tiers.test: ALL PASS");
