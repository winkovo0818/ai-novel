"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { useWizardStore } from "@/lib/store/wizardStore";
import { BibleDraftSchema, type BibleDraft } from "@/lib/validation/schemas";
import { StepShell } from "./StepShell";

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
    <StepShell eyebrow="STEP 05" title="圣经核对" description="请最后审计合成后的叙事圣经。确认无误后，即可初始化您的创作工作台。">
      <div className="grid gap-32">
        {store.bible_draft ? (
          <BibleReviewCards draft={store.bible_draft} onChange={store.setBibleDraft} />
        ) : (
          <FallbackNotice />
        )}
        
        {validationIssues.length > 0 && <ValidationPanel issues={validationIssues} />}

        <div className="flex flex-wrap items-center justify-between gap-16 pt-32 border-t border-border-subtle">
          <div className="flex gap-12">
            <button className="btn-secondary h-48" onClick={regenerate}>
              <span className="flex items-center gap-8">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                重新生成圣经 ({store.regeneration_count}/3)
              </span>
            </button>
          </div>
          
          <div className="flex gap-12">
            <button 
              className="btn-secondary h-48 px-32" 
              disabled={store.status === "loading"} 
              onClick={() => finalize("save_only")}
            >
              仅保存草稿
            </button>
            <button 
              className="btn-primary h-48 px-32" 
              disabled={store.status === "loading"} 
              onClick={() => finalize("start_writing")}
            >
              <span className="flex items-center gap-8">
                开始创作正文
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </span>
            </button>
          </div>
        </div>
      </div>
    </StepShell>
  );
}

