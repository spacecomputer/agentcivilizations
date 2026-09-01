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
  reason: "contentHash" | "prevHash" | "seq" | "root";
  detail: string;
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
  elapsedMs: number;
  discrepancy: Discrepancy | null;
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
): Promise<CertifyResult> {
  const started = performance.now();
  const dayResults: DayResult[] = [];
  const report = (recordsDone: number) =>
    onProgress?.({ recordsDone, recordsTotal: events.length, dayResults });

  // 1. Recompute every contentHash, chunked.
  for (let i = 0; i < events.length; i += CHUNK) {
    const chunk = events.slice(i, i + CHUNK);
    for (const e of chunk) {
      const { contentHash, ...rest } = e;
      const recomputed = await computeContentHash(rest);
      if (recomputed !== contentHash) {
        return finish(false, i, {
          eventId: e.id,
          reason: "contentHash",
          detail: `stored ${contentHash} · computed ${recomputed}`,
        });
      }
    }
    report(Math.min(i + CHUNK, events.length));
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
    let prevHash: string | null = list[0].seq === 0 ? null : list[0].prevHash;
    let expectedSeq = list[0].seq;
    for (const e of list) {
      if (e.seq !== expectedSeq) {
        return finish(false, events.length, {
          eventId: e.id,
          reason: "seq",
          detail: `expected seq ${expectedSeq}, found ${e.seq}`,
        });
      }
      if (e.prevHash !== prevHash) {
        return finish(false, events.length, {
          eventId: e.id,
          reason: "prevHash",
          detail: `expected ${prevHash ?? "(genesis)"} · found ${e.prevHash ?? "(genesis)"}`,
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
    report(events.length);
    if (!ok) {
      return finish(false, events.length, {
        eventId: day,
        reason: "root",
        detail: `sealed ${sealed!.merkleRoot} · computed ${computedRoot}`,
      });
    }
    await yieldToBrowser();
  }

  return finish(true, events.length, null);

  function finish(
    ok: boolean,
    recordsVerified: number,
    discrepancy: Discrepancy | null,
  ): CertifyResult {
    report(recordsVerified);
    return {
      ok,
      recordsVerified,
      daysVerified: dayResults.filter((d) => d.ok && d.sealedRoot).length,
      elapsedMs: performance.now() - started,
      discrepancy,
    };
  }
}
