"use client";
// The certification engine. Recomputes hashes with Web Crypto in chunks so
// the main thread stays live, verifies per-civilization chain linkage, and
// recomputes daily roots against the sealed values. Used by the homepage
// crest (bounded window) and /verify (full chain).

import {
  computeContentHash,
  computeMerkleRoot,
} from "@agent-civilizations/verify";
import type { Event, Root } from "@agent-civilizations/schema";
import { utcDay } from "./format";

export interface DayResult {
  day: string;
  eventCount: number;
  computedRoot: string;
  sealedRoot: string | null; // null: day not yet sealed (open day)
  ok: boolean; // root matches, or day is open
}

export interface Discrepancy {
  eventId: string;
  recordNo: number; // 1-based position in the certification run (0 for roots)
  reason: "contentHash" | "prevHash" | "seq" | "root";
  expected: string;
  computed: string;
}

export interface CertifyProgress {
  recordsDone: number;
  recordsTotal: number;
  dayResults: DayResult[];
}

export interface CertifyResult {
  ok: boolean;
  recordsVerified: number;
  daysVerified: number;
  terminalHash: string | null; // last computed root (or last event hash)
  elapsedMs: number;
  discrepancy: Discrepancy | null;
}

export interface CertifyOptions {
  // full: the run covers the entire register, so every civilization must
  // begin at seq 0 — a missing genesis is a discrepancy. Bounded windows
  // (the homepage crest) take the first visible record's linkage as given.
  full?: boolean;
}

const CHUNK = 50;

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function idle(fn: () => void): void {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(fn, { timeout: 3000 });
  } else {
    setTimeout(fn, 200);
  }
}

export async function certify(
  events: Event[],
  roots: Map<string, Root>,
  onProgress?: (p: CertifyProgress) => void,
  options: CertifyOptions = {},
): Promise<CertifyResult> {
  const started = performance.now();
  const dayResults: DayResult[] = [];
  let verifiedCount = 0;
  let terminalHash: string | null = null;
  const positionOf = new Map(events.map((e, i) => [e.id, i + 1]));
  const report = () =>
    onProgress?.({
      recordsDone: verifiedCount,
      recordsTotal: events.length,
      dayResults,
    });

  // 1. Recompute every contentHash, chunked.
  for (let i = 0; i < events.length; i += CHUNK) {
    const chunk = events.slice(i, i + CHUNK);
    for (const e of chunk) {
      const recomputed = await computeContentHash(e);
      if (recomputed !== e.contentHash) {
        return finish({
          eventId: e.id,
          recordNo: positionOf.get(e.id) ?? 0,
          reason: "contentHash",
          expected: e.contentHash,
          computed: recomputed,
        });
      }
      verifiedCount++;
      terminalHash = e.contentHash;
    }
    report();
    await yieldToBrowser();
  }

  // 2. Verify per-civilization linkage (prevHash + seq).
  const byCiv = new Map<string, Event[]>();
  for (const e of events) {
    const list = byCiv.get(e.civilizationId) ?? [];
    list.push(e);
    byCiv.set(e.civilizationId, list);
  }
  for (const [, list] of byCiv) {
    list.sort((a, b) => a.seq - b.seq);
    if (options.full && list[0].seq !== 0) {
      return finish({
        eventId: list[0].id,
        recordNo: positionOf.get(list[0].id) ?? 0,
        reason: "seq",
        expected: "seq 0 (genesis)",
        computed: `seq ${list[0].seq}`,
      });
    }
    let prevHash: string | null = list[0].seq === 0 ? null : list[0].prevHash;
    let expectedSeq = list[0].seq;
    for (const e of list) {
      if (e.seq !== expectedSeq) {
        return finish({
          eventId: e.id,
          recordNo: positionOf.get(e.id) ?? 0,
          reason: "seq",
          expected: `seq ${expectedSeq}`,
          computed: `seq ${e.seq}`,
        });
      }
      if (e.prevHash !== prevHash) {
        return finish({
          eventId: e.id,
          recordNo: positionOf.get(e.id) ?? 0,
          reason: "prevHash",
          expected: prevHash ?? "(genesis)",
          computed: e.prevHash ?? "(genesis)",
        });
      }
      prevHash = e.contentHash;
      expectedSeq++;
    }
  }

  // 3. Recompute daily roots against sealed values.
  const byDay = new Map<string, Event[]>();
  for (const e of events) {
    const day = utcDay(e.recordedAt);
    const list = byDay.get(day) ?? [];
    list.push(e);
    byDay.set(day, list);
  }
  const days = [...byDay.keys()].sort();
  for (const day of days) {
    const dayEvents = byDay.get(day)!;
    const computedRoot = await computeMerkleRoot(
      dayEvents.map((e) => e.contentHash),
    );
    const sealed = roots.get(day) ?? null;
    const ok = sealed === null || sealed.merkleRoot === computedRoot;
    dayResults.push({
      day,
      eventCount: dayEvents.length,
      computedRoot,
      sealedRoot: sealed?.merkleRoot ?? null,
      ok,
    });
    if (sealed) terminalHash = computedRoot;
    report();
    if (!ok) {
      return finish({
        eventId: day,
        recordNo: 0,
        reason: "root",
        expected: sealed!.merkleRoot,
        computed: computedRoot,
      });
    }
    await yieldToBrowser();
  }

  return finish(null);

  function finish(discrepancy: Discrepancy | null): CertifyResult {
    report();
    return {
      ok: discrepancy === null,
      recordsVerified: verifiedCount,
      daysVerified: dayResults.filter((d) => d.ok && d.sealedRoot).length,
      terminalHash,
      elapsedMs: performance.now() - started,
      discrepancy,
    };
  }
}
