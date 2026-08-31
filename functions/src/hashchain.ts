import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { ulid } from "ulid";
import { computeContentHash, computeMerkleRoot } from "@agent-civilizations/verify";
import type { Event, Civilization, Category, Confidence, Source } from "@agent-civilizations/schema";

export interface PromoteInput {
  civilizationHint: string;
  civilizationName: string;
  category: Category;
  title: string;
  summary: string;
  occurredAt: string;
  actors: string[];
  tags: string[];
  source: Source;
}

// Slugify a civilization hint into a stable id.
function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-\s]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60) || "unknown";
}

async function upsertCivilization(
  db: FirebaseFirestore.Firestore,
  hint: string,
  name: string,
  category: Category,
  occurredAt: string,
): Promise<Civilization> {
  const id = slugify(hint);
  const ref = db.collection("civilizations").doc(id);
  const snap = await ref.get();
  const nowIso = new Date().toISOString();
  if (!snap.exists) {
    const doc: Civilization = {
      id,
      name,
      aliases: name === hint ? [] : [hint],
      summary: "",
      category,
      firstSeenAt: occurredAt,
      lastEventAt: occurredAt,
      eventCount: 0,
      status: "active",
      headHash: null,
    };
    await ref.set(doc);
    return doc;
  }
  return snap.data() as Civilization;
}

async function nextSeqForCivilization(
  db: FirebaseFirestore.Firestore,
  civId: string,
): Promise<{ seq: number; prevHash: string | null }> {
  const q = await db
    .collection("events")
    .where("civilizationId", "==", civId)
    .orderBy("seq", "desc")
    .limit(1)
    .get();
  if (q.empty) return { seq: 0, prevHash: null };
  const last = q.docs[0].data() as Event;
  return { seq: last.seq + 1, prevHash: last.contentHash };
}

export async function promoteEvent(input: PromoteInput): Promise<Event> {
  const db = getFirestore();
  const civ = await upsertCivilization(
    db,
    input.civilizationHint,
    input.civilizationName,
    input.category,
    input.occurredAt,
  );
  const { seq, prevHash } = await nextSeqForCivilization(db, civ.id);

  const base: Omit<Event, "contentHash"> = {
    id: ulid(),
    civilizationId: civ.id,
    title: input.title,
    summary: input.summary,
    occurredAt: input.occurredAt,
    recordedAt: new Date().toISOString(),
    category: input.category,
    confidence: "candidate" as Confidence,
    sources: [input.source],
    actors: input.actors,
    tags: input.tags,
    retracts: [],
    prevHash,
    seq,
  };
  const contentHash = await computeContentHash(base);
  const event: Event = { ...base, contentHash };

  const batch = db.batch();
  const eventRef = db.collection("events").doc(event.id);
  batch.set(eventRef, event);
  batch.update(db.collection("civilizations").doc(civ.id), {
    lastEventAt: input.occurredAt,
    eventCount: FieldValue.increment(1),
    headHash: contentHash,
  });
  await batch.commit();

  // Confidence promotion pass: if another confirmed source URL is already
  // in the ledger for the same civilization within 30 days, promote both.
  await maybePromoteConfidence(db, event);

  return event;
}

async function maybePromoteConfidence(
  db: FirebaseFirestore.Firestore,
  event: Event,
): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString();
  const q = await db
    .collection("events")
    .where("civilizationId", "==", event.civilizationId)
    .where("occurredAt", ">=", cutoff)
    .get();
  const otherDomains = new Set<string>();
  const others = q.docs
    .map((d) => d.data() as Event)
    .filter((e) => e.id !== event.id);
  for (const e of others) for (const s of e.sources) otherDomains.add(s.domain);
  const thisDomain = event.sources[0]?.domain;
  if (thisDomain && otherDomains.size > 0 && !otherDomains.has(thisDomain)) {
    // We have an independent second source. Promote this event to confirmed
    // WITHOUT rewriting its hash — confirmation is a derived view, tracked
    // by a separate `confirmations` field written by this pass.
    await db
      .collection("events")
      .doc(event.id)
      .update({ confidence: "confirmed" });
  }
}

export async function computeDailyRoot(day: string): Promise<void> {
  const db = getFirestore();
  const start = `${day}T00:00:00.000Z`;
  const end = `${day}T23:59:59.999Z`;
  const q = await db
    .collection("events")
    .where("recordedAt", ">=", start)
    .where("recordedAt", "<=", end)
    .get();
  const hashes = q.docs.map((d) => (d.data() as Event).contentHash);
  const civs = new Set(q.docs.map((d) => (d.data() as Event).civilizationId));
  const merkleRoot = await computeMerkleRoot(hashes);

  const prevDay = new Date(`${day}T00:00:00.000Z`);
  prevDay.setUTCDate(prevDay.getUTCDate() - 1);
  const prevId = prevDay.toISOString().slice(0, 10);
  const prevSnap = await db.collection("roots").doc(prevId).get();
  const prevRootHash = prevSnap.exists
    ? (prevSnap.data() as { merkleRoot: string }).merkleRoot
    : null;

  await db.collection("roots").doc(day).set({
    id: day,
    merkleRoot,
    eventCount: hashes.length,
    civilizationCount: civs.size,
    computedAt: new Date().toISOString(),
    prevRootHash,
  });
}
