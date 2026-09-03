"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Ties, TieEdge, TieNode } from "@/lib/survey";
import {
  layoutTies,
  labelBudget,
  TIE_STROKE,
  LABEL_CH,
  CAPTION_CH,
  LABEL_LH,
  HIT_WIDTH,
  type LaidEdge,
  type LaidNode,
} from "@/lib/survey-layout";
import { placeLabels, type Box, type PlacedLabel } from "@/lib/labels";
import { callNumber } from "@/lib/format";
import { Mark } from "./Mark";

export { TIE_STROKE };

// Plate II — ties. Files are marks; a tie is two files whose entries
// share at least two named actors — the predicate cross-civilization
// corroboration uses. The plate draws what the record can stand behind:
// ties in three ruled weights on contrast-verified tokens, names placed
// without overprinting, the category glyph cut into every mark, and a
// reading line beneath that prints the marked file's record for anyone
// without a mouse. The canvas renders at one unit per CSS pixel, so
// 12 px is 12 px on every viewport. A survey does not redraw itself:
// the layout is computed once per ledger; filters restyle, never move.

const SITUATION_MIN = 3; // situations of three or more files are captioned on the plate
export const HAIRLINE_CAP_PER_FILE = 4; // beyond four hairlines per file the mesh is a field, not marks

export const CONFIDENCE_LINE = {
  confirmed: "HOLDS CONFIRMED ENTRIES — corroborated by independent sources",
  candidate: "CANDIDATES ONLY — reported, not yet corroborated",
} as const;

export function markLine(n: TieNode): string {
  return `${n.name} · ${callNumber(n.id)} · ${n.category.toUpperCase()} · ${n.confirmed ? CONFIDENCE_LINE.confirmed : CONFIDENCE_LINE.candidate} · ${n.entries} ${n.entries === 1 ? "entry" : "entries"} · ${n.degreeAll} ${n.degreeAll === 1 ? "tie" : "ties"}, ${n.degree} drawn in full${n.status !== "active" ? ` · ${n.status.toUpperCase()}` : ""}`;
}

export type Reading =
  | { kind: "node"; id: string }
  | { kind: "tie"; key: string }
  | { kind: "alone"; id: string }
  | { kind: "nomatch"; query: string }
  | null;

// ---- samples for the key on the leaf ----------------------------------
export function MarkSample({
  confirmed,
  dormant = false,
}: {
  confirmed: boolean;
  dormant?: boolean;
}) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" style={{ verticalAlign: "-6px" }}>
      <circle
        cx="11"
        cy="11"
        r="8"
        fill={confirmed ? "var(--ink)" : "var(--ground)"}
        stroke="var(--ink)"
        strokeWidth="1.4"
        strokeDasharray={dormant ? "3 2" : undefined}
      />
    </svg>
  );
}
export function TieSample({ cls }: { cls: keyof typeof TIE_STROKE }) {
  const s = TIE_STROKE[cls];
  return (
    <svg width="34" height="10" viewBox="0 0 34 10" aria-hidden="true" style={{ verticalAlign: "-1px" }}>
      <line x1="1" y1="5" x2="33" y2="5" stroke={s.stroke} strokeWidth={s.width} />
    </svg>
  );
}

// ------------------------------------------------------------------------

