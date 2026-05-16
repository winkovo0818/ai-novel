"use client";

import { useRouter } from "next/navigation";

import { useWizardStore } from "@/lib/store/wizardStore";
import { BibleDraftSchema, type BibleDraft } from "@/lib/validation/schemas";
import { StepShell } from "./StepShell";
import React from "react";

export function Step5Review() {
  const router = useRouter();
  const store = useWizardStore();
  const validationIssues = getBibleValidationIssues(store.bible_draft);

  async function finalize(action: "save_only" | "start_writing") {
    if (!store.session_id || !store.default_profile) {
      store.setError({ step: 5, message: "缺失会话元数据", retryable: false });
      return;
    }

    if (validationIssues.length > 0) {
      store.setError({
        step: 5,
        message: `校验未通过: ${validationIssues[0]}`,
        retryable: false,
      });
      return;
    }

    const validation = BibleDraftSchema.parse(store.bible_draft);

    store.setStatus("loading");
    const response = await fetch(`/api/onboarding/sessions/${store.session_id}/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bible_draft: validation,
        profile: store.default_profile,
        action,
      }),
    });
    const json = await response.json();
    if (!json.ok) {
      store.setError({ step: 5, message: json.error.message, retryable: json.error.retryable });
      return;
    }

    store.setStatus("done");
    if (action === "start_writing") router.push(json.data.editor_url);
  }

  function regenerate() {
    if (store.regeneration_count >= 3) {
      store.setError({ step: 5, message: "重试次数已达上限", retryable: false });
      return;
    }

    store.setBibleDraft(undefined);
    store.setStep(4);
  }

  return (
    <StepShell eyebrow="分册 05" title="圣经核对与微调" description="请最后审计合成后的叙事圣经。您可以直接修改不符合预期的细节，确认无误后即可开启创作。">
      <div className="grid gap-12">
        {store.bible_draft ? (
          <BibleReviewCards draft={store.bible_draft} onChange={store.setBibleDraft} />
        ) : (
          <FallbackNotice />
        )}
        
        {validationIssues.length > 0 && <ValidationPanel issues={validationIssues} />}

        <footer className="flex flex-wrap items-center justify-between gap-8 pt-10 border-t border-border-subtle">
          <button 
            className="group flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.2em] text-text-dim hover:text-red-500 transition duration-500" 
            onClick={regenerate}
          >
            <div className="h-10 w-10 rounded-full border border-border-strong flex items-center justify-center group-hover:border-red-200 group-hover:bg-red-50 transition">
              <svg aria-hidden="true" className="w-4 h-4 transition-transform duration-300 group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            重新合成圣经 ({store.regeneration_count}/3)
          </button>
          
          <div className="flex items-center gap-4">
            <button 
              className="h-12 px-6 rounded-full border border-border-strong text-text-primary text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-secondary transition active:scale-95 disabled:opacity-30" 
              disabled={store.status === "loading"} 
              onClick={() => finalize("save_only")}
            >
              暂存草稿
            </button>
            <button 
              className="group h-14 px-8 rounded-full bg-text-primary text-white text-[11px] font-bold uppercase tracking-[0.2em] shadow-premium hover:bg-accent transition flex items-center gap-3 active:scale-95 disabled:opacity-30 relative overflow-hidden" 
              disabled={store.status === "loading"} 
              onClick={() => finalize("start_writing")}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer pointer-events-none" />
              {store.status === "loading" ? (
                <>
                  <div className="h-4 w-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  正在初始化…
                </>
              ) : (
                <>
                  确认并开启创作
                  <svg aria-hidden="true" className="w-4 h-4 group-hover:translate-x-1.5 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </footer>
      </div>
    </StepShell>
  );
}

function ValidationPanel({ issues }: { issues: string[] }) {
  return (
    <div className="card bg-red-50/20 border-red-100 p-8 shadow-none animate-shake">
      <div className="flex items-center gap-4 mb-4">
        <span className="font-serif text-4xl text-red-200 leading-none">!</span>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-800">叙事一致性冲突 / INTEGRITY FAULT</p>
      </div>
      <ul className="grid gap-2 ml-12">
        {issues.map((issue, i) => (
          <li key={i} className="text-[13px] text-red-900/60 font-serif italic">
            <span className="text-red-300 mr-2 font-sans font-bold not-italic text-[9px]">修正请求</span> {issue}
          </li>
        ))}
      </ul>
    </div>
  );
}

function getBibleValidationIssues(draft: Partial<BibleDraft> | undefined): string[] {
  const parsed = BibleDraftSchema.safeParse(draft);
  if (parsed.success) return [];

  return parsed.error.errors.slice(0, 5).map((error) => {
    const path = error.path.join(".") || "BIBLE";
    return `${path}: ${error.message}`;
  });
}

function BibleReviewCards({
  draft,
  onChange,
}: {
  draft: Partial<BibleDraft>;
  onChange: (draft: Partial<BibleDraft>) => void;
}) {
  function updateMeta(next: Partial<BibleDraft>["meta"]) {
    onChange({ ...draft, meta: next });
  }

  function updateCharacter(index: number, patch: Partial<BibleDraft["characters"][number]>) {
    const characters = [...(draft.characters ?? [])];
    const current = characters[index];
    if (!current) return;
    characters[index] = { ...current, ...patch };
    onChange({ ...draft, characters });
  }

  function addCharacter() {
    const characters = draft.characters ?? [];
    if (characters.length >= 8) return;
    onChange({
      ...draft,
      characters: [
        ...characters,
        {
          role: "hidden",
          name: "新角色原型",
          age: "未知",
          appearance: "待定义…",
          personality: "待定义…",
          catchphrase: "未闻其声",
          abilities: ["潜在"],
          goals: "隐藏",
          motivation: "模糊",
          secrets: ["无"],
          relations: [],
        },
      ],
    });
  }

  function removeCharacter(index: number) {
    const characters = draft.characters ?? [];
    if (characters.length <= 3) return;
    onChange({ ...draft, characters: characters.filter((_, i) => i !== index) });
  }

  function updateWorld(patch: Partial<BibleDraft["world"]>) {
    if (!draft.world) return;
    onChange({ ...draft, world: { ...draft.world, ...patch } });
  }

  function updateChapter(index: number, patch: Partial<BibleDraft["outline"]["volume_1"]["chapters"][number]>) {
    const volume = draft.outline?.volume_1;
    if (!volume) return;
    const chapters = [...volume.chapters];
    const current = chapters[index];
    if (!current) return;
    chapters[index] = { ...current, ...patch };
    onChange({ ...draft, outline: { volume_1: { ...volume, chapters } } });
  }

  function addChapter() {
    const volume = draft.outline?.volume_1;
    if (!volume || volume.chapters.length >= 24) return;
    const nextIndex = volume.chapters.length + 1;
    onChange({
      ...draft,
      outline: {
        volume_1: {
          ...volume,
          chapters: [
            ...volume.chapters,
            {
              index: nextIndex,
              title: `新叙事单元 ${String(nextIndex).padStart(2, "0")}`,
              summary: "等待编织梗概…",
            },
          ],
        },
      },
    });
  }

  function removeChapter(index: number) {
    const volume = draft.outline?.volume_1;
    if (!volume || volume.chapters.length <= 8) return;
    const chapters = volume.chapters
      .filter((_, i) => i !== index)
      .map((chapter, i) => ({ ...chapter, index: i + 1 }));
    onChange({ ...draft, outline: { volume_1: { ...volume, chapters } } });
  }

  function updateBeat(index: number, patch: Partial<BibleDraft["first_chapter_beats"][number]>) {
    const beats = [...(draft.first_chapter_beats ?? [])];
    const current = beats[index];
    if (!current) return;
    beats[index] = { ...current, ...patch };
    onChange({ ...draft, first_chapter_beats: beats });
  }

  function addBeat() {
    const beats = draft.first_chapter_beats ?? [];
    if (beats.length >= 8) return;
    const nextBeat = beats.length + 1;
    onChange({
      ...draft,
      first_chapter_beats: [
        ...beats,
        {
          beat: nextBeat,
          scene: "新场景",
          purpose: "叙事目标…",
        },
      ],
    });
  }

  function removeBeat(index: number) {
    const beats = draft.first_chapter_beats ?? [];
    if (beats.length <= 5) return;
    onChange({
      ...draft,
      first_chapter_beats: beats
        .filter((_, i) => i !== index)
        .map((beat, i) => ({ ...beat, beat: i + 1 })),
    });
  }

  return (
    <div className="grid gap-16">
      {/* Meta Section */}
      <section className="bg-white border-b border-border-strong pb-12 group relative">
        <FolioIndex index="01" label="核心元数据 / CORE META" />
        <div className="grid gap-8 mt-10">
          <TextField
            className="text-4xl md:text-5xl font-serif font-normal !bg-transparent !border-none !px-0 focus:!ring-0 placeholder:text-text-dim/10 italic"
            value={draft.meta?.suggested_title ?? ""}
            placeholder="未命名的作品"
            onChange={(value) => updateMeta({
              suggested_title: value,
              alternative_titles: draft.meta?.alternative_titles ?? [],
            })}
          />
          <div className="flex flex-wrap gap-3">
            {(draft.meta?.alternative_titles ?? []).map((title, i) => (
              <span key={i} className="px-5 py-1.5 bg-secondary border border-border-subtle rounded-full text-[12px] font-serif italic text-text-muted">
                <span className="opacity-30 mr-2 font-sans font-bold uppercase text-[8px] not-italic">备选 {i+1}</span>
                {title}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Characters Grid */}
      <section className="group relative">
        <header className="flex items-center justify-between mb-10">
           <FolioIndex index="02" label="叙事角色阵列 / CHARACTER ARCHETYPES" />
           <button 
            className="btn-secondary !h-9 !px-5 text-[10px] font-bold rounded-full uppercase tracking-[0.2em] shadow-sm hover:border-accent" 
            disabled={(draft.characters ?? []).length >= 8} 
            onClick={addCharacter}
          >
            + 补充角色
          </button>
        </header>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {(draft.characters ?? []).map((character, index) => (
            <article key={`${character.name}-${index}`} className="group/char bg-white border border-border-subtle p-8 rounded-[2.5rem] shadow-premium hover:border-accent/30 transition duration-300 relative overflow-hidden">
              <div className="flex items-center justify-between gap-4 mb-8">
                <span className="text-[10px] font-bold px-3 py-1 bg-accent/5 text-accent rounded-full uppercase tracking-widest border border-accent/10">
                  {character.role}
                </span>
                <button 
                  className="p-1.5 opacity-0 group-hover/char:opacity-100 text-text-dim hover:text-red-500 hover:bg-red-50 rounded-full transition duration-500" 
                  disabled={(draft.characters ?? []).length <= 3} 
                  onClick={() => removeCharacter(index)}
                >
                  <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
              <div className="flex flex-col gap-6">
                <TextField 
                  className="text-2xl font-serif font-normal !px-0 !bg-transparent !border-none focus:!ring-0 placeholder:text-text-dim/10 italic" 
                  value={character.name} 
                  onChange={(value) => updateCharacter(index, { name: value })} 
                />
                <TextArea 
                  className="text-[13px] leading-relaxed text-text-secondary !bg-secondary/30 !border-none rounded-xl p-4 shadow-inner font-serif italic" 
                  value={character.personality} 
                  onChange={(value) => updateCharacter(index, { personality: value })} 
                  placeholder="该角色的核心特质…"
                />
                <div className="relative border-t border-border-subtle pt-4">
                   <div className="text-[8px] font-bold text-accent/40 uppercase tracking-[0.3em] mb-2">Voice Signature / 名言</div>
                   <TextField 
                    className="text-[11px] italic text-text-muted !bg-transparent !border-none !px-0 font-serif font-medium" 
                    value={character.catchphrase} 
                    onChange={(value) => updateCharacter(index, { catchphrase: value })} 
                    placeholder="角色标志性台词…"
                   />
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* World System */}
      <section className="bg-secondary border border-border-subtle p-10 md:p-14 rounded-[3rem] group relative shadow-inner">
        <FolioIndex index="03" label="世界系统协议 / WORLD PROTOCOL" />
        <div className="flex flex-col gap-10 mt-10">
          <TextArea 
            className="text-xl leading-relaxed text-text-primary !bg-white !border-none rounded-[2rem] p-8 shadow-premium font-serif italic" 
            value={draft.world?.setting_summary ?? ""} 
            onChange={(value) => updateWorld({ setting_summary: value })} 
            placeholder="描述这个世界的物理与超自然法则…"
          />
          <div className="grid gap-4 md:grid-cols-2">
             {(draft.world?.rules ?? []).map((rule, i) => (
                <div key={i} className="flex items-center gap-4 p-5 bg-white/80 backdrop-blur-sm border border-border-subtle rounded-[1.5rem] group/rule hover:border-accent/40 hover:-translate-y-0.5 transition duration-300 shadow-sm">
                  <span className="font-serif text-2xl text-accent/20 group-hover/rule:text-accent transition-colors duration-500 shrink-0">{String(i+1).padStart(2, '0')}</span>
                  <input 
                    className="flex-1 bg-transparent border-none p-0 text-[13px] font-bold text-text-secondary focus:ring-0" 
                    value={rule} 
                    onChange={(e) => {
                      const next = [...(draft.world?.rules ?? [])];
                      next[i] = e.target.value;
                      updateWorld({ rules: next });
                    }}
                  />
                </div>
             ))}
          </div>
        </div>
      </section>

      {/* Outline Section */}
      <section className="group relative">
        <header className="flex items-center justify-between mb-10">
           <FolioIndex index="04" label="叙事大纲矩阵 / THE MANUSCRIPT INDEX" />
           <button 
            className="btn-secondary !h-9 !px-5 text-[10px] font-bold rounded-full uppercase tracking-[0.2em] shadow-sm hover:border-accent" 
            disabled={(draft.outline?.volume_1?.chapters.length ?? 0) >= 24} 
            onClick={addChapter}
          >
            + 补充单元
          </button>
        </header>
        <div className="grid gap-6">
          {(draft.outline?.volume_1?.chapters ?? []).map((chapter, index) => (
            <div key={chapter.index} className="group/chapter p-8 bg-white border border-border-subtle rounded-[2.5rem] shadow-premium hover:border-accent/30 transition duration-300 relative overflow-hidden">
              <div className="flex items-center gap-8 mb-6">
                <span className="font-serif text-3xl text-accent/20 group-hover/chapter:text-accent transition-colors duration-500 shrink-0">
                  {String(chapter.index).padStart(2, '0')}
                </span>
                <input 
                  className="flex-1 bg-transparent border-none p-0 text-2xl font-serif font-normal text-text-primary focus:ring-0 placeholder:text-text-dim/10 italic" 
                  value={chapter.title} 
                  placeholder="单元标题"
                  onChange={(e) => updateChapter(index, { title: e.target.value })} 
                />
                <button 
                  className="p-1.5 opacity-0 group-hover/chapter:opacity-100 text-text-dim hover:text-red-500 hover:bg-red-50 rounded-full transition duration-500" 
                  disabled={(draft.outline?.volume_1?.chapters.length ?? 0) <= 8} 
                  onClick={() => removeChapter(index)}
                >
                   <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
              <TextArea 
                className="text-base text-text-secondary leading-relaxed italic !bg-secondary/30 !border-none rounded-xl p-6 shadow-inner ml-12 font-serif" 
                value={chapter.summary} 
                onChange={(value) => updateChapter(index, { summary: value })} 
                placeholder="该单元的叙事脉络…"
              />
            </div>
          ))}
        </div>
      </section>

      {/* Beats Section */}
      <section className="group relative">
        <header className="flex items-center justify-between mb-10">
           <FolioIndex index="05" label="开篇叙事脉络节拍 / THE BEATS" />
           <button 
            className="btn-secondary !h-9 !px-5 text-[10px] font-bold rounded-full uppercase tracking-[0.2em] shadow-sm hover:border-accent" 
            disabled={(draft.first_chapter_beats?.length ?? 0) >= 8} 
            onClick={addBeat}
          >
            + 补充节拍
          </button>
        </header>
        <div className="grid gap-6 md:grid-cols-2">
          {(draft.first_chapter_beats ?? []).map((beat, index) => (
            <div key={beat.beat} className="p-8 bg-white border border-border-subtle rounded-[2.5rem] shadow-premium group/beat relative hover:border-accent/30 transition duration-300 overflow-hidden">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-accent/5 group-hover/beat:bg-accent transition-colors duration-500" />
              <div className="flex items-center gap-4 mb-6 pl-2">
                <span className="font-serif text-2xl text-accent/20 group-hover/beat:text-accent transition-colors duration-500">节拍 {String(beat.beat).padStart(2, "0")}</span>
                <input 
                  className="flex-1 bg-transparent border-none p-0 text-lg font-serif font-normal text-text-primary focus:ring-0 placeholder:text-text-dim/10 italic" 
                  value={beat.scene} 
                  placeholder="场景名称"
                  onChange={(e) => updateBeat(index, { scene: e.target.value })} 
                />
                <button 
                  className="p-1.5 opacity-0 group-hover/beat:opacity-100 text-text-dim hover:text-red-500 hover:bg-red-50 rounded-full transition duration-500" 
                  disabled={(draft.first_chapter_beats?.length ?? 0) <= 5} 
                  onClick={() => removeBeat(index)}
                >
                  <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
              <TextArea 
                className="text-[14px] leading-relaxed text-text-secondary !bg-secondary/30 !border-none rounded-xl p-5 shadow-inner ml-2 font-serif italic" 
                value={beat.purpose} 
                onChange={(value) => updateBeat(index, { purpose: value })} 
                placeholder="该节拍的叙事意图…"
              />
            </div>
          ))}
        </div>
      </section>

      <details className="group border border-border-subtle rounded-[2rem] overflow-hidden shadow-sm transition duration-500">
        <summary className="cursor-pointer p-8 text-[10px] font-bold uppercase tracking-[0.2em] text-text-dim hover:text-text-primary transition-colors list-none flex justify-between items-center bg-secondary/30">
          <div className="flex items-center gap-4">
             <div className="w-1 h-1 rounded-full bg-text-dim" />
             <span>叙事原数据审计 (JSON)</span>
          </div>
          <svg aria-hidden="true" className="w-4 h-4 transition-transform duration-300 group-open:rotate-180 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <div className="border-t border-border-subtle bg-white p-8 max-h-[500px] overflow-auto custom-scrollbar">
           <pre className="text-[11px] text-text-secondary font-mono leading-relaxed bg-secondary/20 p-6 rounded-xl">
             {JSON.stringify(draft, null, 2)}
           </pre>
        </div>
      </details>
    </div>
  );
}

function FolioIndex({ index, label }: { index: string; label: string }) {
  return (
    <div className="flex items-center gap-4 group">
      <span className="font-serif text-3xl text-accent/40 group-hover:text-accent transition-colors duration-500">{index}</span>
      <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-text-muted">
        {label}
      </label>
    </div>
  );
}

function TextField({
  value,
  placeholder,
  className = "",
  onChange,
}: {
  value: string;
  placeholder?: string;
  className?: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      className={`input-base w-full ${className}`}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function TextArea({
  value,
  className = "",
  placeholder,
  onChange,
}: {
  value: string;
  className?: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <textarea
      className={`input-base w-full min-h-20 py-4 text-sm leading-relaxed ${className}`}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function FallbackNotice() {
  return (
    <div className="border-2 border-dashed border-border-strong p-24 text-center rounded-[2.5rem] bg-secondary/10 flex flex-col items-center gap-6">
      <div className="h-14 w-14 rounded-full bg-white flex items-center justify-center shadow-sm">
        <svg aria-hidden="true" className="w-7 h-7 text-text-dim opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H4a2 2 0 00-2 2v11a2 2 0 002 2h8.5M20 13l-4 4m4-4l-4-4m4 4H13" />
        </svg>
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-text-dim">未检测到本地草稿</p>
        <p className="text-lg font-serif italic text-text-dim/60 font-medium">系统将在提交时自动同步叙事云端协议。</p>
      </div>
    </div>
  );
}
