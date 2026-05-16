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
const VIEWBOX_HEIGHT = 640;
const CENTER_X = VIEWBOX_WIDTH / 2;
const CENTER_Y = VIEWBOX_HEIGHT / 2 - 20;
const NODE_RADIUS = 48;
// Pull the ring in enough that node labels don't clip the SVG edge on
// 8-character bibles. Tuned by eye for VIEWBOX_HEIGHT=600.
const ORBIT_RADIUS = 210;
export type CharacterRole = Character["role"];

const ROLE_COLOR: Record<CharacterRole, { fill: string; stroke: string; label: string; gradient: [string, string] }> = {
  protagonist: { fill: "#6366f1", stroke: "#4338ca", label: "主角", gradient: ["#818cf8", "#4f46e5"] },
  mentor: { fill: "#10b981", stroke: "#047857", label: "导师", gradient: ["#34d399", "#059669"] },
  antagonist: { fill: "#ef4444", stroke: "#b91c1c", label: "反派", gradient: ["#f87171", "#dc2626"] },
  sidekick: { fill: "#f59e0b", stroke: "#b45309", label: "伙伴", gradient: ["#fbbf24", "#d97706"] },
  hidden: { fill: "#6b7280", stroke: "#374151", label: "隐线", gradient: ["#9ca3af", "#4b5563"] },
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
    <div className="card bg-white p-0 overflow-hidden shadow-premium border-border-subtle relative">
      <div className="absolute top-8 left-8 z-10 pointer-events-none">
         <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary/60 mb-1">叙事动力学图谱 / CORE DYNAMICS</h2>
         <p className="text-[14px] text-text-primary font-bold font-serif italic">角色关系脉络实时映射</p>
      </div>
      
      <svg aria-hidden="true"
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        className="w-full h-auto max-h-[700px] block transition-opacity duration-300"
        role="img"
        aria-label="角色关系图: 显示角色间的冲突、伙伴和导师关系"
      >
        <defs>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
            <feOffset dx="0" dy="2" result="offsetblur" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.1" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {characters.map((c) => {
            const color = ROLE_COLOR[c.role];
            return (
              <linearGradient key={`grad-${c.name}`} id={`grad-${c.name}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={color.gradient[0]} />
                <stop offset="100%" stopColor={color.gradient[1]} />
              </linearGradient>
            );
          })}

          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="#d1d5db" />
          </marker>
          <marker
            id="arrow-active"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
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
          const { start, end } = insetSegment(from, to, NODE_RADIUS + 8);
          const isActive =
            hoveredName === edge.fromName || hoveredName === edge.toName;
          const isBothActive = hoveredName === edge.fromName && hoveredName !== null; // direction highlight
          const stroke = isActive ? "#6366f1" : "#e5e7eb";
          const opacity = hoveredName && !isActive ? 0.1 : 0.8;
          
          return (
            <g key={`${edge.fromName}-${edge.toName}-${i}`} opacity={opacity} className="transition-opacity duration-300">
              <path
                d={`M ${start.x} ${start.y} L ${end.x} ${end.y}`}
                fill="none"
                stroke={stroke}
                strokeWidth={isActive ? 2.5 : 1.5}
                markerEnd={`url(#${isActive ? "arrow-active" : "arrow"})`}
                className="transition duration-300"
              />
              {isActive && (
                <text
                  x={(start.x + end.x) / 2}
                  y={(start.y + end.y) / 2 - 8}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="bold"
                  fill="#4f46e5"
                  className="animate-fade-in"
                >
                  {edge.label}
                </text>
              )}
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
              className="cursor-pointer group"
              onMouseEnter={() => onHover(c.name)}
              onMouseLeave={() => onHover(null)}
              opacity={isOtherActive ? 0.3 : 1}
              style={{ transition: "opacity 0.3s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
            >
              <circle
                r={NODE_RADIUS}
                fill={`url(#grad-${c.name})`}
                stroke={isActive ? "white" : color.stroke}
                strokeWidth={isActive ? 4 : 1}
                filter="url(#shadow)"
                className="transition duration-300"
              />
              
              {/* Name backdrop for better contrast */}
              <text
                textAnchor="middle"
                dy="0.35em"
                fontSize="15"
                fontWeight="800"
                fill="white"
                pointerEvents="none"
                className="select-none"
              >
                {c.name}
              </text>
              
              <g transform={`translate(0, ${NODE_RADIUS + 22})`}>
                <rect
                  x="-24"
                  y="-10"
                  width="48"
                  height="18"
                  rx="9"
                  fill={isActive ? color.fill : "white"}
                  stroke={color.stroke}
                  strokeWidth="1"
                  className="transition-colors duration-300"
                />
                <text
                  textAnchor="middle"
                  dy="0.3em"
                  fontSize="10"
                  fontWeight="bold"
                  fill={isActive ? "white" : color.stroke}
                  pointerEvents="none"
                  className="select-none uppercase tracking-tighter"
                >
                  {color.label}
                </text>
              </g>

              {isActive && (
                <circle
                  r={NODE_RADIUS + 6}
                  fill="none"
                  stroke={color.fill}
                  strokeWidth="1"
                  strokeDasharray="4 4"
                  className="animate-[spin_10s_linear_infinite]"
                />
              )}
            </g>
          );
        })}
      </svg>
      
      <div className="absolute bottom-6 right-8 flex flex-wrap gap-4 bg-white/80 backdrop-blur-sm p-3 rounded-2xl border border-border-subtle shadow-sm">
         {Object.values(ROLE_COLOR).map(role => (
           <div key={role.label} className="flex items-center gap-2">
             <div className="w-2.5 h-2.5 rounded-full" style={{ background: role.fill }} />
             <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">{role.label}</span>
           </div>
         ))}
      </div>
    </div>
  );
}

export { ROLE_COLOR };

