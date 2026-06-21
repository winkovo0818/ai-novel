"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useWizardStore } from "@/lib/store/wizardStore";
import { BibleDraftSchema, type BibleDraft } from "@/lib/validation/schemas";
import { getVolumes } from "@/lib/validation/domain";
import { StepShell } from "./StepShell";

export function Step5Review() {
  const router = useRouter();
  const store = useWizardStore();
  const validationIssues = getBibleValidationIssues(store.bible_draft);
  const [finalizingAction, setFinalizingAction] = useState<"save_only" | "start_writing" | null>(null);
  const [finalizedEditorUrl, setFinalizedEditorUrl] = useState<string | null>(null);
  const finalizeInFlightRef = useRef(false);
  const isFinalizing = finalizingAction !== null || store.status === "loading";

  async function finalize(action: "save_only" | "start_writing") {
    if (isFinalizing || finalizeInFlightRef.current) return;

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

    setFinalizedEditorUrl(null);
    finalizeInFlightRef.current = true;
    setFinalizingAction(action);
    store.setError(undefined);
    store.setStatus("loading");
    try {
      const response = await fetch(`/api/onboarding/sessions/${store.session_id}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bible_draft: validation,
          profile: store.default_profile,
          action,
        }),
      });
      const json = await response.json().catch(() => null);
      if (!json?.ok) {
        store.setError({
          step: 5,
          message: json?.error?.message ?? "作品确认失败，请稍后重试",
          retryable: json?.error?.retryable ?? true,
        });
        return;
      }

      store.setStatus("done");
      setFinalizedEditorUrl(json.data.editor_url);
      if (action === "start_writing") router.push(json.data.editor_url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "网络异常，请稍后重试";
      store.setError({ step: 5, message, retryable: true });
    } finally {
      finalizeInFlightRef.current = false;
      setFinalizingAction(null);
    }
  }

  function regenerate() {
    if (isFinalizing) return;

    if (store.regeneration_count >= 3) {
      store.setError({ step: 5, message: "重试次数已达上限", retryable: false });
      return;
    }

    store.setBibleDraft(undefined);
    store.setStep(4);
  }

  return (
    <StepShell eyebrow="Manuscript 03" title="核对作品设定" description="请最后检查生成后的设定和大纲。您可以直接修改不符合预期的细节，确认无误后即可开始写作。">
      <div className="grid gap-6">
        {store.bible_draft ? (
          <BibleReviewCards draft={store.bible_draft} onChange={store.setBibleDraft} />
        ) : (
          <FallbackNotice />
        )}
        
        {validationIssues.length > 0 && <ValidationPanel issues={validationIssues} />}
        {finalizedEditorUrl && store.status === "done" ? (
          <FinalizeSuccess editorUrl={finalizedEditorUrl} />
        ) : null}

        <footer className="flex flex-col gap-4 border-t border-border-subtle pt-5 lg:flex-row lg:items-center lg:justify-between">
          <button
            type="button"
            className="group inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border-subtle bg-white/75 px-4 text-[11px] font-black text-text-dim transition hover:border-red-200 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40 lg:justify-start"
            disabled={isFinalizing}
            onClick={regenerate}
          >
            <svg aria-hidden="true" className="h-4 w-4 transition-transform duration-300 group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            重新生成设定 ({store.regeneration_count}/3)
          </button>
          
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              className="h-11 rounded-lg border border-border-strong bg-white/75 px-5 text-[11px] font-black text-text-primary transition hover:bg-secondary active:scale-[0.98] disabled:opacity-30"
              disabled={isFinalizing} 
              onClick={() => finalize("save_only")}
            >
              {finalizingAction === "save_only" ? "正在暂存…" : "暂存草稿"}
            </button>
            <button
              type="button"
              className="group relative inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-text-primary px-6 text-[12px] font-black text-white shadow-[0_12px_34px_rgba(17,17,15,0.14)] transition hover:bg-accent active:scale-[0.98] disabled:opacity-30"
              disabled={isFinalizing} 
              onClick={() => finalize("start_writing")}
            >
              {finalizingAction === "start_writing" ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                  正在进入编辑器…
                </>
              ) : (
                <>
                  确认并开始写作
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

function FinalizeSuccess({ editorUrl }: { editorUrl: string }) {
  return (
    <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-5 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-800">作品已暂存</p>
          <p className="mt-2 text-sm leading-relaxed text-emerald-950/70">
            作品设定已保存，您可以稍后从书架继续，也可以现在进入编辑器开始写正文。
          </p>
        </div>
        <button
          type="button"
          className="h-11 shrink-0 rounded-lg bg-text-primary px-5 text-[11px] font-black text-white transition hover:bg-accent"
          onClick={() => window.location.assign(editorUrl)}
        >
          进入编辑器
        </button>
      </div>
    </div>
  );
}

function ValidationPanel({ issues }: { issues: string[] }) {
  return (
    <div className="animate-shake rounded-lg border border-red-100 bg-red-50/35 p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <span className="font-serif text-4xl leading-none text-red-200">!</span>
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-800">内容需要补充</p>
      </div>
      <ul className="ml-10 grid gap-2">
        {issues.map((issue, i) => (
          <li key={i} className="font-serif text-[13px] text-red-900/65">
            <span className="mr-2 font-sans text-[9px] font-bold text-red-300">待修正</span> {issue}
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

  function reindexAndApply(volumes: BibleDraft["outline"]["volumes"], updatedV1: BibleDraft["outline"]["volume_1"]) {
    let globalIdx = 0;
    const reindexedV1 = { ...updatedV1, chapters: updatedV1.chapters.map((c) => ({ ...c, index: ++globalIdx })) };
    const reindexedExtras = (volumes ?? []).map((v) => ({
      ...v,
      chapters: v.chapters.map((c) => ({ ...c, index: ++globalIdx })),
    }));
    return { reindexedV1, reindexedExtras };
  }

  function updateChapter(volumeIndex: number, chapterIndex: number, patch: Partial<BibleDraft["outline"]["volume_1"]["chapters"][number]>) {
    if (volumeIndex === 0) {
      const volume = draft.outline?.volume_1;
      if (!volume) return;
      const chapters = [...volume.chapters];
      const current = chapters[chapterIndex];
      if (!current) return;
      chapters[chapterIndex] = { ...current, ...patch };
      onChange({ ...draft, outline: { volume_1: { ...volume, chapters }, volumes: draft.outline?.volumes } });
    } else {
      const extras = draft.outline?.volumes ?? [];
      const vol = extras[volumeIndex - 1];
      if (!vol) return;
      const chapters = [...vol.chapters];
      const current = chapters[chapterIndex];
      if (!current) return;
      chapters[chapterIndex] = { ...current, ...patch };
      const next = [...extras];
      next[volumeIndex - 1] = { ...vol, chapters };
      onChange({ ...draft, outline: { volume_1: draft.outline!.volume_1, volumes: next } });
    }
  }

  function totalChapters(): number {
    const v1 = draft.outline?.volume_1?.chapters.length ?? 0;
    const extras = (draft.outline?.volumes ?? []).reduce((s, v) => s + v.chapters.length, 0);
    return v1 + extras;
  }

  function addChapter(volumeIndex: number) {
    if (!draft.outline) return;
    const volumes = getVolumes(draft as BibleDraft);
    const vol = volumes[volumeIndex];
    if (!vol || totalChapters() >= 1000) return;
    const maxLen = volumeIndex === 0 ? 80 : 200;
    if (vol.chapters.length >= maxLen) return;
    const nextChapters = [...vol.chapters, { index: 0, title: `新章节`, summary: "等待补充章节梗概…".repeat(4) }];
    const updatedVol = { ...vol, chapters: nextChapters, chapter_count_estimate: Math.max(vol.chapter_count_estimate, nextChapters.length) };
    const { reindexedV1, reindexedExtras } = reindexAndApply(draft.outline.volumes, volumeIndex === 0 ? updatedVol : draft.outline.volume_1);
    if (volumeIndex === 0) {
      onChange({ ...draft, outline: { volume_1: reindexedV1, volumes: reindexedExtras } });
    } else {
      const next = [...reindexedExtras];
      next[volumeIndex - 1] = { ...updatedVol, chapters: reindexedExtras[volumeIndex - 1].chapters };
      onChange({ ...draft, outline: { volume_1: reindexedV1, volumes: next } });
    }
  }

  function removeChapter(volumeIndex: number, chapterIndex: number) {
    if (!draft.outline) return;
    const volumes = getVolumes(draft as BibleDraft);
    const vol = volumes[volumeIndex];
    const minLen = volumeIndex === 0 ? 8 : 1;
    if (!vol || vol.chapters.length <= minLen) return;
    const nextChapters = vol.chapters.filter((_, i) => i !== chapterIndex);
    const updatedVol = { ...vol, chapters: nextChapters };
    const { reindexedV1, reindexedExtras } = reindexAndApply(draft.outline.volumes, volumeIndex === 0 ? updatedVol : draft.outline.volume_1);
    if (volumeIndex === 0) {
      onChange({ ...draft, outline: { volume_1: reindexedV1, volumes: reindexedExtras } });
    } else {
      const next = [...reindexedExtras];
      next[volumeIndex - 1] = { ...updatedVol, chapters: reindexedExtras[volumeIndex - 1].chapters };
      onChange({ ...draft, outline: { volume_1: reindexedV1, volumes: next } });
    }
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
          purpose: "本段要达成的效果…",
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

  const outlineVolumes = draft.outline ? getVolumes(draft as BibleDraft) : [];
  const hasMultipleVolumes = outlineVolumes.length > 1;
  const firstOutlineVolume = outlineVolumes[0];

  return (
    <div className="grid gap-7">
      {/* Meta Section */}
      <section className="group relative border-b border-border-strong bg-white pb-6">
        <FolioIndex index="01" label="作品基础信息" />
        <div className="mt-6 grid gap-5">
          <TextField
            className="font-serif text-3xl font-normal tracking-normal !border-none !bg-transparent !px-0 placeholder:text-text-dim/10 focus:!ring-0 md:text-4xl"
            value={draft.meta?.suggested_title ?? ""}
            placeholder="未命名的作品"
            onChange={(value) => updateMeta({
              suggested_title: value,
              alternative_titles: draft.meta?.alternative_titles ?? [],
            })}
          />
          <div className="flex flex-wrap gap-2">
            {(draft.meta?.alternative_titles ?? []).map((title, i) => (
              <span key={i} className="rounded-lg border border-border-subtle bg-secondary px-3 py-1 text-[12px] font-serif text-text-muted">
                <span className="mr-2 font-sans text-[8px] font-bold uppercase opacity-30">备选 {i + 1}</span>
                {title}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Characters Grid */}
      <section className="group relative">
        <header className="mb-4 flex items-center justify-between gap-3">
           <FolioIndex index="02" label="主要角色" />
           <button
            type="button"
            className="h-9 rounded-lg border border-border-strong bg-white px-4 text-[10px] font-black text-text-primary shadow-sm transition hover:border-accent disabled:opacity-35"
            disabled={(draft.characters ?? []).length >= 8} 
            onClick={addCharacter}
          >
            + 补充角色
          </button>
        </header>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(draft.characters ?? []).map((character, index) => (
            <article key={`${character.name}-${index}`} className="group/char relative overflow-hidden rounded-xl border border-border-subtle bg-white p-5 shadow-sm transition duration-300 hover:border-accent/30">
              <div className="mb-5 flex items-center justify-between gap-4">
                <span className="rounded-lg border border-accent/10 bg-accent/5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-accent">
                  {character.role}
                </span>
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-text-dim opacity-0 transition duration-300 hover:bg-red-50 hover:text-red-500 group-hover/char:opacity-100"
                  disabled={(draft.characters ?? []).length <= 3} 
                  onClick={() => removeCharacter(index)}
                >
                  <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
              <div className="flex flex-col gap-4">
                <TextField 
                  className="font-serif text-2xl font-normal tracking-normal !border-none !bg-transparent !px-0 placeholder:text-text-dim/10 focus:!ring-0"
                  value={character.name} 
                  onChange={(value) => updateCharacter(index, { name: value })} 
                />
                <TextArea 
                  className="rounded-lg !border-none !bg-secondary/35 p-4 font-serif text-[13px] leading-relaxed text-text-secondary shadow-inner"
                  value={character.personality} 
                  onChange={(value) => updateCharacter(index, { personality: value })} 
                  placeholder="该角色的主要特质…"
                />
                <div className="relative border-t border-border-subtle pt-4">
                   <div className="mb-2 text-[8px] font-bold uppercase tracking-[0.2em] text-accent/45">Voice Signature / 名言</div>
                   <TextField 
                    className="font-serif text-[11px] font-medium text-text-muted !border-none !bg-transparent !px-0"
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
      <section className="group relative rounded-xl border border-border-subtle bg-secondary/55 p-5 shadow-inner md:p-6">
        <FolioIndex index="03" label="世界设定" />
        <div className="mt-5 flex flex-col gap-5">
          <TextArea 
            className="rounded-lg !border-none !bg-white p-4 font-serif text-lg leading-relaxed text-text-primary shadow-sm"
            value={draft.world?.setting_summary ?? ""} 
            onChange={(value) => updateWorld({ setting_summary: value })} 
            placeholder="描述这个世界的物理与超自然法则…"
          />
          <div className="grid gap-3 md:grid-cols-2">
             {(draft.world?.rules ?? []).map((rule, i) => (
                <div key={i} className="group/rule flex items-center gap-3 rounded-lg border border-border-subtle bg-white/80 p-4 shadow-sm transition duration-300 hover:border-accent/40">
                  <span className="shrink-0 font-serif text-2xl tracking-normal text-accent/25 transition-colors duration-300 group-hover/rule:text-accent">{String(i + 1).padStart(2, "0")}</span>
                  <input 
                    className="min-w-0 flex-1 border-none bg-transparent p-0 text-[13px] font-bold text-text-secondary focus:ring-0"
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
        <header className="mb-4 flex items-center justify-between gap-3">
           <FolioIndex index="04" label={`章节大纲 / 共 ${totalChapters()} 章`} />
           {!hasMultipleVolumes && firstOutlineVolume ? (
              <button
                type="button"
                className="h-9 rounded-lg border border-border-strong bg-white px-4 text-[10px] font-black text-text-primary shadow-sm transition hover:border-accent"
                disabled={firstOutlineVolume.chapters.length >= 80 || totalChapters() >= 1000}
                onClick={() => addChapter(0)}
              >
                + 补充章节
              </button>
            ) : null}
        </header>
        <div className="grid gap-6">
          {outlineVolumes.map((volume, volumeIndex) => (
            <div key={volumeIndex} className="grid gap-4">
              {hasMultipleVolumes ? (
                <div className="flex flex-col gap-3 px-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent/65">
                    {volume.name} · {volume.theme} · {volume.chapters.length} 章
                  </span>
                  <button
                    type="button"
                    className="h-8 rounded-lg border border-border-strong bg-white px-3 text-[9px] font-black text-text-primary shadow-sm transition hover:border-accent disabled:opacity-35"
                    disabled={volume.chapters.length >= (volumeIndex === 0 ? 80 : 200) || totalChapters() >= 1000}
                    onClick={() => addChapter(volumeIndex)}
                  >
                    + 补充章节
                  </button>
                </div>
              ) : null}
              {volume.chapters.map((chapter, chapterIndex) => (
                <div key={chapter.index} className="group/chapter relative overflow-hidden rounded-xl border border-border-subtle bg-white p-5 shadow-sm transition duration-300 hover:border-accent/30">
                  <div className="mb-4 flex items-center gap-4">
                    <span className="shrink-0 font-serif text-3xl tracking-normal text-accent/25 transition-colors duration-300 group-hover/chapter:text-accent">
                      {String(chapter.index).padStart(2, "0")}
                    </span>
                    <input
                      className="min-w-0 flex-1 border-none bg-transparent p-0 font-serif text-2xl font-normal tracking-normal text-text-primary placeholder:text-text-dim/10 focus:ring-0"
                      value={chapter.title}
                      placeholder="章节标题"
                      onChange={(e) => updateChapter(volumeIndex, chapterIndex, { title: e.target.value })}
                    />
                    <button
                      type="button"
                      className="rounded-lg p-1.5 text-text-dim opacity-0 transition duration-300 hover:bg-red-50 hover:text-red-500 group-hover/chapter:opacity-100"
                      disabled={volume.chapters.length <= (volumeIndex === 0 ? 8 : 1)}
                      onClick={() => removeChapter(volumeIndex, chapterIndex)}
                    >
                       <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                  <TextArea
                    className="rounded-lg !border-none !bg-secondary/35 p-4 font-serif text-base leading-relaxed text-text-secondary shadow-inner sm:ml-12"
                    value={chapter.summary}
                    onChange={(value) => updateChapter(volumeIndex, chapterIndex, { summary: value })}
                    placeholder="该章节的剧情梗概…"
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* Beats Section */}
      <section className="group relative">
        <header className="mb-4 flex items-center justify-between gap-3">
           <FolioIndex index="05" label="首章节拍" />
           <button
            type="button"
            className="h-9 rounded-lg border border-border-strong bg-white px-4 text-[10px] font-black text-text-primary shadow-sm transition hover:border-accent disabled:opacity-35"
            disabled={(draft.first_chapter_beats?.length ?? 0) >= 8} 
            onClick={addBeat}
          >
            + 补充节拍
          </button>
        </header>
        <div className="grid gap-4 md:grid-cols-2">
          {(draft.first_chapter_beats ?? []).map((beat, index) => (
            <div key={beat.beat} className="group/beat relative overflow-hidden rounded-xl border border-border-subtle bg-white p-5 shadow-sm transition duration-300 hover:border-accent/30">
              <div className="absolute left-0 top-0 h-full w-1 bg-accent/10 transition-colors duration-300 group-hover/beat:bg-accent" />
              <div className="mb-4 flex items-center gap-3 pl-2">
                <span className="shrink-0 font-serif text-xl tracking-normal text-accent/35 transition-colors duration-300 group-hover/beat:text-accent">节拍 {String(beat.beat).padStart(2, "0")}</span>
                <input
                  className="min-w-0 flex-1 border-none bg-transparent p-0 font-serif text-lg font-normal tracking-normal text-text-primary placeholder:text-text-dim/10 focus:ring-0"
                  value={beat.scene} 
                  placeholder="场景名称"
                  onChange={(e) => updateBeat(index, { scene: e.target.value })} 
                />
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-text-dim opacity-0 transition duration-300 hover:bg-red-50 hover:text-red-500 group-hover/beat:opacity-100"
                  disabled={(draft.first_chapter_beats?.length ?? 0) <= 5} 
                  onClick={() => removeBeat(index)}
                >
                  <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
              <TextArea 
                className="ml-2 rounded-lg !border-none !bg-secondary/35 p-4 font-serif text-[14px] leading-relaxed text-text-secondary shadow-inner"
                value={beat.purpose} 
                onChange={(value) => updateBeat(index, { purpose: value })} 
                placeholder="该节拍的写作目的…"
              />
            </div>
          ))}
        </div>
      </section>

      <details className="group overflow-hidden rounded-xl border border-border-subtle shadow-sm transition duration-300">
        <summary className="flex cursor-pointer list-none items-center justify-between bg-secondary/35 p-4 text-[10px] font-black uppercase tracking-[0.18em] text-text-dim transition-colors hover:text-text-primary">
          <div className="flex items-center gap-4">
             <div className="h-1.5 w-1.5 rounded-full bg-text-dim" />
             <span>原始设定数据 (JSON)</span>
          </div>
          <svg aria-hidden="true" className="w-4 h-4 transition-transform duration-300 group-open:rotate-180 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <div className="custom-scrollbar max-h-[500px] overflow-auto border-t border-border-subtle bg-white p-4">
           <pre className="rounded-lg bg-secondary/20 p-4 font-mono text-[11px] leading-relaxed text-text-secondary">
             {JSON.stringify(draft, null, 2)}
           </pre>
        </div>
      </details>
    </div>
  );
}

function FolioIndex({ index, label }: { index: string; label: string }) {
  return (
    <div className="group flex items-center gap-3">
      <span className="font-serif text-2xl tracking-normal text-accent/45 transition-colors duration-300 group-hover:text-accent">{index}</span>
      <label className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      className={`input-base min-h-[80px] w-full resize-none overflow-hidden py-4 text-sm leading-relaxed ${className}`}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function FallbackNotice() {
  return (
    <div className="flex flex-col items-center gap-5 rounded-xl border border-dashed border-border-strong bg-secondary/20 p-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white shadow-sm">
        <svg aria-hidden="true" className="h-6 w-6 text-text-dim opacity-45" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H4a2 2 0 00-2 2v11a2 2 0 002 2h8.5M20 13l-4 4m4-4l-4-4m4 4H13" />
        </svg>
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-text-dim">还没有生成设定</p>
        <p className="font-serif text-lg font-medium tracking-normal text-text-dim/60">请返回上一步生成作品设定，或稍后再试。</p>
      </div>
    </div>
  );
}
