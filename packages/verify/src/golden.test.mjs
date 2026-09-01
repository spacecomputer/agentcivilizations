// Golden-fixture test: every historical event's stored contentHash must
// still recompute from our current canonicalize() + hashPreimage(). Run
// after any schema addition to prove no chain break.
//
// Usage: node packages/verify/src/golden.test.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { computeContentHash } from "../dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, "__fixtures__/live-snapshot.json");
const events = JSON.parse(readFileSync(fixturePath, "utf8"));

let ok = 0;
let fail = 0;
const failures = [];
for (const e of events) {
  const stored = e.contentHash;
  const recomputed = await computeContentHash(e);
  if (stored === recomputed) ok++;
  else {
    fail++;
    failures.push({ id: e.id, stored, recomputed });
  }
}

console.log(`golden fixture: ${ok}/${events.length} events reproduce stored hash`);
if (fail > 0) {
  console.error("--- HASH DRIFT ---");
  for (const f of failures.slice(0, 5)) console.error(f);
  process.exit(1);
}
