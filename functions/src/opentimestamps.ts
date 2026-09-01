// OpenTimestamps root anchoring.
//
// After computeDailyRoot writes roots/{day} with a fresh merkleRoot, we
// submit that root to the free public OpenTimestamps calendar servers.
// They return an incomplete `.ots` proof (fire-and-forget), which we
// persist on the Root doc as base64. A weekly upgrade pass calls
// OpenTimestamps.upgrade() once Bitcoin has confirmed the calendar's
// aggregation transaction (usually within a few hours), which attaches
// the Bitcoin block header to the proof — at that point the .ots is a
// standalone, no-server-required cryptographic proof that our merkleRoot
// existed at least as early as that block's timestamp.
//
// Any reader can independently verify with `ots verify` (or the JS lib)
// against the raw merkleRoot bytes. No trust in us, no trust in the
// calendars, no trust in Firestore — only trust in Bitcoin.
//
// Root fields are documented as append-only-attestations, not immutable:
// see docs/DESIGN.md — Root.merkleRoot itself never changes, but the
// attestations about it (otsProof, otsUpgradedAt, otsBitcoinBlockHeight)
// may be appended after the day is sealed.

import { getFirestore } from "firebase-admin/firestore";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import ots from "javascript-opentimestamps";

const { DetachedTimestampFile, Ops, Timestamp } = ots as unknown as {
  DetachedTimestampFile: {
    fromBytes: (op: unknown, bytes: Uint8Array) => unknown;
    deserialize: (bytes: Uint8Array) => unknown;
  };
  Ops: { OpSHA256: new () => unknown };
  Timestamp: unknown;
  stamp: (dtf: unknown) => Promise<void>;
  upgrade: (dtf: unknown) => Promise<boolean>;
  verify: (
    detached: unknown,
    original: unknown,
  ) => Promise<Record<string, { timestamp: number; height: number }>>;
};

// Convert a hex string (a merkleRoot) to Uint8Array — this IS the
// message we're timestamping. The verifier reconstructs the same bytes
// from the same hex string.
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

// SHA-256 in Node — needed because the OTS lib expects a bytes-in-hash
// detached file; the file "content" for us is the merkleRoot bytes.
async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(digest);
}

// Submit the merkleRoot to the OpenTimestamps calendars. Returns the raw
// (incomplete) .ots proof bytes; caller stores as base64 on the root doc.
export async function stampRoot(merkleRoot: string): Promise<Uint8Array> {
  const messageBytes = hexToBytes(merkleRoot);
  const hashBytes = await sha256(messageBytes);
  // Our "file" for OTS is the sha256(merkleRoot bytes). The detached
  // timestamp binds the calendar attestation to that hash.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detached = (DetachedTimestampFile as any).fromBytes(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new (Ops as any).OpSHA256(),
    hashBytes,
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (ots as any).stamp(detached);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (detached as any).serializeToBytes();
}

export interface UpgradeResult {
  upgraded: boolean;
  bitcoinBlockHeight: number | null;
  bitcoinTimestamp: number | null;
  serializedProof: Uint8Array;
}

// Attempt to upgrade an incomplete .ots proof by asking calendars for
// their Bitcoin attestation. If Bitcoin has confirmed the aggregation,
// this attaches the block header to the proof and the proof becomes
// standalone-verifiable.
export async function upgradeProof(
  proofBytes: Uint8Array,
): Promise<UpgradeResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detached = (DetachedTimestampFile as any).deserialize(proofBytes);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upgraded = await (ots as any).upgrade(detached);
  // Verify to extract the Bitcoin block height if available.
  let bitcoinBlockHeight: number | null = null;
  let bitcoinTimestamp: number | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attestations = await (ots as any).verify(detached, detached);
    if (attestations && attestations.bitcoin) {
      bitcoinBlockHeight = attestations.bitcoin.height ?? null;
      bitcoinTimestamp = attestations.bitcoin.timestamp ?? null;
    }
  } catch {
    // upgrade may succeed while verify still lacks the header
  }
  return {
    upgraded,
    bitcoinBlockHeight,
    bitcoinTimestamp,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    serializedProof: (detached as any).serializeToBytes(),
  };
}

// Best-effort: attaches an .ots proof to a Root doc.
export async function anchorDailyRoot(day: string): Promise<void> {
  const db = getFirestore();
  const ref = db.collection("roots").doc(day);
  const snap = await ref.get();
  if (!snap.exists) return;
  const root = snap.data() as { merkleRoot: string; otsProof?: string };
  if (root.otsProof) return; // already stamped
  try {
    const proof = await stampRoot(root.merkleRoot);
    await ref.update({
      otsProof: bytesToBase64(proof),
      otsStampedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("ots stamp failed for", day, err);
  }
}

// Weekly upgrade pass — walk roots with an incomplete proof and try to
// attach the Bitcoin block header. Idempotent; safe to run repeatedly.
export async function upgradeAllPendingProofs(): Promise<{
  attempted: number;
  upgraded: number;
}> {
  const db = getFirestore();
  const snap = await db
    .collection("roots")
    .where("otsProof", "!=", null)
    .get();
  let attempted = 0;
  let upgraded = 0;
  for (const doc of snap.docs) {
    const r = doc.data() as {
      otsProof?: string;
      otsBitcoinBlockHeight?: number;
    };
    if (!r.otsProof) continue;
    if (r.otsBitcoinBlockHeight) continue; // already attached
    attempted++;
    try {
      const result = await upgradeProof(base64ToBytes(r.otsProof));
      const update: Record<string, unknown> = {
        otsProof: bytesToBase64(result.serializedProof),
        otsCheckedAt: new Date().toISOString(),
      };
      if (result.bitcoinBlockHeight !== null) {
        update.otsBitcoinBlockHeight = result.bitcoinBlockHeight;
        update.otsBitcoinTimestamp = result.bitcoinTimestamp;
        update.otsUpgradedAt = new Date().toISOString();
        upgraded++;
      }
      await doc.ref.update(update);
    } catch (err) {
      console.warn("ots upgrade failed for", doc.id, err);
    }
  }
  return { attempted, upgraded };
}
