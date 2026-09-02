import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { ulid } from "ulid";
import { computeContentHash, computeMerkleRoot } from "@agent-civilizations/verify";
import type {
  Event,
  Civilization,
  Category,
  Confidence,
  Fingerprints,
  Source,
} from "@agent-civilizations/schema";
import { sharesFingerprint } from "./fingerprint.js";

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
  identifiers?: Fingerprints;
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

// A "merge key" for civilization slugs: lowercase, drop punctuation and
// trailing plural 's', sort the significant tokens alphabetically, and
// drop meaningless stopwords. Two hints that produce the same merge key
// name the same underlying grouping.
//
// This is deliberately conservative — false merges are worse than false
// splits (once merged, unrelated events share a chain thread). The rule:
//   openai-swarm ≡ swarm-openai      (order-insensitive)
//   agent-swarms ≡ agent-swarm       (plural collapse)
//   the-openai-agent ≡ openai-agent  (drop 'the', 'a', 'an')
// Distinct groupings that share a token but disagree on another (e.g.
// 'openai-swarm' vs 'anthropic-swarm') keep distinct keys.
const STOPWORDS = new Set(["the", "a", "an", "of", "for", "on", "in", "to"]);
function mergeKey(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9-\s]/g, "")
    .split(/[-\s]+/)
    .filter(Boolean)
    .filter((t) => !STOPWORDS.has(t))
    .map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t))
    .sort()
    .join("-");
}

