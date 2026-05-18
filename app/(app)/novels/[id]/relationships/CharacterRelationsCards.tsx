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
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-2">
        {characters.map((c, idx) => {
          const incoming = edges.filter((e) => e.toName === c.name);
          const isActive = hoveredName === c.name;
          return (
            <div
              key={`${c.name}-${idx}`}
              onMouseEnter={() => onHover(c.name)}
              onMouseLeave={() => onHover(null)}
              className={`card bg-white transition duration-500 border-2 ${
                isActive ? "border-primary shadow-premium scale-[1.01]" : "border-transparent"
              }`}
            >
              <header className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className={`h-4 w-4 rounded-full shadow-lg ${ROLE_DOT_CLASS[c.role]}`} />
                  <div>
                    <h3 className="text-xl font-bold text-text-primary tracking-tight">{c.name}</h3>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-text-dim mt-0.5">
                      {ROLE_COLOR[c.role].label} · {c.age} 岁
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] px-2 py-1 bg-secondary rounded-lg font-bold text-text-secondary uppercase tracking-tighter">
                    {c.role}
                  </span>
                </div>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <section>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-dim mb-2 border-b border-border-subtle pb-1">
                    人物小传 / BIO
                  </h4>
                  <p className="text-[13px] text-text-secondary leading-relaxed">
                    {c.personality}
                  </p>
                </section>
                <section>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-dim mb-2 border-b border-border-subtle pb-1">
                    外貌特征 / LOOK
                  </h4>
                  <p className="text-[13px] text-text-secondary leading-relaxed">
                    {c.appearance}
                  </p>
                </section>
              </div>

              <div className="space-y-6">
                <section className="bg-secondary/20 p-4 rounded-2xl border border-border-subtle/50">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-dim mb-3">
                    核心动机与目标 / GOALS
                  </h4>
                  <p className="text-[13px] text-text-secondary leading-relaxed">
                    <span className="font-bold text-primary mr-2">动机：</span>{c.motivation}
                  </p>
                  <p className="text-[13px] text-text-secondary leading-relaxed mt-1">
                    <span className="font-bold text-primary mr-2">目标：</span>{c.goals}
                  </p>
                </section>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-dim mb-3">
                      我的 relations
                    </h4>
                    <RelationsEditor
                      relations={c.relations}
                      onChange={(next) => onUpdateRelations(idx, next)}
                      knownNames={characters.map((other) => other.name).filter((n) => n !== c.name)}
                    />
                  </div>

                  {incoming.length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-dim mb-3">
                        被提及
                      </h4>
                      <ul className="space-y-2">
                        {incoming.map((e, i) => (
                          <li key={i} className="text-[13px] text-text-secondary bg-white p-3 rounded-xl border border-border-subtle shadow-sm flex items-start gap-2">
                            <span className="font-bold text-primary shrink-0">←</span>
                            <span>
                              <span className="font-bold text-text-primary">{e.fromName}</span>
                              <span className="text-text-dim mx-1">·</span>
                              <span className="text-text-muted">{e.label}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
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
      <div className="space-y-3">
        <p className="text-[12px] text-text-dim">尚未配置 relations</p>
        <button
          type="button"
          onClick={() => onChange([""])}
          className="w-full py-2.5 bg-white border border-dashed border-border-strong rounded-xl text-[11px] font-bold text-text-dim hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition"
        >
          + 新增一条
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {relations.map((value, i) => {
        const trimmed = value.trim();
        const matchedNames = trimmed
          ? knownNames.filter((n) => trimmed.includes(n))
          : [];
        return (
          <div key={i} className="space-y-1.5 group/item">
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
                className="flex-1 text-[13px] font-medium bg-white border border-border-subtle rounded-xl px-4 py-2.5 focus:ring-4 focus:ring-primary/5 focus:border-primary transition shadow-sm"
              />
              <button
                type="button"
                onClick={() => onChange(relations.filter((_, idx) => idx !== i))}
                className="p-2 text-text-dim hover:text-red-500 hover:bg-red-50 rounded-lg transition opacity-0 group-hover/item:opacity-100"
                title="删除"
              >
                <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {trimmed && matchedNames.length > 0 && (
              <p className="text-[10px] text-emerald-600 pl-4 font-bold animate-fade-in flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-emerald-500" />
                识别连边：{matchedNames.join("、")}
              </p>
            )}
            {trimmed && matchedNames.length === 0 && (
              <p className="text-[10px] text-amber-600 pl-4 animate-fade-in flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-amber-500" />
                未匹配角色名，仅作背景备注
              </p>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => onChange([...relations, ""])}
        className="w-full py-2.5 bg-white border border-dashed border-border-strong rounded-xl text-[11px] font-bold text-text-dim hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition"
      >
        + 新增关系项
      </button>
    </div>
  );
}

