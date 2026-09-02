"use client";
import { useMemo } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import type { TieNode, Ties } from "@/lib/survey";
import { mulberry32 } from "@/lib/survey";

// Plate II — ties. Files are nodes; an edge exists where two files share
// at least two named actors — the same predicate cross-civilization
// corroboration uses, so the plate is that mechanism made visible.
// Layout is force-directed but seeded, so the survey draws the same
// way on every visit: a survey that redraws itself isn't a survey.

interface SimNode extends TieNode, SimulationNodeDatum {}
interface SimLink extends SimulationLinkDatum<SimNode> {
  weight: number;
  actors: string[];
}

const SEED = 20260901; // the day the register opened
const LABELS = 28;

function radius(n: TieNode): number {
  return 4 + Math.sqrt(Math.max(1, n.eventCount)) * 2.4;
}

export function TiesPlate({
  ties,
  width = 960,
  height = 600,
}: {
  ties: Ties;
  width?: number;
  height?: number;
}) {
  const layout = useMemo(() => {
    const nodes: SimNode[] = ties.nodes.map((n) => ({ ...n }));
    const byId = new Set(nodes.map((n) => n.id));
    const links: SimLink[] = ties.edges
      .filter((e) => byId.has(e.source) && byId.has(e.target))
      .map((e) => ({ source: e.source, target: e.target, weight: e.weight, actors: e.actors }));
    const maxW = links.reduce((m, l) => Math.max(m, l.weight), 0.001);

    const sim = forceSimulation<SimNode>(nodes)
      .randomSource(mulberry32(SEED))
      .force(
        "link",
        forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance((l) => 36 + 70 * (1 - l.weight / maxW))
          .strength((l) => 0.25 + 0.6 * (l.weight / maxW)),
      )
      .force("charge", forceManyBody<SimNode>().strength(-95))
      .force("center", forceCenter(width / 2, height / 2))
      .force("x", forceX<SimNode>(width / 2).strength(0.045))
      .force("y", forceY<SimNode>(height / 2).strength(0.07))
      .force("collide", forceCollide<SimNode>((n) => radius(n) + 3))
      .stop();
    for (let i = 0; i < 320; i++) sim.tick();

    const pad = 26;
    for (const n of nodes) {
      n.x = Math.max(pad, Math.min(width - pad, n.x ?? width / 2));
      n.y = Math.max(pad, Math.min(height - pad, n.y ?? height / 2));
    }
    const labelled = new Set(
      [...nodes]
        .sort((a, b) => b.degree * b.eventCount - a.degree * a.eventCount)
        .slice(0, LABELS)
        .map((n) => n.id),
    );
    return { nodes, links, maxW, labelled };
  }, [ties, width, height]);

  const { nodes, links, maxW, labelled } = layout;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Plate II, ties: ${nodes.length} files joined by ${links.length} ties of shared actors.`}
    >
      <g>
        {links.map((l, i) => {
          const s = l.source as SimNode;
          const t = l.target as SimNode;
          const w = l.weight / maxW;
          return (
            <line
              key={i}
              x1={s.x}
              y1={s.y}
              x2={t.x}
              y2={t.y}
              stroke="var(--ink-dim)"
              strokeWidth={0.75 + 2 * w}
              strokeOpacity={0.3 + 0.55 * w}
            >
              <title>
                {`${s.name} — ${t.name}\nshared: ${l.actors.join(", ")}`}
              </title>
            </line>
          );
        })}
      </g>
      <g>
        {nodes.map((n) => {
          const r = radius(n);
          const ink = `var(--cat-${n.category})`;
          return (
            <a key={n.id} href={`/civilization?id=${encodeURIComponent(n.id)}`} className="plate-node">
              <circle
                cx={n.x}
                cy={n.y}
                r={r}
                fill={n.confirmed ? ink : "var(--ground)"}
                stroke={ink}
                strokeWidth={1.4}
                strokeDasharray={n.status === "active" ? undefined : "3 2"}
              />
              <title>
                {`${n.name}\n${n.eventCount} ${n.eventCount === 1 ? "entry" : "entries"} · ${n.degree} ${n.degree === 1 ? "tie" : "ties"} · ${n.confirmed ? "has confirmed entries" : "candidate entries only"}`}
              </title>
              {labelled.has(n.id) && (
                <text
                  x={(n.x ?? 0) + r + 4}
                  y={(n.y ?? 0) + 4}
                  className="plate-text"
                >
                  {n.id}
                </text>
              )}
            </a>
          );
        })}
      </g>
    </svg>
  );
}
