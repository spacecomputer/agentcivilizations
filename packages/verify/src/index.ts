import type { VerifiableEvent as Event, VerifiableRoot as Root, RootAlgo } from "./types.js";

export type { VerifiableEvent, VerifiableRoot, VerifiableSource, RootAlgo } from "./types.js";

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

function bytesToHex(b: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < b.length; i++) hex += b[i].toString(16).padStart(2, "0");
  return hex;
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) {
    throw new Error(`not a hex string: ${hex.slice(0, 16)}`);
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function sha256Bytes(input: Uint8Array): Promise<Uint8Array> {
  // A fresh, exactly-sized buffer: some runtimes reject a view with a
  // non-zero byteOffset, and a subarray of a pooled Buffer is one.
  const copy = new Uint8Array(input.length);
  copy.set(input);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", copy));
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

// The hash preimage covers the immutable record. Two fields are excluded:
// contentHash itself, and `confidence` — the one editorial field that is
// allowed to change after entry (candidate → confirmed when a second
// independent source appears). Everything else is frozen by the chain.
// This list is the single source of truth; producers and verifiers must
// both derive the preimage through hashPreimage().
export const MUTABLE_FIELDS = [
  "contentHash",
  "confidence",
  "confidencePromotedAt",
  "corroboratedAcrossCivs",
] as const;

export function hashPreimage(event: Partial<Event>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...event };
  for (const field of MUTABLE_FIELDS) delete out[field];
  return out;
}

export async function computeContentHash(
  event: Partial<Event>,
): Promise<string> {
  return sha256Hex(canonicalize(hashPreimage(event)));
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
    const recomputed = await computeContentHash(e);
    if (recomputed !== e.contentHash) {
      return { ok: false, verified: expectedSeq, brokenAt: e.id, reason: "contentHash" };
    }
    const contentHash = e.contentHash;
    prevHash = contentHash;
    expectedSeq++;
  }
  return { ok: true, verified: ordered.length };
}

// ---------------------------------------------------------------- roots
//
// Two sealing algorithms live here at once, and both are permanent.
//
// flat-v1 is the register's first: sha256 of the day's sorted content
// hashes, concatenated. It proves the day's set, but says nothing useful
// about one entry — to check a single event a reader must fetch every
// event of that day.
//
// merkle-v2 is an RFC 6962 binary tree over the same sorted leaves. It
// proves the same set, and additionally lets a reader verify that one
// entry is in a sealed, Bitcoin-anchored day by fetching that entry plus
// about log2(n) sibling hashes.
//
// Roots are never recomputed. A root sealed under flat-v1 is verified
// under flat-v1 forever; `rootAlgo` records which, and its absence means
// flat-v1 because every root sealed before the tree existed lacks it.
// The algorithm the register seals NEW days with is DEFAULT_ROOT_ALGO.

export const DEFAULT_ROOT_ALGO: RootAlgo = "merkle-v2";

export function rootAlgoOf(root: Pick<Root, "rootAlgo">): RootAlgo {
  return root.rootAlgo ?? "flat-v1";
}

/** The original sealing: sha256 over the sorted hashes, concatenated. */
export async function computeFlatRoot(contentHashes: string[]): Promise<string> {
  const sorted = [...contentHashes].sort();
  return sha256Hex(sorted.join(""));
}

// RFC 6962 domain separation: a leaf is hashed under 0x00 and an interior
// node under 0x01, so no interior node can ever be forged as a leaf.
async function leafHash(contentHash: string): Promise<Uint8Array> {
  const raw = hexToBytes(contentHash);
  const buf = new Uint8Array(1 + raw.length);
  buf[0] = 0x00;
  buf.set(raw, 1);
  return sha256Bytes(buf);
}
async function nodeHash(left: Uint8Array, right: Uint8Array): Promise<Uint8Array> {
  const buf = new Uint8Array(1 + left.length + right.length);
  buf[0] = 0x01;
  buf.set(left, 1);
  buf.set(right, 1 + left.length);
  return sha256Bytes(buf);
}

