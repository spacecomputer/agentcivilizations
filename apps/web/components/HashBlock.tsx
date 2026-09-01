"use client";
import { useState } from "react";
import { chunkHash } from "@/lib/format";

// Chunked hash display. The visible text groups in eights for scanning;
// the copy control preserves the raw string. Below small widths the crest
// variant shows four groups with an expand control — never a wall.
export function HashBlock({
  hash,
  copyable = true,
  collapsible = false,
  className = "",
}: {
  hash: string;
  copyable?: boolean;
  collapsible?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const chunks = chunkHash(hash);
  const shown = collapsible && !expanded ? chunks.slice(0, 4) : chunks;

  async function copy() {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard unavailable — leave the control inert
    }
  }

  return (
    <span className={`hashblock ${className}`}>
      <span className="hashchunks" aria-label={hash}>
        {shown.join(" ")}
        {collapsible && !expanded && chunks.length > 4 && " …"}
      </span>
      {collapsible && chunks.length > 4 && (
        <button
          type="button"
          className="hash-control"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? "collapse" : "expand"}
        </button>
      )}
      {copyable && (
        <button type="button" className="hash-control" onClick={copy}>
          {copied ? "copied" : "copy"}
        </button>
      )}
    </span>
  );
}