export function TiesPlate({
  ties,
  kept,
  hideFiltered,
  drawHairlines,
  highlight,
  onReading,
}: {
  ties: Ties;
  kept: Set<string>; // files matching the category filter
  hideFiltered: boolean;
  drawHairlines: boolean;
  highlight?: string | null; // a file id or tie key lit from the tables
  onReading?: (r: Reading) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(960);
  const [active, setActive] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [reading, setReadingState] = useState<Reading>(null);
  const [query, setQuery] = useState("");
  // JSX types <a> as HTMLAnchorElement even inside <svg>; at runtime it is
  // an SVGAElement — both expose focus(), which is all we call.
  const refs = useRef(new Map<string, HTMLAnchorElement>());

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => setWidth(Math.floor(el.clientWidth) || 960);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => layoutTies(ties, width), [ties, width]);

  const nodeById = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout]);
  const edgeByKey = useMemo(() => new Map(layout.edges.map((e) => [e.key, e])), [layout]);
  const isolatedById = useMemo(() => new Map(ties.isolated.map((f) => [f.id, f])), [ties]);

  // Visible set: filtered files are restyled, or hidden entirely.
  const visible = useMemo(() => {
    const set = new Set<string>();
    for (const n of layout.nodes) if (!hideFiltered || kept.has(n.id)) set.add(n.id);
    return set;
  }, [layout, kept, hideFiltered]);

  const edgeVisible = useCallback(
    (e: LaidEdge) =>
      visible.has(e.source) && visible.has(e.target) && kept.has(e.source) && kept.has(e.target),
    [visible, kept],
  );

  // Names and situation captions, placed together without overprinting;
  // discs are obstacles, names take priority over captions.
  const placed = useMemo(() => {
    const budget = labelBudget(layout.nodes.length);
    const obstacles: Box[] = layout.nodes.map((n) => ({
      x: n.x - n.r - 3,
      y: n.y - n.r - 3,
      w: 2 * (n.r + 3),
      h: 2 * (n.r + 3),
    }));
    if (layout.inset) {
      obstacles.push({ x: layout.inset.x, y: layout.inset.y, w: layout.inset.w, h: 18 });
    }
    const names = [...layout.nodes]
      .filter((n) => visible.has(n.id))
      .sort(
        (a, b) =>
          b.degree * Math.sqrt(b.entries) - a.degree * Math.sqrt(a.entries) ||
          b.degreeAll - a.degreeAll ||
          a.id.localeCompare(b.id),
      )
      .slice(0, budget)
      .map((n) => ({
        id: n.id,
        x: n.x,
        y: n.y,
        r: n.r,
        text: n.name,
        w: n.name.length * LABEL_CH + 4,
        priority: 1000 + n.degree * Math.sqrt(n.entries) + n.degreeAll / 100,
      }));
    const captions = ties.situations
      .filter((s) => s.size >= SITUATION_MIN)
      .map((s) => {
        const pts = s.members.map((id) => nodeById.get(id)).filter((n): n is LaidNode => !!n && visible.has(n.id));
        if (pts.length < SITUATION_MIN) return null;
        // Anchor the caption at the group's centroid with the group's
        // bounding radius, preferring north/south, so its box lands above
        // or below the group rather than on its marks.
        const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
        const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
        const reach = pts.reduce((a, p) => Math.max(a, Math.hypot(p.x - cx, p.y - cy) + p.r), 0);
        return {
          id: `sit:${s.key}`,
          x: cx,
          y: cy,
          r: reach,
          text: s.name.toUpperCase(),
          w: s.name.length * CAPTION_CH + 4,
          priority: s.size, // below every name
          prefer: "ns" as const,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
    const all = placeLabels([...names, ...captions], obstacles, {
      ch: LABEL_CH,
      lh: LABEL_LH,
      gap: 5,
      bounds: { x: 0, y: 0, w: layout.width, h: layout.height },
    });
    return {
      names: all.filter((l) => !l.id.startsWith("sit:")),
      captions: all.filter((l) => l.id.startsWith("sit:")),
      nameCandidates: names.length,
      captionCandidates: captions.length,
    };
  }, [layout, visible, ties, nodeById]);

  const order = useMemo(() => ties.order.filter((id) => visible.has(id)), [ties, visible]);
  useEffect(() => {
    if (!active || !visible.has(active)) setActive(order[0] ?? null);
  }, [order, active, visible]);

  const setReading = useCallback(
    (r: Reading) => {
      setReadingState((prev) => {
        const same =
          (prev === null && r === null) ||
          (prev?.kind === "node" && r?.kind === "node" && prev.id === r.id) ||
          (prev?.kind === "tie" && r?.kind === "tie" && prev.key === r.key) ||
          (prev?.kind === "alone" && r?.kind === "alone" && prev.id === r.id) ||
          (prev?.kind === "nomatch" && r?.kind === "nomatch" && prev.query === r.query);
        if (same) return prev;
        onReading?.(r);
        return r;
      });
    },
    [onReading],
  );

  const onKeyDown = useCallback(
    (ev: React.KeyboardEvent<SVGSVGElement>) => {
      const el = document.activeElement as Element | null;
      if (!el || !svgRef.current?.contains(el) || !el.hasAttribute("data-file")) return;
      const cur = el.getAttribute("data-file")!;
      const i = order.indexOf(cur);
      let next: string | undefined;
      if (ev.key === "ArrowRight" || ev.key === "ArrowDown") next = order[Math.min(order.length - 1, i + 1)];
      else if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") next = order[Math.max(0, i - 1)];
      else if (ev.key === "Home") next = order[0];
      else if (ev.key === "End") next = order[order.length - 1];
      else return;
      ev.preventDefault();
      if (next && next !== cur) {
        // A programmatic focus() on an SVG anchor moves activeElement but
        // does not reliably dispatch focusin, so React's onFocus may not
        // run — set the state that the focus handler would have set.
        setActive(next);
        setFocused(next);
        setReading({ kind: "node", id: next });
        refs.current.get(next)?.focus();
      }
    },
    [order, setReading],
  );

  // Find a file: exact name, then exact id, then the first name or id that
  // starts with the query. A tied file is focused (which fills the reading
  // line and scrolls the plate); a file without ties is reported as such.
  const findFile = useCallback(
    (raw: string) => {
      const q = raw.trim().toLowerCase();
      if (!q) return;
      const pool = [
        ...ties.nodes.map((n) => ({ id: n.id, name: n.name, tied: true })),
        ...ties.isolated.map((f) => ({ id: f.id, name: f.name, tied: false })),
      ];
      const hit =
        pool.find((p) => p.name.toLowerCase() === q) ??
        pool.find((p) => p.id.toLowerCase() === q) ??
        pool.find((p) => p.name.toLowerCase().startsWith(q) || p.id.toLowerCase().startsWith(q));
      if (!hit) {
        setReading({ kind: "nomatch", query: raw.trim() });
        return;
      }
      if (hit.tied && nodeById.has(hit.id)) {
        setActive(hit.id);
        setFocused(hit.id);
        setReading({ kind: "node", id: hit.id }); // see onKeyDown: focusin is not guaranteed
        const el = refs.current.get(hit.id);
        if (el) {
          el.focus();
          const n = nodeById.get(hit.id)!;
          const scroller = wrap.current?.parentElement;
          if (scroller && scroller.scrollWidth > scroller.clientWidth) {
            scroller.scrollTo({ left: Math.max(0, n.x - scroller.clientWidth / 2) });
          }
        } else {
          setReading({ kind: "node", id: hit.id }); // hidden by a filter; still readable
        }
        return;
      }
      setReading({ kind: "alone", id: hit.id });
    },
    [ties, nodeById, setReading],
  );

  const hairlines = layout.edges.filter((e) => !e.drawn && edgeVisible(e));
  const hairlineCap = HAIRLINE_CAP_PER_FILE * layout.nodes.length;
  const showHairlines = drawHairlines && hairlines.length <= hairlineCap;
  const drawn = layout.edges
    .filter((e) => e.drawn && edgeVisible(e))
    .sort((a, b) => a.weight - b.weight || a.key.localeCompare(b.key)); // strongest painted last

  const litNode = highlight && nodeById.has(highlight) ? highlight : null;
  const litTie = highlight && edgeByKey.has(highlight) ? highlight : null;
  const readNode = reading?.kind === "node" ? reading.id : null;
  const emphasised = (e: LaidEdge) =>
    e.key === litTie || (litNode !== null && (e.source === litNode || e.target === litNode)) ||
    (readNode !== null && (e.source === readNode || e.target === readNode));

  const readingLine = renderReading(reading, nodeById, edgeByKey, isolatedById, ties);

  return (
    <div ref={wrap} className="plate-canvas">
      <div className="plate-find mono">
        <a className="sr-only-focusable" href="#plate-2-tables">
          Skip to the tables of record
        </a>
        <label>
          <span className="find-label">FIND A FILE</span>
          <input
            type="search"
            list="plate2-files"
            autoComplete="off"
            spellCheck={false}
            value={query}
            placeholder="name or call number"
            aria-label="Find a file on this plate, tied or not"
            onChange={(e) => {
              setQuery(e.target.value);
              // A datalist pick arrives as a change whose value matches an option exactly.
              const v = e.target.value;
              if (ties.nodes.some((n) => n.name === v) || ties.isolated.some((f) => f.name === v)) findFile(v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                findFile(query);
              }
            }}
          />
        </label>
        <datalist id="plate2-files">
          {ties.nodes.map((n) => (
            <option key={n.id} value={n.name}>{callNumber(n.id)}</option>
          ))}
          {ties.isolated.map((f) => (
            <option key={f.id} value={f.name}>{`${callNumber(f.id)} · without ties`}</option>
          ))}
        </datalist>
      </div>
      <svg
        ref={svgRef}
        className="ties"
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="group"
        aria-labelledby="plate-2"
        aria-describedby="plate-2-key plate-2-note"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onPointerLeave={() => setReading(null)}
      >
        {/* ties — hairlines as one path, then full, then strong */}
        <g aria-hidden="true">
          {showHairlines && hairlines.length > 0 && (
            <path
              d={hairlines.map((e) => `M${e.x1} ${e.y1}L${e.x2} ${e.y2}`).join("")}
              fill="none"
              stroke={TIE_STROKE.hairline.stroke}
              strokeWidth={TIE_STROKE.hairline.width}
              vectorEffect="non-scaling-stroke"
            />
          )}
          {drawn.map((e) => {
            const s = emphasised(e) ? TIE_STROKE.strong : TIE_STROKE[e.cls];
            return (
              <g key={e.key}>
                <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={s.stroke} strokeWidth={s.width} />
                <line
                  x1={e.x1}
                  y1={e.y1}
                  x2={e.x2}
                  y2={e.y2}
                  stroke="transparent"
                  strokeWidth={HIT_WIDTH}
                  style={{ pointerEvents: "stroke" }}
                  onPointerEnter={() => setReading({ kind: "tie", key: e.key })}
                />
              </g>
            );
          })}
        </g>

        {/* inset caption and rule */}
        {layout.inset && (
          <g aria-hidden="true">
            <text x={layout.inset.x} y={layout.inset.y + 11} className="plate-caption">
              {`OUTLYING · ${layout.inset.groups} ${layout.inset.groups === 1 ? "GROUP" : "GROUPS"} · ${layout.inset.files} FILES`}
            </text>
            <line
              x1={layout.inset.x}
              y1={layout.inset.y + 16}
              x2={layout.inset.x + layout.inset.w}
              y2={layout.inset.y + 16}
              stroke="var(--rule)"
              strokeWidth={1}
            />
            {layout.inset.overflowGroups > 0 && (
              <text
                x={layout.inset.x}
                y={layout.inset.y + layout.inset.h - 4}
                className="plate-caption"
              >
                {`+ ${layout.inset.overflowGroups} ${layout.inset.overflowGroups === 1 ? "GROUP" : "GROUPS"} IN THE TABLE`}
              </text>
            )}
          </g>
        )}

        {/* situation captions — mono caps with a hairline beneath, no hulls */}
        <g aria-hidden="true">
          {placed.captions.map((c) => {
            const w = c.text.length * CAPTION_CH;
            const x0 = c.anchor === "end" ? c.x - w : c.anchor === "middle" ? c.x - w / 2 : c.x;
            return (
              <g key={c.id}>
                <text x={c.x} y={c.y} textAnchor={c.anchor} className="plate-situation">
                  {c.text}
                </text>
                <line x1={x0} y1={c.y + 3} x2={x0 + w} y2={c.y + 3} stroke="var(--rule)" strokeWidth={1} />
              </g>
            );
          })}
        </g>

        {/* marks — one tab stop, roving tabindex in the table's order */}
        <g>
          {layout.nodes.map((n) => {
            if (!visible.has(n.id)) return null;
            const filtered = !kept.has(n.id);
            const isActive = n.id === active;
            const ring = n.id === focused || n.id === litNode;
            return (
              <a
                key={n.id}
                ref={(el) => {
                  if (el) refs.current.set(n.id, el);
                  else refs.current.delete(n.id);
                }}
                href={`/civilization?id=${encodeURIComponent(n.id)}`}
                className={`plate-node${filtered ? " filtered" : ""}`}
                data-file={n.id}
                tabIndex={isActive ? 0 : -1}
                aria-label={markLine(n)}
                onFocus={() => {
                  setFocused(n.id);
                  setActive(n.id);
                  setReading({ kind: "node", id: n.id });
                }}
                onBlur={() => setFocused((f) => (f === n.id ? null : f))}
                onPointerEnter={() => setReading({ kind: "node", id: n.id })}
              >
                <title>{markLine(n)}</title>
                {ring && (
                  <circle cx={n.x} cy={n.y} r={n.r + 4} fill="none" stroke="var(--cat-coordination)" strokeWidth={2} />
                )}
                <Mark
                  cx={n.x}
                  cy={n.y}
                  r={n.r}
                  category={n.category}
                  confirmed={n.confirmed}
                  status={n.status}
                  filtered={filtered}
                />
              </a>
            );
          })}
        </g>

        {/* names — placed, haloed, never overprinting */}
        <g aria-hidden="true">
          {placed.names.map((l: PlacedLabel) => {
            if (!kept.has(l.id)) return null;
            return (
              <text key={l.id} x={l.x} y={l.y} textAnchor={l.anchor} className="plate-label">
                {l.text}
              </text>
            );
          })}
        </g>
      </svg>

      <div className="plate-reading mono" role="status" aria-live="polite">
        {readingLine}
      </div>
      <div className="plate-figure-foot mono dim">
        {`${placed.names.length} OF ${placed.nameCandidates} NAMES PLACED · ${placed.captions.length} OF ${placed.captionCandidates} SITUATIONS CAPTIONED · ${drawn.length} TIES DRAWN IN FULL · ${
          showHairlines ? `${hairlines.length} HAIRLINES` : `${hairlines.length} HAIRLINES NOT DRAWN`
        }`}
      </div>
    </div>
  );
}

function ActorList({ e }: { e: TieEdge }) {
  return (
    <>
      {e.specificActors.map((a, i) => (
        <span key={`s${i}`}>
          {i > 0 && ", "}
          <span className="tie-actor">{a}</span>
        </span>
      ))}
      {e.ubiquitousActors.map((a, i) => (
        <span key={`u${i}`}>
          {(i > 0 || e.specificActors.length > 0) && ", "}
          <span className="tie-actor-ubiq">{a}</span>
        </span>
      ))}
    </>
  );
}

function renderReading(
  reading: Reading,
  nodeById: Map<string, LaidNode>,
  edgeByKey: Map<string, LaidEdge>,
  isolatedById: Map<string, { id: string; name: string; entries: number }>,
  ties: Ties,
) {
  if (reading?.kind === "node") {
    const n = nodeById.get(reading.id) ?? ties.nodes.find((x) => x.id === reading.id);
    if (!n) return "Mark a file to read its ties.";
    const incident = ties.edges
      .filter((e) => e.source === n.id || e.target === n.id)
      .sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key))
      .slice(0, 3);
    const situation = ties.situations.find((s) => s.members.includes(n.id));
    return (
      <>
        <div className="reading-head">
          <a href={`/civilization?id=${encodeURIComponent(n.id)}`}>{n.name}</a> · {callNumber(n.id)} ·{" "}
          {n.category.toUpperCase()} · {n.confirmed ? CONFIDENCE_LINE.confirmed : CONFIDENCE_LINE.candidate} ·{" "}
          {n.entries} {n.entries === 1 ? "entry" : "entries"} · {n.degreeAll} {n.degreeAll === 1 ? "tie" : "ties"},{" "}
          {n.degree} drawn in full
          {situation && <> · situation {situation.name.toUpperCase()}</>}
        </div>
        {incident.map((e) => {
          const otherId = e.source === n.id ? e.target : e.source;
          const other = nodeById.get(otherId) ?? ties.nodes.find((x) => x.id === otherId);
          return (
            <div key={e.key} className="reading-tie">
              — {other?.name ?? otherId} · together in {e.df} files · <ActorList e={e} />
            </div>
          );
        })}
      </>
    );
  }
  if (reading?.kind === "tie") {
    const e = edgeByKey.get(reading.key);
    if (!e) return "Mark a file to read its ties.";
    const a = nodeById.get(e.source);
    const b = nodeById.get(e.target);
    return (
      <div className="reading-head">
        {a?.name ?? e.source} — {b?.name ?? e.target} · {e.cls.toUpperCase()} · actors together in {e.df} files ·{" "}
        <ActorList e={e} />
      </div>
    );
  }
  if (reading?.kind === "alone") {
    const f = isolatedById.get(reading.id);
    if (!f) return "Mark a file to read its ties.";
    return (
      <div className="reading-head">
        <a href={`/civilization?id=${encodeURIComponent(f.id)}`}>{f.name}</a> · {callNumber(f.id)} has no tie: its{" "}
        {f.entries} {f.entries === 1 ? "entry shares" : "entries share"} no two actors with another file.
      </div>
    );
  }
  if (reading?.kind === "nomatch") {
    return <div className="reading-head">No file named &ldquo;{reading.query}&rdquo; on this plate.</div>;
  }
  return "Mark a file to read its ties — point, or press Tab then the arrow keys.";
}
