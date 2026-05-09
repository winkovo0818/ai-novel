"use client";

import { useState } from "react";

import type { BibleDraft, Character } from "@/lib/validation/schemas";
import { PageHeader } from "@/components/ui/PageHeader";

import { useBibleEdit } from "./useBibleEdit";
import { SaveBar } from "./SaveBar";
import Link from "next/link";

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
    <div className="flex-1 overflow-y-auto bg-secondary/20 custom-scrollbar">
      <div className="p-8 md:p-12 lg:p-16 max-w-6xl mx-auto min-h-full pb-32">
        <PageHeader
          title="角色"
          description={`共 ${characters.length} 位角色。在此编辑会同步到所有 AI 起草和审校。`}
          breadcrumb={
            <span className="flex items-center gap-2">
              <Link href={`/novels/${novelId}`} className="hover:text-text-primary">{bible.meta.suggested_title}</Link>
              <span>·</span>
              <span>角色</span>
            </span>
          }
        />

        <div className="mt-12 grid gap-6 md:grid-cols-[260px_1fr]">
          {/* Left: name list */}
          <aside className="card bg-white p-3 h-fit sticky top-4">
            <ul className="space-y-1">
              {characters.map((char, idx) => (
                <li key={idx}>
                  <button
                    onClick={() => setActiveIdx(idx)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                      activeIdx === idx
                        ? "bg-primary/5 border border-primary/20 text-primary"
                        : "hover:bg-secondary text-text-secondary"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        char.role === "protagonist"
                          ? "bg-primary/10 text-primary"
                          : "bg-secondary text-text-muted"
                      }`}>
                        {char.role}
                      </span>
                    </div>
                    <span className="text-sm font-medium block truncate">{char.name || "（未命名）"}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {/* Right: editor */}
          {active && (
            <section className="card bg-white space-y-6">
              <Field
                label="姓名"
                value={active.name}
                onChange={(v) => updateChar(activeIdx, { name: v })}
              />
              <Field
                label="外貌"
                value={active.appearance}
                onChange={(v) => updateChar(activeIdx, { appearance: v })}
                hint="40 字以内"
              />
              <Field
                label="口头禅"
                value={active.catchphrase}
                onChange={(v) => updateChar(activeIdx, { catchphrase: v })}
              />
              <Field
                label="性格"
                value={active.personality}
                onChange={(v) => updateChar(activeIdx, { personality: v })}
                multiline
              />
              <Field
                label="动机"
                value={active.motivation}
                onChange={(v) => updateChar(activeIdx, { motivation: v })}
                multiline
              />
              <Field
                label="目标"
                value={active.goals}
                onChange={(v) => updateChar(activeIdx, { goals: v })}
                multiline
              />
              <ListField
                label="能力"
                values={active.abilities}
                onChange={(values) => updateChar(activeIdx, { abilities: values })}
                min={1}
                max={3}
              />
              <ListField
                label="秘密"
                values={active.secrets}
                onChange={(values) => updateChar(activeIdx, { secrets: values })}
                min={1}
                max={2}
              />
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
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-muted">
          {label}
        </label>
        {hint && <span className="text-[10px] text-text-muted">{hint}</span>}
      </div>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full text-sm text-text-primary bg-white border border-border-subtle rounded-md px-3 py-2 focus:border-primary focus:outline-none resize-none leading-relaxed"
          rows={3}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full text-sm text-text-primary bg-white border border-border-subtle rounded-md px-3 py-2 focus:border-primary focus:outline-none"
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
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-muted">
          {label}（{values.length} / {max}）
        </label>
      </div>
      <div className="space-y-2">
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
              className="flex-1 text-sm bg-white border border-border-subtle rounded-md px-3 py-2 focus:border-primary focus:outline-none"
            />
            {values.length > min && (
              <button
                type="button"
                onClick={() => onChange(values.filter((_, idx) => idx !== i))}
                className="p-2 text-text-muted hover:text-red-500"
                title="删除"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            className="w-full py-2 border border-dashed border-border-subtle rounded-md text-[11px] font-bold text-text-muted hover:border-primary/30 hover:text-primary transition-colors"
          >
            + 新增一条
          </button>
        )}
      </div>
    </div>
  );
}
