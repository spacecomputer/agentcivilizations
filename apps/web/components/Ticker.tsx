"use client";
// The masthead chain-state ticker. Survives to mobile — it is part of the
// identity at small sizes. It reports counts and the latest seal; the
// intact mark itself lives with the crest and console, where it is earned.
import { useEffect, useState } from "react";
import { eventCount, latestRoot } from "@/lib/queries";
import { recordNo } from "@/lib/format";

export function Ticker() {
  const [line, setLine] = useState<string>("");

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
    return () => {
      cancelled = true;
    };
  }, []);

  if (!line) return null;
  return <span className="ticker mono">{line}</span>;
}
