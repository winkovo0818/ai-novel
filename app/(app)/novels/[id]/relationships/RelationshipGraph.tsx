"use client";

import { useMemo } from "react";

import type { Character } from "@/lib/validation/schemas";
import {
  circularLayout,
  extractRelationEdges,
  insetSegment,
} from "@/lib/bible/relations";

interface RelationshipGraphProps {
  characters: Character[];
  hoveredName: string | null;
  onHover(name: string | null): void;
}

const VIEWBOX_WIDTH = 800;
const VIEWBOX_HEIGHT = 600;
const CENTER_X = VIEWBOX_WIDTH / 2;
const CENTER_Y = VIEWBOX_HEIGHT / 2;
const NODE_RADIUS = 44;
// Pull the ring in enough that node labels don't clip the SVG edge on
// 8-character bibles. Tuned by eye for VIEWBOX_HEIGHT=600.
const ORBIT_RADIUS = 200;
export type CharacterRole = Character["role"];

const ROLE_COLOR: Record<CharacterRole, { fill: string; stroke: string; label: string }> = {
  protagonist: { fill: "#6366f1", stroke: "#4338ca", label: "主角" },
  mentor: { fill: "#10b981", stroke: "#047857", label: "导师" },
  antagonist: { fill: "#ef4444", stroke: "#b91c1c", label: "反派" },
  sidekick: { fill: "#f59e0b", stroke: "#b45309", label: "伙伴" },
  hidden: { fill: "#6b7280", stroke: "#374151", label: "隐线" },
};

export function RelationshipGraph({ characters, hoveredName, onHover }: RelationshipGraphProps) {
  const { edges, positions } = useMemo(() => {
    const positions = circularLayout(characters.length, ORBIT_RADIUS, CENTER_X, CENTER_Y);
    const graph = extractRelationEdges(characters);
    return { ...graph, positions };
  }, [characters]);

  const positionByName = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    characters.forEach((c, i) => {
      map.set(c.name, positions[i]);
    });
    return map;
  }, [characters, positions]);

  return (
    <div className="card bg-white p-0 overflow-hidden">
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        className="w-full h-auto max-h-[640px] block"
        role="img"
        aria-label="角色关系图"
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="#9ca3af" />
          </marker>
          <marker
            id="arrow-active"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="#6366f1" />
          </marker>
        </defs>

        {/* edges first so nodes paint on top */}
        {edges.map((edge, i) => {
          const from = positionByName.get(edge.fromName);
          const to = positionByName.get(edge.toName);
          if (!from || !to) return null;
          const { start, end } = insetSegment(from, to, NODE_RADIUS + 4);
          const isActive =
            hoveredName === edge.fromName || hoveredName === edge.toName;
          const stroke = isActive ? "#6366f1" : "#9ca3af";
          const opacity = hoveredName && !isActive ? 0.15 : 0.7;
          return (
            <g key={`${edge.fromName}-${edge.toName}-${i}`} opacity={opacity}>
              <line
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                stroke={stroke}
                strokeWidth={isActive ? 2 : 1.5}
                markerEnd={`url(#${isActive ? "arrow-active" : "arrow"})`}
              />
            </g>
          );
        })}

        {/* nodes */}
        {characters.map((c, i) => {
          const pos = positions[i];
          if (!pos) return null;
          const color = ROLE_COLOR[c.role];
          const isActive = hoveredName === c.name;
          const isOtherActive = hoveredName !== null && !isActive;
          return (
            <g
              key={c.name}
              transform={`translate(${pos.x}, ${pos.y})`}
              className="cursor-pointer"
              onMouseEnter={() => onHover(c.name)}
              onMouseLeave={() => onHover(null)}
              opacity={isOtherActive ? 0.45 : 1}
            >
              <circle
                r={NODE_RADIUS}
                fill={color.fill}
                stroke={color.stroke}
                strokeWidth={isActive ? 4 : 2}
              />
              <text
                textAnchor="middle"
                dy="0.35em"
                fontSize="14"
                fontWeight="700"
                fill="white"
                pointerEvents="none"
              >
                {c.name}
              </text>
              <text
                textAnchor="middle"
                y={NODE_RADIUS + 18}
                fontSize="11"
                fontWeight="600"
                fill={color.stroke}
                pointerEvents="none"
              >
                {color.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export { ROLE_COLOR };