async function upsertCivilization(
  db: FirebaseFirestore.Firestore,
  hint: string,
  name: string,
  category: Category,
  occurredAt: string,
): Promise<Civilization> {
  const id = slugify(hint);
  const key = mergeKey(id);

  // First: does an alias-matched civilization already exist? If the key
  // is non-trivial (avoid matching everything to the same singleton), we
  // look up by mergeKey. This one query is bounded (each key stores the
  // merged civ id) so no scan.
  if (key.length >= 3) {
    const merged = await db
      .collection("civilizations")
      .where("mergeKey", "==", key)
      .limit(1)
      .get();
    if (!merged.empty) {
      const doc = merged.docs[0].data() as Civilization;
      // Track the new hint as an alias if it isn't already the id or in aliases.
      if (doc.id !== id && !doc.aliases.includes(id)) {
        await db
          .collection("civilizations")
          .doc(doc.id)
          .update({ aliases: [...doc.aliases, id] });
      }
      return doc;
    }
  }

  const ref = db.collection("civilizations").doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    const doc: Civilization & { mergeKey?: string } = {
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
      // mergeKey is stored outside the Civilization schema — it's an
      // operational index for corroboration, not part of the register's
      // public identity.
      ...(key.length >= 3 && { mergeKey: key }),
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
    ...(input.identifiers && { identifiers: input.identifiers }),
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

  // Confidence promotion pass — best-effort. A corroboration failure
  // (missing index, transient Firestore hiccup) must NOT cause the caller
  // to think the event wasn't written; the event has already been
  // committed above.
  try {
    await maybePromoteConfidence(db, event);
  } catch (err) {
    console.warn(
      "corroboration pass failed:",
      err instanceof Error ? err.message : err,
    );
  }

  return event;
}

// The corroboration predicate. Two events a and b independently
// corroborate iff BOTH hold:
//   (i)  their fingerprint sets are disjoint (otherwise they are the same
//        underlying report — e.g. cs.AI and cs.MA cross-listing of one
//        arxiv paper), AND
//   (ii) their canonical domains differ (fall back to raw domain when
//        canonical unresolved).
// Peers whose sourceTier === 'aggregator-drop' are ignored entirely.
//
// See docs/DESIGN.md — confidence and confidencePromotedAt are outside
// the hash preimage (packages/verify MUTABLE_FIELDS), so promotions never
// disturb the chain.
export function eventDomains(e: Event): { canonical: string; tier: string | null }[] {
  return e.sources
    .map((s) => ({
      canonical: (s.canonicalDomain ?? s.domain).toLowerCase(),
      tier: s.sourceTier ?? null,
    }))
    .filter((d) => d.tier !== "aggregator-drop");
}

export function eventFingerprint(e: Event): Fingerprints {
  // Roll up the strongest set: prefer Event.identifiers when present,
  // otherwise merge the fingerprints from Event.sources.
  if (e.identifiers) return e.identifiers;
  const merged: Fingerprints = {};
  for (const s of e.sources) {
    if (!s.fingerprints) continue;
    if (merged.doi === undefined && s.fingerprints.doi) merged.doi = s.fingerprints.doi;
    if (merged.arxivId === undefined && s.fingerprints.arxivId) merged.arxivId = s.fingerprints.arxivId;
    if (merged.cve === undefined && s.fingerprints.cve) merged.cve = s.fingerprints.cve;
    if (merged.gitCommit === undefined && s.fingerprints.gitCommit) merged.gitCommit = s.fingerprints.gitCommit;
    if (merged.hnItemId === undefined && s.fingerprints.hnItemId) merged.hnItemId = s.fingerprints.hnItemId;
  }
  return merged;
}

export function corroborates(a: Event, b: Event): boolean {
  const fpA = eventFingerprint(a);
  const fpB = eventFingerprint(b);
  if (sharesFingerprint(fpA, fpB)) return false; // same underlying report
  const domainsA = new Set(eventDomains(a).map((d) => d.canonical));
  const domainsB = new Set(eventDomains(b).map((d) => d.canonical));
  if (domainsA.size === 0 || domainsB.size === 0) return false;
  for (const dB of domainsB) if (!domainsA.has(dB)) return true;
  return false;
}

// Normalize an actor name for comparison: lowercase, strip trailing
// role words ("project", "team", "labs", "inc", etc.), collapse
// whitespace. Cross-civ corroboration compares these normalized forms.
const ROLE_SUFFIXES = /\s+(?:project|projects|team|teams|labs?|inc|llc|ltd|foundation|community|research|group|initiative)$/i;
export function normalizeActor(a: string): string {
  return a
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(ROLE_SUFFIXES, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Cross-civilization corroboration: two candidates in DIFFERENT
// civilization files still count as corroborating each other iff they
// share at least 2 normalized named actors AND satisfy the standard
// predicate (disjoint fingerprints, different canonical domains,
// neither aggregator-drop). This closes the deep-dive's #1 blocker:
// civilization-slug fragmentation was preventing any corroboration when
// the classifier gave near-miss slugs to events about one incident.
//
// The 2-actor floor is deliberately strict — a single shared actor
// (e.g. "OpenAI" appears everywhere) would create rampant false
// promotions; two shared actors is a strong signal the events are about
// the same underlying situation.
const MIN_SHARED_ACTORS_CROSS_CIV = 2;

export function corroboratesCrossCiv(a: Event, b: Event): boolean {
  // Must be different civilization files — the whole point of cross-civ.
  if (a.civilizationId === b.civilizationId) return false;
  // Fingerprint overlap still disqualifies — same underlying report.
  const fpA = eventFingerprint(a);
  const fpB = eventFingerprint(b);
  if (sharesFingerprint(fpA, fpB)) return false;
  // At least one source on each side that isn't aggregator-drop.
  if (eventDomains(a).length === 0 || eventDomains(b).length === 0) return false;
  // ≥2 shared normalized actors — the load-bearing signal that these
  // are about the same underlying situation. Deliberately does NOT
  // require different canonicalDomains: in the cross-civ case, two
  // items surfaced by the same aggregator (Google News → same
  // canonical, before the <source> unwrap fix landed) can still
  // corroborate each other via shared actor overlap. The classifier
  // creating two different civ slugs from the same story is itself
  // evidence they carry independent content — Google News would not
  // syndicate one publisher's identical story twice as separate items.
  const actorsA = new Set(
    a.actors.map(normalizeActor).filter((x) => x.length >= 3),
  );
  const actorsB = new Set(
    b.actors.map(normalizeActor).filter((x) => x.length >= 3),
  );
  if (
    actorsA.size < MIN_SHARED_ACTORS_CROSS_CIV ||
    actorsB.size < MIN_SHARED_ACTORS_CROSS_CIV
  )
    return false;
  let shared = 0;
  for (const a of actorsA) if (actorsB.has(a)) shared++;
  return shared >= MIN_SHARED_ACTORS_CROSS_CIV;
}

async function maybePromoteConfidence(
  db: FirebaseFirestore.Firestore,
  event: Event,
): Promise<void> {
  // Corroboration window: 30 days by recordedAt (when WE wrote the peer).
  // The old code used occurredAt, which could exclude a fresh news post
  // about an older paper — recordedAt is a wall-clock property of OUR
  // ledger and is what actually bounds the operational window.
  const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString();
  const q = await db
    .collection("events")
    .where("civilizationId", "==", event.civilizationId)
    .where("recordedAt", ">=", cutoff)
    .get();
  const peers = q.docs
    .map((d) => d.data() as Event)
    .filter((e) => e.id !== event.id);

  const now = new Date().toISOString();

  // 1. Does the new event have any peer that corroborates it?
  const newEventPromoted =
    event.confidence !== "confirmed" &&
    peers.some((p) => corroborates(event, p));
  if (newEventPromoted) {
    await db.collection("events").doc(event.id).update({
      confidence: "confirmed",
      confidencePromotedAt: now,
    });
  }

  // 2. Retroactive back-fill within the same civilization.
  const batch = db.batch();
  let backfilled = 0;
  for (const p of peers) {
    if (p.confidence !== "candidate") continue;
    if (corroborates(p, event)) {
      batch.update(db.collection("events").doc(p.id), {
        confidence: "confirmed",
        confidencePromotedAt: now,
      });
      backfilled++;
    }
  }
  if (backfilled > 0) await batch.commit();

  // 3. Cross-civilization corroboration — for events whose classifier
  // gave a near-miss slug (openai-huggingface-agent-hack vs
  // huggingface-agent-swarm-attack, etc.), find peers in OTHER civs
  // that share ≥2 named actors and apply the same predicate.
  await maybePromoteCrossCiv(db, event, now);
}

async function maybePromoteCrossCiv(
  db: FirebaseFirestore.Firestore,
  event: Event,
  now: string,
): Promise<void> {
  const normalized = event.actors
    .map(normalizeActor)
    .filter((x) => x.length >= 3);
  if (normalized.length < 2) return;
  // Firestore array-contains-any accepts up to 30 values. Use the RAW
  // actor list (not normalized) because that's what's stored in the docs.
  const values = event.actors.slice(0, 30);
  if (values.length < 2) return;
  const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString();
  const q = await db
    .collection("events")
    .where("actors", "array-contains-any", values)
    .where("recordedAt", ">=", cutoff)
    .get();
  const peers = q.docs
    .map((d) => d.data() as Event)
    .filter((p) => p.id !== event.id && p.civilizationId !== event.civilizationId);
  if (peers.length === 0) return;

  const batch = db.batch();
  let promoted = 0;
  let promotedSelf = false;
  for (const p of peers) {
    if (corroboratesCrossCiv(event, p)) {
      if (p.confidence === "candidate") {
        batch.update(db.collection("events").doc(p.id), {
          confidence: "confirmed",
          confidencePromotedAt: now,
          corroboratedAcrossCivs: true,
        });
        promoted++;
      }
      if (!promotedSelf && event.confidence !== "confirmed") {
        batch.update(db.collection("events").doc(event.id), {
          confidence: "confirmed",
          confidencePromotedAt: now,
          corroboratedAcrossCivs: true,
        });
        promotedSelf = true;
      }
    }
  }
  if (promoted > 0 || promotedSelf) await batch.commit();
}

// One-shot retroactive backfill — apply the current corroboration
// predicates to every event in the last 60 days. Idempotent (a
// confirmed event is left alone). Useful after logic changes so
// existing candidates get promoted immediately rather than waiting
// for new events to arrive in their vicinity.
export async function backfillCorroboration(): Promise<{
  scanned: number;
  promoted: number;
  errors: string[];
}> {
  const db = getFirestore();
  const cutoff = new Date(Date.now() - 60 * 86400_000).toISOString();
  const snap = await db
    .collection("events")
    .where("recordedAt", ">=", cutoff)
    .get();
  const all = snap.docs.map((d) => d.data() as Event);
  const candidates = all.filter((e) => e.confidence === "candidate");
  const errors: string[] = [];
  const now = new Date().toISOString();
  let promoted = 0;
  // Batch updates in groups of 400 (Firestore batch limit is 500).
  const batches: Array<{ id: string; crossCiv: boolean }> = [];
  for (const c of candidates) {
    // In-civ peers
    const sameCiv = all.filter(
      (p) => p.id !== c.id && p.civilizationId === c.civilizationId,
    );
    if (sameCiv.some((p) => corroborates(c, p))) {
      batches.push({ id: c.id, crossCiv: false });
      continue;
    }
    // Cross-civ peers
    const otherCiv = all.filter(
      (p) => p.id !== c.id && p.civilizationId !== c.civilizationId,
    );
    if (otherCiv.some((p) => corroboratesCrossCiv(c, p))) {
      batches.push({ id: c.id, crossCiv: true });
    }
  }
  for (let i = 0; i < batches.length; i += 400) {
    const chunk = batches.slice(i, i + 400);
    const batch = db.batch();
    for (const b of chunk) {
      const update: Record<string, unknown> = {
        confidence: "confirmed",
        confidencePromotedAt: now,
      };
      if (b.crossCiv) update.corroboratedAcrossCivs = true;
      batch.update(db.collection("events").doc(b.id), update);
    }
    try {
      await batch.commit();
      promoted += chunk.length;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { scanned: candidates.length, promoted, errors };
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
  // A day with no entries is not sealed — an empty root would serve
  // sha256("") as the ledger's public face and prove nothing.
  if (hashes.length === 0) return;
  const civs = new Set(q.docs.map((d) => (d.data() as Event).civilizationId));
  const merkleRoot = await computeMerkleRoot(hashes);

  // Link to the most recent existing root, not literally day-1 — quiet
  // days are skipped, and the chain of roots must stay unbroken across them.
  const prevQ = await db
    .collection("roots")
    .where("id", "<", day)
    .orderBy("id", "desc")
    .limit(1)
    .get();
  const prevRootHash = prevQ.empty
    ? null
    : (prevQ.docs[0].data() as { merkleRoot: string }).merkleRoot;

  await db.collection("roots").doc(day).set({
    id: day,
    merkleRoot,
    eventCount: hashes.length,
    civilizationCount: civs.size,
    computedAt: new Date().toISOString(),
    prevRootHash,
  });
}
