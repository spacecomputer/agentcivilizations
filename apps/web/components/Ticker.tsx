"use client";
// The masthead chain-state ticker. Survives to mobile — it is part of the
// identity at small sizes. It reports counts and the latest seal; the
// intact mark itself lives with the crest and console, where it is earned.
//
// It also reports when the register has stopped recording. A register that
// has stalled is still perfectly verifiable — every hash still checks, the
// crest still reads INTACT — which is exactly what makes the failure
// quiet. On 2026-09-07 the classifier died and nothing on any page said
// so for eight hours. The masthead says so now.
import { useEffect, useState } from "react";
import { eventCount, latestRoot } from "@/lib/queries";
import { recordNo } from "@/lib/format";

interface Health {
  status: "running" | "scans-stalled" | "classifier-down" | "opening";
  note: string;
}

export function Ticker() {
  const [line, setLine] = useState<string>("");
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [n, root] = await Promise.all([eventCount(), latestRoot()]);
        if (cancelled) return;
        const parts = [recordNo(n)];
        parts.push(root ? `SEALED THROUGH ${root.id}` : "NO ROOT SEALED YET");
        setLine(parts.join(" · "));
      } catch {
        if (!cancelled) setLine("");
      }
    })();
    // Liveness is a separate fetch on purpose: it must not be able to
    // prevent the masthead rendering.
    fetch("/api/health.json")
      .then((r) => r.json())
      .then((h: Health) => !cancelled && setHealth(h))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!line) return null;
  const stalled = health && health.status !== "running" && health.status !== "opening";
  return (
    <span className="ticker mono">
      {line}
      {stalled && (
        <>
          {" · "}
          <a className="ticker-alarm" href="/stats" title={health.note}>
            NOT RECORDING
          </a>
        </>
      )}
    </span>
  );
}