function ValidationPanel({ issues }: { issues: string[] }) {
  return (
    <div className="border border-amber-200 bg-amber-50 p-24 rounded-md">
      <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700 mb-8 flex items-center gap-8">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        检测到叙事一致性冲突:
      </p>
      <ul className="flex flex-col gap-4">
        {issues.map((issue) => (
          <li key={issue} className="text-xs text-amber-600 font-medium">
            • {issue}
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
    if (characters.length >= 5) return;
    onChange({
      ...draft,
      characters: [
        ...characters,
        {
          role: "hidden",
          name: "新角色",
          age: "未知",
          appearance: "待描述",
          personality: "待补充",
          catchphrase: "待输入",
          abilities: ["待设定"],
          goals: "待补充",
          motivation: "待补充",
          secrets: ["待揭秘"],
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
    if (!volume || volume.chapters.length >= 12) return;
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
              title: `新章节 ${String(nextIndex).padStart(2, "0")}`,
              summary: "待编写章节梗概...",
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
          purpose: "待输入目标",
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
    <div className="grid gap-32">
      {/* Meta Section */}
      <section className="bg-surface border border-border-strong p-24 rounded-md shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-16">核心元数据</p>
        <div className="grid gap-16">
          <TextField
            className="text-2xl font-bold !bg-transparent !border-none !px-0 focus:!ring-0"
            value={draft.meta?.suggested_title ?? ""}
            placeholder="作品标题"
            onChange={(value) => updateMeta({
              suggested_title: value,
              alternative_titles: draft.meta?.alternative_titles ?? ["备选标题 1", "备选标题 2", "备选标题 3"],
            })}
          />
          <div className="flex flex-wrap gap-8">
            {(draft.meta?.alternative_titles ?? []).map((title, i) => (
              <span key={i} className="px-12 py-4 bg-secondary/50 rounded-full text-xs text-text-secondary border border-border-subtle">
                {title}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Characters Grid */}
      <section>
        <div className="flex items-center justify-between mb-16">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">叙事角色阵列</p>
          <button 
            className="btn-secondary !px-12 !py-6 text-[10px]" 
            disabled={(draft.characters ?? []).length >= 5} 
            onClick={addCharacter}
          >
            + 添加角色
          </button>
        </div>
        <div className="grid gap-16 md:grid-cols-3">
          {(draft.characters ?? []).map((character, index) => (
            <article key={`${character.name}-${index}`} className="bg-surface border border-border-strong p-20 rounded-md shadow-sm group">
              <div className="flex items-center justify-between gap-12 mb-12">
                <span className="text-[9px] font-bold px-8 py-2 bg-primary/5 text-primary rounded-full uppercase tracking-wider">
                  {character.role}
                </span>
                <button 
                  className="opacity-0 group-hover:opacity-100 text-text-dim hover:text-red-500 transition-all" 
                  disabled={(draft.characters ?? []).length <= 3} 
                  onClick={() => removeCharacter(index)}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
              <div className="flex flex-col gap-12">
                <TextField className="text-base font-bold !px-0 !bg-transparent !border-b !border-transparent hover:!border-border-subtle focus:!border-primary rounded-none" value={character.name} onChange={(value) => updateCharacter(index, { name: value })} />
                <TextArea value={character.personality} onChange={(value) => updateCharacter(index, { personality: value })} />
                <TextArea className="text-xs italic text-text-muted" value={character.catchphrase} onChange={(value) => updateCharacter(index, { catchphrase: value })} />
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* World System */}
      <section className="bg-surface border border-border-strong p-24 rounded-md shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-16">世界系统协议</p>
        <div className="flex flex-col gap-16">
          <TextArea className="text-sm leading-relaxed" value={draft.world?.setting_summary ?? ""} onChange={(value) => updateWorld({ setting_summary: value })} />
          <div className="grid gap-12 md:grid-cols-2">
             {(draft.world?.rules ?? []).map((rule, i) => (
                <div key={i} className="flex items-center gap-8 p-12 bg-background border border-border-subtle rounded-sm">
                  <span className="text-[10px] font-mono text-primary font-bold">{String(i+1).padStart(2, '0')}</span>
                  <input 
                    className="flex-1 bg-transparent border-none p-0 text-xs focus:ring-0" 
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
      <section>
        <div className="flex items-center justify-between mb-16">
          <div className="flex flex-col">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-4">叙事大纲 / 首卷</p>
            <h4 className="text-lg font-bold text-text-primary">{draft.outline?.volume_1?.name ?? "未命名卷"}</h4>
          </div>
          <button 
            className="btn-secondary !px-12 !py-6 text-[10px]" 
            disabled={(draft.outline?.volume_1?.chapters.length ?? 0) >= 12} 
            onClick={addChapter}
          >
            + 添加章节
          </button>
        </div>
        <div className="grid gap-12">
          {(draft.outline?.volume_1?.chapters ?? []).map((chapter, index) => (
            <div key={chapter.index} className="p-20 bg-surface border border-border-strong rounded-md shadow-sm group">
              <div className="flex items-center gap-16 mb-12">
                <span className="text-[10px] font-bold text-primary px-8 py-2 bg-primary/5 rounded-full uppercase tracking-widest">
                  UNIT {String(chapter.index).padStart(2, "0")}
                </span>
                <input 
                  className="flex-1 bg-transparent border-none p-0 text-base font-bold focus:ring-0" 
                  value={chapter.title} 
                  onChange={(e) => updateChapter(index, { title: e.target.value })} 
                />
                <button 
                  className="opacity-0 group-hover:opacity-100 text-text-dim hover:text-red-500 transition-all" 
                  disabled={(draft.outline?.volume_1?.chapters.length ?? 0) <= 8} 
                  onClick={() => removeChapter(index)}
                >
                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
              <TextArea className="text-xs text-text-secondary leading-relaxed italic" value={chapter.summary} onChange={(value) => updateChapter(index, { summary: value })} />
            </div>
          ))}
        </div>
      </section>

      {/* Beats Section */}
      <section>
        <div className="flex items-center justify-between mb-16">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">首章叙事脉络节拍</p>
          <button 
            className="btn-secondary !px-12 !py-6 text-[10px]" 
            disabled={(draft.first_chapter_beats?.length ?? 0) >= 8} 
            onClick={addBeat}
          >
            + 添加节拍
          </button>
        </div>
        <div className="grid gap-12 md:grid-cols-2">
          {(draft.first_chapter_beats ?? []).map((beat, index) => (
            <div key={beat.beat} className="p-16 bg-surface border border-border-strong rounded-md shadow-sm group">
              <div className="flex items-center gap-12 mb-8">
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">BEAT {String(beat.beat).padStart(2, "0")}</span>
                <input 
                  className="flex-1 bg-transparent border-none p-0 text-sm font-bold focus:ring-0" 
                  value={beat.scene} 
                  onChange={(e) => updateBeat(index, { scene: e.target.value })} 
                />
                <button 
                  className="opacity-0 group-hover:opacity-100 text-text-dim hover:text-red-500 transition-all" 
                  disabled={(draft.first_chapter_beats?.length ?? 0) <= 5} 
                  onClick={() => removeBeat(index)}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
              <TextArea className="text-xs leading-relaxed" value={beat.purpose} onChange={(value) => updateBeat(index, { purpose: value })} />
            </div>
          ))}
        </div>
      </section>

      <details className="group border border-border-subtle rounded-md overflow-hidden">
        <summary className="cursor-pointer p-16 text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted hover:bg-secondary transition-colors list-none flex justify-between items-center bg-secondary/10">
          <span>原始数据审计 (JSON)</span>
          <span className="group-open:rotate-180 transition-transform">↓</span>
        </summary>
        <pre className="border-t border-border-subtle bg-background p-16 max-h-96 overflow-auto text-[10px] text-text-secondary font-mono">
          {JSON.stringify(draft, null, 2)}
        </pre>
      </details>
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
  onChange,
}: {
  value: string;
  className?: string;
  onChange: (value: string) => void;
}) {
  return (
    <textarea
      className={`input-base w-full min-h-24 py-8 text-xs leading-relaxed ${className}`}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function FallbackNotice() {
  return (
    <div className="border-2 border-dashed border-border-strong p-48 text-center rounded-md bg-surface/50">
      <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
        未检测到本地草稿。系统将在提交时同步服务器状态。
      </p>
    </div>
  );
}
