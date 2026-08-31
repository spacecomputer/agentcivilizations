#!/usr/bin/env node
import { verifyChain, verifyRoot } from "./index.js";
import type { Event, Root } from "@agent-civilizations/schema";

const FIRESTORE_BASE =
  process.env.FIRESTORE_BASE ??
  "https://firestore.googleapis.com/v1/projects/agent-civilizations/databases/(default)/documents";

async function fetchEvents(civilizationId: string): Promise<Event[]> {
  const url = `${FIRESTORE_BASE}:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: "events" }],
      where: {
        fieldFilter: {
          field: { fieldPath: "civilizationId" },
          op: "EQUAL",
          value: { stringValue: civilizationId },
        },
      },
      orderBy: [{ field: { fieldPath: "seq" }, direction: "ASCENDING" }],
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Firestore query failed: ${res.status}`);
  const rows = (await res.json()) as Array<{ document?: { fields: Record<string, unknown> } }>;
  return rows
    .filter((r) => r.document)
    .map((r) => decodeFirestore(r.document!.fields) as Event);
}

async function fetchRoot(day: string): Promise<Root | null> {
  const res = await fetch(`${FIRESTORE_BASE}/roots/${day}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore fetch failed: ${res.status}`);
  const doc = (await res.json()) as { fields: Record<string, unknown> };
  return decodeFirestore(doc.fields) as Root;
}

// Minimal Firestore REST value decoder — enough for our schema.
function decodeFirestore(fields: Record<string, unknown>): unknown {
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

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [k, v = "true"] = arg.replace(/^--/, "").split("=");
      return [k, v];
    }),
  );

  if (args.civilization) {
    const events = await fetchEvents(args.civilization as string);
    if (!events.length) {
      console.error(`No events for civilization ${args.civilization}`);
      process.exit(1);
    }
    const result = await verifyChain(events);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 2);
  }

  if (args.root) {
    const root = await fetchRoot(args.root as string);
    if (!root) {
      console.error(`No root for ${args.root}`);
      process.exit(1);
    }
    // Requires the caller to have fetched every event contentHash for that day.
    console.error("Root verification requires --hashes=path/to/hashes.json");
    process.exit(2);
  }

  console.error(`Usage:
  agent-civilizations-verify --civilization=<id>
  agent-civilizations-verify --root=YYYY-MM-DD --hashes=hashes.json`);
  process.exit(64);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
