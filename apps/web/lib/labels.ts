// Greedy label placement shared by the Survey plates.
//
// Marks are tried in priority order; each label tries eight anchors —
// east, west, south, north, then the four diagonals — and takes the
// first whose box lies inside the bounds and overlaps neither an
// obstacle (every mark's disc) nor a label already placed. A label with
// no clear anchor is skipped: a skipped name plus the table is more
// honest than a leader line across three ties. All arithmetic is in the
// caller's units — CSS pixels for the ties plate, viewBox units for the
// origins plate.

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LabelMark {
  id: string;
  x: number;
  y: number;
  r: number;
  text: string;
  priority: number; // higher first
  w?: number; // measured/estimated width; defaults to text.length × ch + 4
  prefer?: "ew" | "ns"; // anchor order: east/west first (names) or north/south first (captions)
}

export interface PlacedLabel {
  id: string;
  x: number;
  y: number;
  text: string;
  anchor: "start" | "middle" | "end";
}

export interface PlaceOptions {
  ch: number; // estimated px per character
  lh: number; // line height / box height
  gap?: number; // clearance from the disc edge
  bounds: Box;
}

export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function placeLabels(
  marks: LabelMark[],
  obstacles: Box[],
  opts: PlaceOptions,
): PlacedLabel[] {
  const gap = opts.gap ?? 4;
  const inset = 3;
  const bounds = opts.bounds;
  const taken: Box[] = [...obstacles];
  const placed: PlacedLabel[] = [];
  const ordered = [...marks].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));

  for (const m of ordered) {
    const w = m.w ?? m.text.length * opts.ch + 4;
    const h = opts.lh;
    // Two rings of anchors: close to the disc, then a step further out —
    // a name a few pixels from its mark still reads as its name, and the
    // second ring clears neighbouring discs in a dense core.
    const candidates: Array<{ x: number; y: number; anchor: PlacedLabel["anchor"]; box: Box }> = [];
    for (const extra of [0, 11]) {
      const d = m.r + gap + extra;
      const diag = d * 0.7071;
      candidates.push(
        { x: m.x + d, y: m.y + 4, anchor: "start", box: { x: m.x + d, y: m.y - h / 2, w, h } },
        { x: m.x - d, y: m.y + 4, anchor: "end", box: { x: m.x - d - w, y: m.y - h / 2, w, h } },
        { x: m.x, y: m.y + d + h - 3, anchor: "middle", box: { x: m.x - w / 2, y: m.y + d, w, h } },
        { x: m.x, y: m.y - d - 3, anchor: "middle", box: { x: m.x - w / 2, y: m.y - d - h, w, h } },
        { x: m.x + diag, y: m.y - diag, anchor: "start", box: { x: m.x + diag, y: m.y - diag - h + 3, w, h } },
        { x: m.x - diag, y: m.y - diag, anchor: "end", box: { x: m.x - diag - w, y: m.y - diag - h + 3, w, h } },
        { x: m.x + diag, y: m.y + diag + h - 3, anchor: "start", box: { x: m.x + diag, y: m.y + diag, w, h } },
        { x: m.x - diag, y: m.y + diag + h - 3, anchor: "end", box: { x: m.x - diag - w, y: m.y + diag, w, h } },
      );
    }
    if (m.prefer === "ns") {
      // north, south, then east, west, then the diagonals — for a caption
      // that should sit above or below its group, not beside it
      const order = [3, 2, 0, 1, 4, 5, 6, 7, 11, 10, 8, 9, 12, 13, 14, 15];
      const re = order.map((i) => candidates[i]).filter(Boolean);
      candidates.splice(0, candidates.length, ...re);
    }
    const pick = candidates.find(
      (c) =>
        c.box.x >= bounds.x + inset &&
        c.box.x + c.box.w <= bounds.x + bounds.w - inset &&
        c.box.y >= bounds.y + inset &&
        c.box.y + c.box.h <= bounds.y + bounds.h - inset &&
        !taken.some((t) => overlaps(t, c.box)),
    );
    if (pick) {
      taken.push(pick.box);
      placed.push({ id: m.id, x: pick.x, y: pick.y, text: m.text, anchor: pick.anchor });
    }
  }
  return placed;
}
