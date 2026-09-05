// What a retraction must carry before it can touch the ledger.
// Pure validation only: a real retraction writes a permanent, anchored
// record, so it is never exercised against the live register in a test.

import assert from "node:assert/strict";
import { validateRetraction, RETRACTION_REASONS, MIN_NOTES } from "../lib-modules/retract.js";

const good = { eventId: "01M1DTCRTR94N543PXHNQSW22A", reason: "misclassified", notes: "Belongs to the security file, not coordination." };

const ok = validateRetraction(good);
assert.ok(ok.ok, "a complete retraction validates");
assert.equal(ok.notes, good.notes);

assert.equal(validateRetraction({ ...good, eventId: "" }).ok, false, "an entry id is required");
assert.equal(validateRetraction({ ...good, reason: undefined }).ok, false, "a reason is required");
assert.equal(validateRetraction({ ...good, reason: "because" }).ok, false, "the reason comes from a closed list");
assert.equal(validateRetraction({ ...good, notes: "wrong" }).ok, false, "a bare 'wrong' is not an explanation");
assert.equal(validateRetraction({ ...good, notes: "   " }).ok, false, "whitespace is not an explanation");
assert.equal(validateRetraction({ ...good, notes: "x".repeat(MIN_NOTES) }).ok, true, "the floor is inclusive");
assert.equal(validateRetraction({ ...good, notes: "x".repeat(MIN_NOTES - 1) }).ok, false, "one short is refused");
assert.equal(validateRetraction({ ...good, notes: `  ${"x".repeat(MIN_NOTES)}  ` }).notes.length, MIN_NOTES, "notes are trimmed");

for (const reason of RETRACTION_REASONS) {
  assert.ok(validateRetraction({ ...good, reason }).ok, `${reason} is a valid reason`);
}
assert.deepEqual([...RETRACTION_REASONS], ["duplicate", "source-retracted", "misclassified", "hoax"], "the reason list matches docs/RETRACTIONS.md");

console.log("retract.test: ALL PASS");
