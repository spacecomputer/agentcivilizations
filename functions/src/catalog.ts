// The catalog pass — recompute every file's derived fields from the ledger.
//
// A civilization document holds no hashed content. Everything on it is a
// summary of the entries beneath it, so the entries are the source of
// truth and these fields are recomputed from them rather than accumulated
// and hoped over. That also repairs any file whose counters drifted.
//
// The register keeps two clocks and this job is where they are kept apart:
//
//   OCCURRENCE  firstSeenAt = earliest occurredAt, lastEventAt = latest.
//               This is the file's span in the world. It was previously
//               assigned rather than maximised, so an entry recorded today
//               about an older story dragged a file's "last entry" into
//               the past; 111 of 292 files carried a last entry that
//               preceded their own opening.
//   RECORD      openedAt = earliest recordedAt, lastRecordedAt = latest.
//               This is the register's own history of the file, and it can
//               never start before the register did.
//
// Status is derived from silence in occurrence time against the
// thresholds exported by the schema, so the catalog's rule and the
// catalog's contents cannot disagree.

import { getFirestore } from "firebase-admin/firestore";
import type { Civilization, CivilizationStatus, Event } from "@agent-civilizations/schema";
import { statusFromSilence } from "@agent-civilizations/schema";

export interface CatalogResult {
  files: number;
  entries: number;
  updated: number;
  spanRepaired: number; // files whose lastEventAt preceded firstSeenAt
  statusChanged: Record<string, number>;
  orphanEntries: number; // entries whose file is missing
  emptyFiles: number; // files with no entries at all
  errors: string[];
}

interface Roll {
  n: number;
  confirmed: number;
  minOcc: string;
  maxOcc: string;
  minRec: string;
  maxRec: string;
}

export async function runCatalog(nowIso?: string): Promise<CatalogResult> {
  const db = getFirestore();
  const now = nowIso ?? new Date().toISOString();
  const result: CatalogResult = {
    files: 0,
    entries: 0,
    updated: 0,
    spanRepaired: 0,
    statusChanged: {},
    orphanEntries: 0,
    emptyFiles: 0,
    errors: [],
  };

  const rolls = new Map<string, Roll>();
  const events = await db.collection("events").get();
  result.entries = events.size;
  for (const doc of events.docs) {
    const e = doc.data() as Event;
    if (!e.civilizationId || !e.occurredAt || !e.recordedAt) continue;
    const r = rolls.get(e.civilizationId);
    if (!r) {
      rolls.set(e.civilizationId, {
        n: 1,
        confirmed: e.confidence === "confirmed" ? 1 : 0,
        minOcc: e.occurredAt,
        maxOcc: e.occurredAt,
        minRec: e.recordedAt,
        maxRec: e.recordedAt,
      });
      continue;
    }
    r.n++;
    if (e.confidence === "confirmed") r.confirmed++;
    if (e.occurredAt < r.minOcc) r.minOcc = e.occurredAt;
    if (e.occurredAt > r.maxOcc) r.maxOcc = e.occurredAt;
    if (e.recordedAt < r.minRec) r.minRec = e.recordedAt;
    if (e.recordedAt > r.maxRec) r.maxRec = e.recordedAt;
  }

  const civs = await db.collection("civilizations").get();
  result.files = civs.size;
  const known = new Set(civs.docs.map((d) => d.id));
  for (const id of rolls.keys()) if (!known.has(id)) result.orphanEntries += rolls.get(id)!.n;

  let batch = db.batch();
  let pending = 0;
  for (const doc of civs.docs) {
    const civ = doc.data() as Civilization;
    const r = rolls.get(doc.id);
    if (!r) {
      // A file with no entries. Left exactly as it is: deleting it would
      // silently drop something the register once opened.
      result.emptyFiles++;
      continue;
    }
    // The defect this job exists to repair.
    if (civ.lastEventAt < civ.firstSeenAt) result.spanRepaired++;

    const status: CivilizationStatus = statusFromSilence(r.maxOcc, now);
    const next = {
      firstSeenAt: r.minOcc,
      lastEventAt: r.maxOcc,
      openedAt: r.minRec,
      lastRecordedAt: r.maxRec,
      eventCount: r.n,
      confirmedCount: r.confirmed,
      candidateCount: r.n - r.confirmed,
      status,
    };
    const changed =
      civ.firstSeenAt !== next.firstSeenAt ||
      civ.lastEventAt !== next.lastEventAt ||
      civ.openedAt !== next.openedAt ||
      civ.lastRecordedAt !== next.lastRecordedAt ||
      civ.eventCount !== next.eventCount ||
      civ.confirmedCount !== next.confirmedCount ||
      civ.candidateCount !== next.candidateCount ||
      civ.status !== next.status;
    if (!changed) continue;
    if (civ.status !== status) {
      const key = `${civ.status}→${status}`;
      result.statusChanged[key] = (result.statusChanged[key] ?? 0) + 1;
    }
    batch.update(doc.ref, next);
    result.updated++;
    if (++pending % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (pending % 400 !== 0) await batch.commit();
  return result;
}
