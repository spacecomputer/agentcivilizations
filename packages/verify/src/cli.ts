#!/usr/bin/env node
// The standalone verifier.
//
// It reads Firestore's public REST endpoints directly and recomputes
// every hash locally. It needs no account, no key, and nothing from the
// register but the numbers it is checking. If this program disagrees
// with agentcivilizations.org, believe this program.

import {
  computeMerkleRoot,
  inclusionProof,
  rootAlgoOf,
  verifyChain,
  verifyInclusion,
  verifyRoot,
  type VerifiableEvent as Event,
  type VerifiableRoot as Root,
} from "./index.js";

const FIRESTORE_BASE =
  process.env.FIRESTORE_BASE ??
  "https://firestore.googleapis.com/v1/projects/agent-civilizations/databases/(default)/documents";

const PAGE = 300;

async function runQuery(structuredQuery: unknown): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(`${FIRESTORE_BASE}:runQuery`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ structuredQuery }),
  });
  if (!res.ok) throw new Error(`Firestore query failed: ${res.status} ${await res.text()}`);
  const rows = (await res.json()) as Array<{ document?: { fields: Record<string, unknown> } }>;
  return rows.filter((r) => r.document).map((r) => decodeFirestore(r.document!.fields));
}

async function fetchEvents(civilizationId: string): Promise<Event[]> {
  return (await runQuery({
    from: [{ collectionId: "events" }],
    where: {
      fieldFilter: {
        field: { fieldPath: "civilizationId" },
        op: "EQUAL",
        value: { stringValue: civilizationId },
      },
    },
    orderBy: [{ field: { fieldPath: "seq" }, direction: "ASCENDING" }],
  })) as Event[];
}

// The same window computeDailyRoot seals: recordedAt within the UTC day.
// Paged on recordedAt so a busy day is not truncated.
async function fetchDayEvents(day: string): Promise<Event[]> {
  const out: Event[] = [];
  let cursor = `${day}T00:00:00.000Z`;
  const end = `${day}T23:59:59.999Z`;
  for (;;) {
    const page = (await runQuery({
      from: [{ collectionId: "events" }],
      where: {
        compositeFilter: {
          op: "AND",
          filters: [
            { fieldFilter: { field: { fieldPath: "recordedAt" }, op: "GREATER_THAN_OR_EQUAL", value: { stringValue: cursor } } },
            { fieldFilter: { field: { fieldPath: "recordedAt" }, op: "LESS_THAN_OR_EQUAL", value: { stringValue: end } } },
          ],
        },
      },
      orderBy: [{ field: { fieldPath: "recordedAt" }, direction: "ASCENDING" }],
      limit: PAGE,
    })) as Event[];
    const fresh = page.filter((e) => !out.some((o) => o.id === e.id));
    out.push(...fresh);
    if (page.length < PAGE || fresh.length === 0) break;
    cursor = page[page.length - 1].recordedAt;
  }
  return out;
}

async function fetchRoot(day: string): Promise<Root | null> {
  const res = await fetch(`${FIRESTORE_BASE}/roots/${day}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore fetch failed: ${res.status}`);
  const doc = (await res.json()) as { fields: Record<string, unknown> };
  return decodeFirestore(doc.fields) as unknown as Root;
}

async function fetchEvent(id: string): Promise<Event | null> {
  const res = await fetch(`${FIRESTORE_BASE}/events/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore fetch failed: ${res.status}`);
  const doc = (await res.json()) as { fields: Record<string, unknown> };
  return decodeFirestore(doc.fields) as unknown as Event;
}

// Minimal Firestore REST value decoder — enough for our schema.
function decodeFirestore(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = decodeValue(v);
  return out;
}
function decodeValue(v: unknown): unknown {
  const obj = v as Record<string, unknown>;
  if ("stringValue" in obj) return obj.stringValue;
  if ("integerValue" in obj) return Number(obj.integerValue);
  if ("doubleValue" in obj) return obj.doubleValue;
  if ("booleanValue" in obj) return obj.booleanValue;
  if ("nullValue" in obj) return null;
  if ("timestampValue" in obj) return obj.timestampValue;
  if ("arrayValue" in obj) {
    const arr = (obj.arrayValue as { values?: unknown[] }).values ?? [];
    return arr.map(decodeValue);
  }
  if ("mapValue" in obj) {
    const map = (obj.mapValue as { fields?: Record<string, unknown> }).fields ?? {};
    return decodeFirestore(map);
  }
  return null;
}

