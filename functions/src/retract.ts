// Retraction — the register's only way to be wrong in public.
//
// Entries are never edited and never deleted. Deleting one would break
// the chain that makes every other entry worth reading, so a correction
// is itself an entry: a new record in the same file, chained onto the
// head, carrying `retracts: [oldId]`, a reason from a closed list, and a
// note in plain words. The mistake, the correction and the timing all
// stay on the record, and the retracted entry learns of its retraction
// only by being pointed at.
//
// This is a governance act. It is exposed as an authenticated callable,
// never a public endpoint, and every retraction is a permanent, hashed,
// Bitcoin-anchored statement that the register got something wrong.

import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { computeContentHash } from "@agent-civilizations/verify";
import type { Event } from "@agent-civilizations/schema";
import { ulid } from "ulid";

export const RETRACTION_REASONS = [
  "duplicate", // the same underlying report already has an entry
  "source-retracted", // the source withdrew or corrected its story
  "misclassified", // real event, wrong file or wrong category
  "hoax", // the underlying report was fabricated
] as const;
export type RetractionReason = (typeof RETRACTION_REASONS)[number];

export interface RetractInput {
  eventId: string;
  reason: RetractionReason;
  notes: string;
  /** Optional override; a plain default is derived from the retracted entry. */
  title?: string;
  summary?: string;
}

export interface RetractResult {
  ok: boolean;
  retractionId?: string;
  civilizationId?: string;
  seq?: number;
  contentHash?: string;
  error?: string;
}

const SITE = "https://agentcivilizations.org";

// The minimum a retraction must carry before it touches the ledger.
// Pure, so it can be tested without a database and without writing a
// permanent record to try it.
export const MIN_NOTES = 20;
export function validateRetraction(input: Partial<RetractInput>): { ok: true; notes: string } | { ok: false; error: string } {
  if (!input.eventId) return { ok: false, error: "eventId is required" };
  if (!input.reason || !RETRACTION_REASONS.includes(input.reason)) {
    return { ok: false, error: `reason must be one of ${RETRACTION_REASONS.join(", ")}` };
  }
  const notes = (input.notes ?? "").trim();
  if (notes.length < MIN_NOTES) {
    // A retraction without an explanation is an edit with extra steps.
    return { ok: false, error: `notes must explain the retraction in at least ${MIN_NOTES} characters` };
  }
  return { ok: true, notes };
}

export async function retractEvent(input: RetractInput): Promise<RetractResult> {
  const db = getFirestore();

  const valid = validateRetraction(input);
  if (!valid.ok) return { ok: false, error: valid.error };
  const { notes } = valid;

  const targetSnap = await db.collection("events").doc(input.eventId).get();
  if (!targetSnap.exists) return { ok: false, error: `no entry ${input.eventId}` };
  const target = targetSnap.data() as Event;

  // One retraction per entry. A second correction supersedes the first
  // retraction, not the original entry, so the trail stays single-file.
  const existing = await db
    .collection("events")
    .where("retracts", "array-contains", input.eventId)
    .limit(1)
    .get();
  if (!existing.empty) {
    return { ok: false, error: `entry ${input.eventId} was already retracted by ${existing.docs[0].id}` };
  }

  // Chain onto the head of the same file, exactly as an ingested entry does.
  const headQ = await db
    .collection("events")
    .where("civilizationId", "==", target.civilizationId)
    .orderBy("seq", "desc")
    .limit(1)
    .get();
  if (headQ.empty) return { ok: false, error: `file ${target.civilizationId} has no entries` };
  const head = headQ.docs[0].data() as Event;

  const now = new Date().toISOString();
  const base: Omit<Event, "contentHash"> = {
    id: ulid(),
    civilizationId: target.civilizationId,
    title: input.title?.trim() || `Retraction: ${target.title}`.slice(0, 200),
    summary:
      input.summary?.trim() ||
      `This entry retracts ${target.id} (${input.reason}). ${notes}`.slice(0, 1000),
    occurredAt: now,
    recordedAt: now,
    category: target.category,
    // A retraction is the register's own act, stated on its own authority.
    // It is never promoted by corroboration and never claims two sources.
    confidence: "confirmed",
    sources: [
      {
        url: `${SITE}/event?id=${encodeURIComponent(target.id)}`,
        domain: "agentcivilizations.org",
        title: `Retracted entry: ${target.title}`.slice(0, 200),
        fetchedAt: now,
        rawExcerpt: notes.slice(0, 2048),
        canonicalDomain: "agentcivilizations.org",
        sourceTier: "primary",
      },
    ],
    actors: [],
    tags: ["retraction", input.reason],
    retracts: [target.id],
    retractionReason: input.reason,
    retractionNotes: notes,
    prevHash: head.contentHash,
    seq: head.seq + 1,
  };
  const contentHash = await computeContentHash(base);
  const event: Event = { ...base, contentHash };

  const batch = db.batch();
  batch.set(db.collection("events").doc(event.id), event);
  batch.update(db.collection("civilizations").doc(target.civilizationId), {
    lastEventAt: now,
    eventCount: FieldValue.increment(1),
    headHash: contentHash,
  });
  await batch.commit();

  return {
    ok: true,
    retractionId: event.id,
    civilizationId: event.civilizationId,
    seq: event.seq,
    contentHash,
  };
}
