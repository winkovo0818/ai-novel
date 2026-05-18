"use client";

import { useState } from "react";

import type { BibleDraft, Character } from "@/lib/validation/schemas";
import { PageHeader } from "@/components/ui/PageHeader";

import { useBibleEdit } from "./useBibleEdit";
import { SaveBar } from "./SaveBar";

interface CharactersEditorProps {
  novelId: string;
  bible: BibleDraft;
}

export function CharactersEditor({ novelId, bible: initialBible }: CharactersEditorProps) {
  const { bible, setBible, dirty, status, error, save } = useBibleEdit(novelId, initialBible);
  const [activeIdx, setActiveIdx] = useState(0);
  const characters = bible.characters;
  const active = characters[activeIdx];

  const updateChar = (idx: number, patch: Partial<Character>) => {
    setBible({
      ...bible,
      characters: characters.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    });
  };

  return (
    <div className="flex-1 overflow-y-auto bg-secondary/30 custom-scrollbar">
      <div className="p-8 md:p-12 lg:p-16 max-w-6xl mx-auto min-h-full pb-32">
        <PageHeader
          title="角色图谱"
          description={`共 ${characters.length} 位核心角色。在此编辑的设定会实时同步至 AI 创作与审计引擎。`}
          breadcrumb={[
            { label: "我的书架", href: "/novels" },
            { label: bible.meta.suggested_title, href: `/novels/${novelId}` },
            { label: "角色图谱" }
          ]}
        />

        <div className="mt-12 grid gap-8 md:grid-cols-[280px_1fr]">
          {/* Left: name list */}
          <aside className="space-y-4">
            <div className="card bg-white p-3 h-fit sticky top-24 shadow-sm border-border-subtle/50">
              <ul className="space-y-1">
                {characters.map((char, idx) => (
                  <li key={idx}>
                    <button
                      onClick={() => setActiveIdx(idx)}
                      className={`w-full text-left px-4 py-3 rounded-xl transition duration-200 group ${
                        activeIdx === idx
                          ? "bg-text-primary text-white shadow-premium"
                          : "hover:bg-secondary text-text-secondary"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[8px] px-1.5 py-0.5 rounded uppercase font-bold tracking-widest ${
                          activeIdx === idx
                            ? "bg-white/20 text-white"
                            : char.role === "protagonist"
                              ? "bg-primary/10 text-primary"
                              : "bg-secondary text-text-dim"
                        }`}>
                          {char.role}
                        </span>
                      </div>
                      <span className="text-sm font-bold block truncate">{char.name || "（未命名角色）"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          {/* Right: editor */}
          {active && (
            <section className="card bg-white space-y-10 p-8 rounded-3xl shadow-sm border-border-subtle/50 animate-fade-in">
              <div className="grid gap-8 md:grid-cols-2">
                <Field
                  label="姓名 / NAME"
                  value={active.name}
                  onChange={(v) => updateChar(activeIdx, { name: v })}
                />
                <Field
                  label="外貌描述 / APPEARANCE"
                  value={active.appearance}
                  onChange={(v) => updateChar(activeIdx, { appearance: v })}
                  hint="建议 40 字以内"
                />
              </div>
              
              <Field
                label="招牌口头禅 / CATCHPHRASE"
                value={active.catchphrase}
                onChange={(v) => updateChar(activeIdx, { catchphrase: v })}
              />
              
              <div className="grid gap-8 md:grid-cols-2">
                <Field
                  label="核心性格 / PERSONALITY"
                  value={active.personality}
                  onChange={(v) => updateChar(activeIdx, { personality: v })}
                  multiline
                />
                <Field
                  label="内在动机 / MOTIVATION"
                  value={active.motivation}
                  onChange={(v) => updateChar(activeIdx, { motivation: v })}
                  multiline
                />
              </div>

              <Field
                label="最终目标 / GOALS"
                value={active.goals}
                onChange={(v) => updateChar(activeIdx, { goals: v })}
                multiline
              />
              
              <div className="grid gap-8 md:grid-cols-2 pt-6 border-t border-border-subtle">
                <ListField
                  label="能力与特长 / ABILITIES"
                  values={active.abilities}
                  onChange={(values) => updateChar(activeIdx, { abilities: values })}
                  min={1}
                  max={5}
                />
                <ListField
                  label="不可言说的秘密 / SECRETS"
                  values={active.secrets}
                  onChange={(values) => updateChar(activeIdx, { secrets: values })}
                  min={1}
                  max={3}
                />
              </div>
            </section>
          )}
        </div>
      </div>

      <SaveBar dirty={dirty} status={status} error={error} onSave={save} />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline,
  hint,
}: {
  label: string;
  value: string;
  onChange(v: string): void;
  multiline?: boolean;
  hint?: string;
}) {
  return (
    <div className="group">
      <div className="flex items-center justify-between mb-2">
        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-dim group-focus-within:text-primary transition-colors">
          {label}
        </label>
        {hint && <span className="text-[10px] text-text-dim">{hint}</span>}
      </div>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full text-sm font-medium text-text-primary bg-secondary/30 border-none rounded-2xl px-4 py-3 focus:ring-2 focus:ring-primary/20 focus:bg-white transition shadow-inner resize-none leading-relaxed"
          rows={4}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full text-sm font-bold text-text-primary bg-secondary/30 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary/20 focus:bg-white transition shadow-inner"
        />
      )}
    </div>
  );
}

function ListField({
  label,
  values,
  onChange,
  min,
  max,
}: {
  label: string;
  values: string[];
  onChange(values: string[]): void;
  min: number;
  max: number;
}) {
  return (
    <div className="group">
      <div className="flex items-center justify-between mb-3">
        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-dim group-focus-within:text-primary transition-colors">
          {label}（{values.length} / {max}）
        </label>
      </div>
      <div className="space-y-3">
        {values.map((v, i) => (
          <div key={i} className="flex gap-2">
            <input
              type="text"
              value={v}
              onChange={(e) => {
                const next = [...values];
                next[i] = e.target.value;
                onChange(next);
              }}
              className="flex-1 text-sm font-medium bg-secondary/30 border-none rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-primary/20 focus:bg-white transition shadow-inner"
            />
            {values.length > min && (
              <button
                type="button"
                onClick={() => onChange(values.filter((_, idx) => idx !== i))}
                className="p-2 text-text-dim hover:text-red-500 transition-colors"
                title="删除"
              >
                <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        ))}
        {values.length < max && (
          <button
            type="button"
            onClick={() => onChange([...values, ""])}
            className="w-full py-3 bg-white border border-dashed border-border-strong rounded-xl text-[11px] font-bold text-text-dim hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition shadow-sm active:scale-[0.98]"
          >
            + 新增描述项
          </button>
        )}
      </div>
    </div>
  );
}
