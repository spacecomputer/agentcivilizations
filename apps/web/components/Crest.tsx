"use client";
// The crest — hash as masthead. The hash and its attestation line are one
// indivisible component; the intact mark is EARNED (recomputed in this
// browser, idle-deferred, over a bounded window: the latest sealed day plus
// the open day) and never pre-rendered.
import { useEffect, useState } from "react";
import {
  eventCount,
  latestRoot,
  eventsRecordedBetween,
  rootsForDays,
  activeCivilizations,
} from "@/lib/queries";
import { certify, idle, type CertifyResult } from "@/lib/certify";
import { recordNo, utcDay, utcStamp } from "@/lib/format";
import { HashBlock } from "./HashBlock";
import { Tick } from "./marks";

type VerifyState =
  | { phase: "idle" }
  | { phase: "verifying" }
  | { phase: "intact"; result: CertifyResult; at: string }
  | { phase: "discrepancy"; result: CertifyResult }
  | { phase: "unavailable" };

export function Crest() {
  const [hash, setHash] = useState<string | null>(null);
  const [hashLabel, setHashLabel] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [activeCivs, setActiveCivs] = useState<number | null>(null);
  const [dayNo, setDayNo] = useState<number | null>(null);
  const [verify, setVerify] = useState<VerifyState>({ phase: "idle" });
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 480px)");
    setNarrow(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [root, n, civs] = await Promise.all([
          latestRoot(),
          eventCount(),
          activeCivilizations(200),
        ]);
        if (cancelled) return;
        setCount(n);
        setActiveCivs(civs.filter((c) => c.status === "active").length);
        if (root) {
          setHash(root.merkleRoot);
          setHashLabel(`ROOT ${root.id}`);
          const first = civs.length
            ? civs.reduce(
                (min, c) => (c.firstSeenAt < min ? c.firstSeenAt : min),
                civs[0].firstSeenAt,
              )
            : root.computedAt;
          setDayNo(
            Math.max(
              1,
              Math.floor((Date.now() - Date.parse(first)) / 86400_000) + 1,
            ),
          );
        }

        // Earned verification, idle-deferred, bounded window.
        setVerify({ phase: "verifying" });
        idle(async () => {
          try {
            const sealedDay = root ? root.id : utcDay(new Date().toISOString());
            const start = `${sealedDay}T00:00:00.000Z`;
            const end = new Date().toISOString();
            const events = await eventsRecordedBetween(start, end);
            if (cancelled) return;
            if (!events.length) {
              setVerify({ phase: "unavailable" });
              return;
            }
            if (!root) {
              // No sealed root yet — show the latest record's own hash.
              const latest = events[events.length - 1];
              setHash(latest.contentHash);
              setHashLabel(`RECORD ${latest.id}`);
            }
            const days = [...new Set(events.map((e) => utcDay(e.recordedAt)))];
            const roots = await rootsForDays(days);
            const result = await certify(events, roots);
            if (cancelled) return;
            setVerify(
              result.ok
                ? {
                    phase: "intact",
                    result,
                    at: utcStamp(new Date().toISOString()),
                  }
                : { phase: "discrepancy", result },
            );
          } catch {
            if (!cancelled) setVerify({ phase: "unavailable" });
          }
        });
      } catch {
        if (!cancelled) setVerify({ phase: "unavailable" });
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (hash === null && count === 0) {
    return (
      <div className="crest">
        <p className="crest-empty">
          The register is open. No events entered yet.
        </p>
      </div>
    );
  }

  return (
    <div className="crest">
      {hash ? (
        <p className="crest-hash">
          <HashBlock hash={hash} collapsible={narrow} />
        </p>
      ) : (
        <p className="crest-hash dim">retrieving the record…</p>
      )}
      <div className="attestation">
        {count !== null && <span>{recordNo(count)}</span>}
        {activeCivs !== null && (
          <span>
            {activeCivs} {activeCivs === 1 ? "FILE" : "FILES"} ACTIVE
          </span>
        )}
        {dayNo !== null && <span>DAY {dayNo}</span>}
        {hashLabel && <span>{hashLabel}</span>}
        {verify.phase === "verifying" && (
          <span className="dim">verifying…</span>
        )}
        {verify.phase === "intact" && (
          <span className="verify-ok">
            <Tick /> CHAIN INTACT (verified in this browser,{" "}
            {(verify.result.elapsedMs / 1000).toFixed(1)}s ·{" "}
            {verify.result.recordsVerified} records) ·{" "}
            <a href="/verify">certify the full record</a>
          </span>
        )}
        {verify.phase === "discrepancy" && (
          <span className="verify-fail">
            DISCREPANCY DETECTED — <a href="/verify">open the certification console</a>
          </span>
        )}
        {verify.phase === "unavailable" && (
          <span className="dim">
            verification pending · <a href="/verify">certify the record</a>
          </span>
        )}
      </div>
    </div>
  );
}
