// Whether the register is still working, said out loud.
//
// On 2026-09-07 the classifier chain died and the register ingested
// nothing for eight hours. Every surface it has kept looking healthy: the
// masthead reported a sealed day, the catalog reported its files, the
// verifier confirmed every hash. All of that was true and none of it was
// the point — a register that has stopped recording is still perfectly
// verifiable, and verifiability is exactly what makes the failure quiet.
//
// So liveness is published like everything else here. Two thresholds, both
// printed beside the status they produce:
//
//   SCANS STALLED     no scan has finished in SCAN_STALE_MINUTES, which is
//                     three missed windows at a thirty-minute cadence.
//   CLASSIFIER DOWN   scans are finishing and putting items to the models,
//                     but no model has answered in CLASSIFIER_STALE_MINUTES.
//
// The second exists because "promoted nothing" is not a fault on its own:
// a genuinely quiet hour looks the same from outside. What separates them
// is whether a model answered at all, which is why each run records the
// model that did.

import { getFirestore } from "firebase-admin/firestore";

export const SCAN_EVERY_MINUTES = 30;
export const SCAN_STALE_MINUTES = 90;
export const CLASSIFIER_STALE_MINUTES = 180;

export type HealthStatus = "running" | "scans-stalled" | "classifier-down" | "opening";

export interface Health {
  status: HealthStatus;
  checkedAt: string;
  /** Plain words, so the status never needs a lookup table to read. */
  note: string;
  lastScanStartedAt: string | null;
  lastScanFinishedAt: string | null;
  lastScanStatus: string | null;
  minutesSinceScanFinished: number | null;
  /** The last model that actually answered, and when. */
  lastClassifierModel: string | null;
  lastClassifierAt: string | null;
  minutesSinceClassifier: number | null;
  /** Informational only: a quiet window is not a fault. */
  lastEntryRecordedAt: string | null;
  minutesSinceEntry: number | null;
  lastSealedDay: string | null;
  thresholds: {
    scanEveryMinutes: number;
    scansStalledAfterMinutes: number;
    classifierDownAfterMinutes: number;
  };
}

const mins = (from: string | null, now: number): number | null =>
  from ? Math.round((now - Date.parse(from)) / 60_000) : null;

export async function buildHealth(nowIso?: string): Promise<Health> {
  const db = getFirestore();
  const now = nowIso ? Date.parse(nowIso) : Date.now();
  const checkedAt = new Date(now).toISOString();

  const [runsSnap, eventSnap, rootSnap] = await Promise.all([
    db.collection("scanRuns").orderBy("startedAt", "desc").limit(20).get(),
    db.collection("events").orderBy("recordedAt", "desc").limit(1).get(),
    db.collection("roots").orderBy("id", "desc").limit(1).get(),
  ]);

  const runs = runsSnap.docs.map((d) => d.data() as Record<string, unknown>);
  const finished = runs.filter((r) => typeof r.finishedAt === "string");
  const lastFinished = finished[0] ?? null;
  const lastScanFinishedAt = (lastFinished?.finishedAt as string) ?? null;
  const lastScanStartedAt = (runs[0]?.startedAt as string) ?? null;
  const lastScanStatus = (lastFinished?.status as string) ?? null;

  // The most recent run in which a model actually answered.
  const answered = runs.find((r) => typeof r.classifierModel === "string" && r.classifierModel);
  const lastClassifierModel = (answered?.classifierModel as string) ?? null;
  const lastClassifierAt = (answered?.finishedAt as string) ?? null;

  const lastEntryRecordedAt = eventSnap.empty
    ? null
    : ((eventSnap.docs[0].data() as { recordedAt?: string }).recordedAt ?? null);
  const lastSealedDay = rootSnap.empty ? null : (rootSnap.docs[0].id ?? null);

  const minutesSinceScanFinished = mins(lastScanFinishedAt, now);
  const minutesSinceClassifier = mins(lastClassifierAt, now);
  const minutesSinceEntry = mins(lastEntryRecordedAt, now);

  // Did the register even try? A run that considered nothing cannot
  // implicate the classifier, however long it has been.
  const triedRecently = runs.some(
    (r) =>
      typeof r.finishedAt === "string" &&
      (mins(r.finishedAt as string, now) ?? Infinity) <= CLASSIFIER_STALE_MINUTES &&
      typeof r.itemsConsidered === "number" &&
      (r.itemsConsidered as number) > 0,
  );

  let status: HealthStatus;
  let note: string;
  if (!lastScanFinishedAt) {
    status = "opening";
    note = "No scan has completed yet.";
  } else if ((minutesSinceScanFinished ?? Infinity) > SCAN_STALE_MINUTES) {
    status = "scans-stalled";
    note = `No scan has finished for ${minutesSinceScanFinished} minutes, against a ${SCAN_EVERY_MINUTES}-minute cadence. The pipeline is not running.`;
  } else if (
    triedRecently &&
    (minutesSinceClassifier === null || minutesSinceClassifier > CLASSIFIER_STALE_MINUTES)
  ) {
    status = "classifier-down";
    note = `Scans are finishing and putting items to the models, but no model has answered for ${
      minutesSinceClassifier === null ? "as long as this record goes back" : `${minutesSinceClassifier} minutes`
    }. Nothing new can enter the register until one does.`;
  } else {
    status = "running";
    note = `Last scan finished ${minutesSinceScanFinished} minutes ago${
      lastClassifierModel ? `, classified by ${lastClassifierModel}` : ""
    }. A window with no new entries is normal; a window with no answering model is not.`;
  }

  return {
    status,
    checkedAt,
    note,
    lastScanStartedAt,
    lastScanFinishedAt,
    lastScanStatus,
    minutesSinceScanFinished,
    lastClassifierModel,
    lastClassifierAt,
    minutesSinceClassifier,
    lastEntryRecordedAt,
    minutesSinceEntry,
    lastSealedDay,
    thresholds: {
      scanEveryMinutes: SCAN_EVERY_MINUTES,
      scansStalledAfterMinutes: SCAN_STALE_MINUTES,
      classifierDownAfterMinutes: CLASSIFIER_STALE_MINUTES,
    },
  };
}
