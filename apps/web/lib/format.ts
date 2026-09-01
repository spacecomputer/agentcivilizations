// Formatting conventions of the register. See docs/DESIGN.md.

// Record numbers are written "No. 12,847" — never "№" (glyph coverage
// across the three faces is unverified; a fallback glyph in the crest
// is a brand wound).
export function recordNo(n: number): string {
  return `No. ${n.toLocaleString("en-US")}`;
}

// Hashes display chunked in 8-character groups; the raw string is
// preserved for copying.
export function chunkHash(hash: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < hash.length; i += 8) chunks.push(hash.slice(i, i + 8));
  return chunks;
}

export function shortHash(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-4)}`;
}

// Timestamps are always UTC, always mono.
export function utcDay(iso: string): string {
  return iso.slice(0, 10);
}

export function utcTime(iso: string): string {
  return `${iso.slice(11, 16)} UTC`;
}

export function utcStamp(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

// Call numbers: the civilization slug set as an archival call number.
export function callNumber(civilizationId: string): string {
  return `FILE ${civilizationId.toUpperCase()}`;
}

export function daysBetween(aIso: string, bIso: string): number {
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);
  return Math.round(Math.abs(b - a) / 86400_000);
}