const USAGE = `agent-civilizations-verify — recompute the register's hashes locally

  --civilization=<id>    walk one file's chain: every contentHash, prevHash and seq
  --root=YYYY-MM-DD      reseal a day from its entries and compare with the sealed root
  --event=<id>           prove one entry is inside its day's sealed root
  --json                 machine-readable output

Reads public Firestore REST endpoints; no account or key is needed.
Exit codes: 0 verified · 2 mismatch · 1 error · 64 usage.`;

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [k, v = "true"] = arg.replace(/^--/, "").split("=");
      return [k, v];
    }),
  ) as Record<string, string>;
  const asJson = args.json === "true";
  const emit = (obj: unknown, human: string) => {
    console.log(asJson ? JSON.stringify(obj, null, 2) : human);
  };

  if (args.civilization) {
    const events = await fetchEvents(args.civilization);
    if (!events.length) {
      console.error(`No entries for file ${args.civilization}`);
      process.exit(1);
    }
    const result = await verifyChain(events);
    emit(
      result,
      result.ok
        ? `VERIFIED  ${result.verified} ${result.verified === 1 ? "entry" : "entries"} in ${args.civilization}: every contentHash recomputed, every prevHash links, seq unbroken.`
        : `BROKEN    ${args.civilization} at entry ${result.brokenAt} (${result.reason}); ${result.verified} ${result.verified === 1 ? "entry" : "entries"} verified before it.`,
    );
    process.exit(result.ok ? 0 : 2);
  }

  if (args.root) {
    const root = await fetchRoot(args.root);
    if (!root) {
      console.error(`No sealed root for ${args.root}`);
      process.exit(1);
    }
    const events = await fetchDayEvents(args.root);
    const result = await verifyRoot(root, events.map((e) => e.contentHash));
    const counted = events.length === root.eventCount;
    emit(
      { ...result, day: args.root, entriesFetched: events.length, entriesSealed: root.eventCount, countMatches: counted },
      result.ok
        ? `VERIFIED  ${args.root}: ${events.length} ${events.length === 1 ? "entry reseals" : "entries reseal"} to ${result.claimed} under ${result.algo}.`
        : `MISMATCH  ${args.root} under ${result.algo}\n          sealed   ${result.claimed}\n          resealed ${result.computed} from ${events.length} entries (root claims ${root.eventCount}).`,
    );
    process.exit(result.ok ? 0 : 2);
  }

  if (args.event) {
    const event = await fetchEvent(args.event);
    if (!event) {
      console.error(`No entry ${args.event}`);
      process.exit(1);
    }
    const day = String(event.recordedAt).slice(0, 10);
    const root = await fetchRoot(day);
    if (!root) {
      console.error(`Entry ${args.event} was recorded on ${day}, which is not sealed yet.`);
      process.exit(1);
    }
    if (rootAlgoOf(root) !== "merkle-v2") {
      // flat-v1 proves the day's set, not one entry's place in it.
      const events = await fetchDayEvents(day);
      const result = await verifyRoot(root, events.map((e) => e.contentHash));
      const present = events.some((e) => e.contentHash === event.contentHash);
      emit(
        { day, algo: result.algo, inclusion: present && result.ok, resealed: result.ok, note: "flat-v1 has no per-entry proof; the whole day was resealed instead" },
        present && result.ok
          ? `VERIFIED  ${args.event} is among the ${events.length} entries that reseal to ${day}'s root (flat-v1 has no per-entry proof, so the day was resealed in full).`
          : `MISMATCH  ${args.event} could not be shown inside ${day}'s root.`,
      );
      process.exit(present && result.ok ? 0 : 2);
    }
    const events = await fetchDayEvents(day);
    const proof = await inclusionProof(events.map((e) => e.contentHash), event.contentHash, day);
    if (!proof) {
      console.error(`Entry ${args.event} is not among ${day}'s sealed entries.`);
      process.exit(2);
    }
    const check = await verifyInclusion(proof, root.merkleRoot);
    emit(
      { ...check, day, proof },
      check.ok
        ? `VERIFIED  ${args.event} is inside ${day}'s sealed root.\n          ${proof.path.length} sibling hashes over ${proof.treeSize} entries fold to ${check.claimed}.`
        : `MISMATCH  ${args.event}\n          sealed   ${check.claimed}\n          computed ${check.computed}`,
    );
    process.exit(check.ok ? 0 : 2);
  }

  console.error(USAGE);
  process.exit(64);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