// Every level of the tree, leaves first. An odd node is promoted
// unchanged rather than duplicated: duplicating the last leaf makes two
// different leaf sets produce one root (CVE-2012-2459).
async function buildLevels(contentHashes: string[]): Promise<Uint8Array[][]> {
  const sorted = [...contentHashes].sort();
  let level: Uint8Array[] = [];
  for (const h of sorted) level.push(await leafHash(h));
  const levels: Uint8Array[][] = [level];
  while (level.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length ? await nodeHash(level[i], level[i + 1]) : level[i]);
    }
    levels.push(next);
    level = next;
  }
  return levels;
}

/** The RFC 6962 tree root over the day's sorted content hashes. */
export async function computeMerkleTreeRoot(contentHashes: string[]): Promise<string> {
  if (contentHashes.length === 0) return sha256Hex("");
  const levels = await buildLevels(contentHashes);
  return bytesToHex(levels[levels.length - 1][0]);
}

/**
 * Seal a day. `algo` defaults to what the register seals new days with;
 * pass "flat-v1" only to reproduce a historical root.
 */
export async function computeMerkleRoot(
  contentHashes: string[],
  algo: RootAlgo = DEFAULT_ROOT_ALGO,
): Promise<string> {
  return algo === "flat-v1"
    ? computeFlatRoot(contentHashes)
    : computeMerkleTreeRoot(contentHashes);
}

export interface ProofStep {
  hash: string;
  /** Which side the sibling sits on when the pair is hashed. */
  side: "left" | "right";
}
export interface InclusionProof {
  leaf: string; // the event's contentHash
  root: string; // the day's merkleRoot this proof reconstructs
  day?: string;
  path: ProofStep[];
  treeSize: number;
}

/**
 * The sibling path from one entry's leaf to the day's root. Verifiable
 * on its own: a wrong path cannot reconstruct the anchored root.
 */
export async function inclusionProof(
  contentHashes: string[],
  target: string,
  day?: string,
): Promise<InclusionProof | null> {
  const sorted = [...contentHashes].sort();
  let index = sorted.indexOf(target);
  if (index < 0) return null;
  const levels = await buildLevels(sorted);
  const path: ProofStep[] = [];
  for (let l = 0; l < levels.length - 1; l++) {
    const level = levels[l];
    const isRight = index % 2 === 1;
    const siblingIndex = isRight ? index - 1 : index + 1;
    // No sibling means this node was promoted unchanged; nothing to record.
    if (siblingIndex < level.length) {
      path.push({ hash: bytesToHex(level[siblingIndex]), side: isRight ? "left" : "right" });
    }
    index = Math.floor(index / 2);
  }
  return {
    leaf: target,
    root: bytesToHex(levels[levels.length - 1][0]),
    ...(day && { day }),
    path,
    treeSize: sorted.length,
  };
}

/**
 * Replay a proof: hash the leaf, fold in each sibling, compare with the
 * root. Needs nothing but the proof and the root it claims.
 */
export async function verifyInclusion(
  proof: InclusionProof,
  expectedRoot?: string,
): Promise<{ ok: boolean; computed: string; claimed: string }> {
  let node = await leafHash(proof.leaf);
  for (const step of proof.path) {
    const sibling = hexToBytes(step.hash);
    node = step.side === "left" ? await nodeHash(sibling, node) : await nodeHash(node, sibling);
  }
  const computed = bytesToHex(node);
  const claimed = expectedRoot ?? proof.root;
  return { ok: computed === claimed, computed, claimed };
}

export interface RootVerifyResult {
  ok: boolean;
  computed: string;
  claimed: string;
  algo: RootAlgo;
}

export async function verifyRoot(
  root: Root,
  eventContentHashes: string[],
): Promise<RootVerifyResult> {
  const algo = rootAlgoOf(root);
  const computed = await computeMerkleRoot(eventContentHashes, algo);
  return { ok: computed === root.merkleRoot, computed, claimed: root.merkleRoot, algo };
}
