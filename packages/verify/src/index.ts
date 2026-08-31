import type { Event, Root } from "@agent-civilizations/schema";

// RFC 8785 JSON Canonicalization Scheme — minimal implementation sufficient
// for our event shape. Sorts object keys, no whitespace, JSON.stringify
// handles numbers/strings/booleans/null correctly.
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const parts = keys
    .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
    .map(
      (k) =>
        JSON.stringify(k) + ":" + canonicalize((value as Record<string, unknown>)[k]),
    );
  return "{" + parts.join(",") + "}";
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  // Web Crypto works in browsers, Node 20+, Cloud Workers, Deno.
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const bytes8 = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes8.length; i++) {
    hex += bytes8[i].toString(16).padStart(2, "0");
  }
  return hex;
}

export async function computeContentHash(
  event: Omit<Event, "contentHash">,
): Promise<string> {
  return sha256Hex(canonicalize(event));
}

export interface VerifyResult {
  ok: boolean;
  verified: number;
  brokenAt?: string;
  reason?: "contentHash" | "prevHash" | "seq" | "missing";
}

export async function verifyChain(events: Event[]): Promise<VerifyResult> {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  let prevHash: string | null = null;
  let expectedSeq = 0;

  for (const e of ordered) {
    if (e.seq !== expectedSeq) {
      return { ok: false, verified: expectedSeq, brokenAt: e.id, reason: "seq" };
    }
    if (e.prevHash !== prevHash) {
      return { ok: false, verified: expectedSeq, brokenAt: e.id, reason: "prevHash" };
    }
    const { contentHash, ...rest } = e;
    const recomputed = await computeContentHash(rest);
    if (recomputed !== contentHash) {
      return { ok: false, verified: expectedSeq, brokenAt: e.id, reason: "contentHash" };
    }
    prevHash = contentHash;
    expectedSeq++;
  }
  return { ok: true, verified: ordered.length };
}

export async function computeMerkleRoot(contentHashes: string[]): Promise<string> {
  const sorted = [...contentHashes].sort();
  return sha256Hex(sorted.join(""));
}

export interface RootVerifyResult {
  ok: boolean;
  computed: string;
  claimed: string;
}

export async function verifyRoot(
  root: Root,
  eventContentHashes: string[],
): Promise<RootVerifyResult> {
  const computed = await computeMerkleRoot(eventContentHashes);
  return { ok: computed === root.merkleRoot, computed, claimed: root.merkleRoot };
}
