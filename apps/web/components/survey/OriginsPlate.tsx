"use client";
import { useMemo } from "react";
import { geoGraticule10, geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import land110 from "world-atlas/land-110m.json";
import type { Origins } from "@/lib/survey";
import { placeLabels } from "@/lib/labels";

// Plate I — origins. Files placed at their dominant sponsor's
// headquarters. Filled marks are cited (curated seed or a Wikidata
// headquarters claim); hollow marks are the model's inference. Bronze
// ties join the two sponsors of a multi-origin file. Unplaced files are
// listed beneath the plate, never dropped.

const LABELS = 12;

export function OriginsPlate({
  origins,
  width = 960,
  height = 470,
}: {
  origins: Origins;
  width?: number;
  height?: number;
}) {
  const geo = useMemo(() => {
    const topo = land110 as unknown as Topology<{ land: GeometryCollection }>;
    const land = feature(topo, topo.objects.land);
    const projection = geoNaturalEarth1().fitExtent(
      [
        [6, 6],
        [width - 6, height - 6],
      ],
      { type: "Sphere" },
    );
    const path = geoPath(projection);
    return {
      sphere: path({ type: "Sphere" }) ?? "",
      graticule: path(geoGraticule10()) ?? "",
      land: path(land) ?? "",
      project: (lng: number, lat: number) => projection([lng, lat]) ?? [NaN, NaN],
    };
  }, [width, height]);

  const marks = useMemo(() => {
    const placed = origins.points.map((p) => {
      const [x, y] = geo.project(p.lng, p.lat);
      return { p, x, y, r: 3 + Math.sqrt(p.civs.length) * 2.6 };
    });
    // Labels through the shared placer (lib/labels.ts): biggest first,
    // eight anchors, every mark's disc an obstacle, skipped when there is
    // no clear anchor — the table beneath carries the rest.
    const labelled = placeLabels(
      placed.slice(0, LABELS).map((m, i) => ({
        id: m.p.key,
        x: m.x,
        y: m.y,
        r: m.r,
        text: `${m.p.city} · ${m.p.civs.length}`,
        priority: LABELS - i,
      })),
      placed.map((m) => ({ x: m.x - m.r - 2, y: m.y - m.r - 2, w: 2 * (m.r + 2), h: 2 * (m.r + 2) })),
      { ch: 7.2, lh: 13, gap: 4, bounds: { x: 0, y: 0, w: width, h: height } },
    );
    return { placed, labelled };
  }, [origins, geo, width, height]);

  const placedFiles = origins.points.reduce((n, p) => n + p.civs.length, 0);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Plate I, origins: ${placedFiles} files placed at ${origins.points.length} sponsor headquarters; ${origins.unplaced.length} unplaced.`}
    >
      <path d={geo.sphere} fill="none" stroke="var(--rule)" strokeWidth={1} />
      <path d={geo.graticule} fill="none" stroke="var(--rule)" strokeWidth={0.5} strokeDasharray="2 3" />
      <path d={geo.land} fill="var(--surface)" stroke="var(--ink-dim)" strokeWidth={0.5} />
      <g>
        {origins.ties.map((t, i) => {
          const [x1, y1] = geo.project(t.from.lng, t.from.lat);
          const [x2, y2] = geo.project(t.to.lng, t.to.lat);
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--seal)"
              strokeWidth={1}
              strokeDasharray="4 3"
            >
              <title>{`${t.civ.name}: ${t.from.city} ↔ ${t.to.city}`}</title>
            </line>
          );
        })}
      </g>
      <g>
        {marks.placed.map(({ p, x, y, r }) => {
          const ink = `var(--cat-${p.dominantCategory})`;
          const cited = p.provenance !== "inferred";
          return (
            <g key={p.key}>
              <circle
                cx={x}
                cy={y}
                r={r}
                fill={cited ? ink : "var(--ground)"}
                stroke={cited ? "var(--ground)" : ink}
                strokeWidth={cited ? 1 : 1.6}
              />
              <circle cx={x} cy={y} r={r + 1} fill="none" stroke={ink} strokeWidth={0.75} />
              <title>
                {`${p.city}, ${p.country} · ${p.civs.length} ${p.civs.length === 1 ? "file" : "files"}\n${p.civs
                  .slice(0, 8)
                  .map((c) => c.name)
                  .join(", ")}${p.civs.length > 8 ? ", …" : ""}`}
              </title>
            </g>
          );
        })}
      </g>
      <g>
        {marks.labelled.map((l) => (
          <text key={l.id} x={l.x} y={l.y} textAnchor={l.anchor} className="plate-text">
            {l.text}
          </text>
        ))}
      </g>
    </svg>
  );
}
