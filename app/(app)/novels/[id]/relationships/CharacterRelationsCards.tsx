"use client";

import { useMemo } from "react";

import type { Character } from "@/lib/validation/schemas";
import { extractRelationEdges } from "@/lib/bible/relations";

import { ROLE_COLOR, type CharacterRole } from "./RelationshipGraph";

interface CharacterRelationsCardsProps {
  characters: Character[];
  hoveredName: string | null;
  onHover(name: string | null): void;
  onUpdateRelations(index: number, relations: string[]): void;
}

const ROLE_DOT_CLASS: Record<CharacterRole, string> = {
  protagonist: "bg-indigo-500",
  mentor: "bg-emerald-500",
  antagonist: "bg-red-500",
  sidekick: "bg-amber-500",
  hidden: "bg-gray-500",
};

/**
 * Editable per-character cards under the graph. Each card lets the user
 * edit *their own* character's relations[] strings. The "被提及"
 * (mentioned-by) section is derived from other characters' relations and
 * stays read-only — to change it, edit the other character's card.
 */
export function CharacterRelationsCards({
  characters,
  hoveredName,
  onHover,
  onUpdateRelations,
}: CharacterRelationsCardsProps) {
  const { edges } = useMemo(() => extractRelationEdges(characters), [characters]);

  return (
    <div>
      <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-text-dim mb-6">
        编辑 relations / EDIT RELATIONS
      </h2>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {characters.map((c, idx) => {
          const incoming = edges.filter((e) => e.toName === c.name);
          const isActive = hoveredName === c.name;
          return (
            <div
              key={`${c.name}-${idx}`}
              onMouseEnter={() => onHover(c.name)}
              onMouseLeave={() => onHover(null)}
              className={`card bg-white transition-all ${
                isActive ? "border-primary/40 shadow-premium" : ""
              }`}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className={`h-3 w-3 rounded-full ${ROLE_DOT_CLASS[c.role]}`} />
                <h3 className="text-[15px] font-bold text-text-primary">{c.name}</h3>
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-dim ml-auto">
                  {ROLE_COLOR[c.role].label}
                </span>
              </div>

              <div className="mb-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-dim mb-2">
                  我的 relations
                </p>
                <RelationsEditor
                  relations={c.relations}
                  onChange={(next) => onUpdateRelations(idx, next)}
                  knownNames={characters.map((other) => other.name).filter((n) => n !== c.name)}
                />
              </div>

              {incoming.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-dim mb-2">
                    被提及
                  </p>
                  <ul className="space-y-1">
                    {incoming.map((e, i) => (
                      <li key={i} className="text-[12px] text-text-muted">
                        <span className="font-semibold text-text-primary">← {e.fromName}</span>
                        <span className="text-text-dim"> · {e.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RelationsEditor({
  relations,
  onChange,
  knownNames,
}: {
  relations: string[];
  onChange(next: string[]): void;
  knownNames: string[];
}) {
  if (relations.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-[12px] text-text-dim italic">尚未配置 relations</p>
        <button
          type="button"
          onClick={() => onChange([""])}
          className="w-full py-2 bg-white border border-dashed border-border-strong rounded-xl text-[11px] font-bold text-text-dim hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all"
        >
          + 新增一条
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {relations.map((value, i) => {
        const trimmed = value.trim();
        const matchedNames = trimmed
          ? knownNames.filter((n) => trimmed.includes(n))
          : [];
        return (
          <div key={i} className="space-y-1">
            <div className="flex gap-2">
              <input
                type="text"
                value={value}
                placeholder="例：Bob 的姐姐"
                onChange={(e) => {
                  const next = [...relations];
                  next[i] = e.target.value;
                  onChange(next);
                }}
                className="flex-1 text-[13px] font-medium bg-secondary/30 border-none rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary/20 focus:bg-white transition-all shadow-inner"
              />
              <button
                type="button"
                onClick={() => onChange(relations.filter((_, idx) => idx !== i))}
                className="p-1.5 text-text-dim hover:text-red-500 transition-colors"
                title="删除"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {trimmed && matchedNames.length > 0 && (
              <p className="text-[10px] text-emerald-600 pl-1">
                → 将连边到：{matchedNames.join("、")}
              </p>
            )}
            {trimmed && matchedNames.length === 0 && (
              <p className="text-[10px] text-amber-600 pl-1">
                未匹配任何角色名，不会画进图里
              </p>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => onChange([...relations, ""])}
        className="w-full py-2 bg-white border border-dashed border-border-strong rounded-xl text-[11px] font-bold text-text-dim hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all"
      >
        + 新增一条
      </button>
    </div>
  );
}
