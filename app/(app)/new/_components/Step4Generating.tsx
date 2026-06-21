"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { useWizardStore } from "@/lib/store/wizardStore";
import type { BibleDraft } from "@/lib/validation/schemas";
import { readSse, type StreamEvent } from "@/lib/stream/readSse";
import { StepShell } from "./StepShell";

export function Step4Generating() {
  const store = useWizardStore();
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [recovered, setRecovered] = useState(false);
  const phase = getStreamPhase(store.bible_draft, store.status);

  // Detect stale streaming state on mount (e.g. after page refresh).
  // If status is "streaming" but no active SSE connection exists,
  // reset to "idle" so the user can retry.
  useEffect(() => {
    if (store.status === "streaming") {
      store.setStatus("idle");
      setRecovered(true);
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    if (store.regeneration_count >= 3) {
      store.setError({ step: 4, message: "重试次数已达上限。请先使用当前内容，或稍后再试。", retryable: false });
      return;
    }

    if (!store.session_id || !store.default_profile || !store.inputs.logline) {
      store.setError({ step: 4, message: "缺少必要信息，无法开始生成。", retryable: false });
      return;
    }

    store.setStatus("streaming");
    store.setError(undefined);
    setEvents([]);

    try {
      const response = await fetch(`/api/onboarding/sessions/${store.session_id}/bible`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logline: store.inputs.logline,
          answers: store.inputs.answers ?? {},
          profile: store.default_profile,
          total_chapters: store.inputs.chapters ?? 40,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`合成流连接失败: HTTP ${response.status}`);
      }

      await readSse(response.body, (event) => {
        if (event.event === "error") {
          const data = event.data as { message?: string; retryable?: boolean; regeneration_count?: number };
          if (typeof data.regeneration_count === "number") {
            store.setRegenerationCount(data.regeneration_count);
          }
          store.setError({ step: 4, message: data.message ?? "生成阶段遇到问题", retryable: data.retryable ?? true });
          return;
        }

        setEvents((current) => [...current, event]);
        const nextDraft = mergeBibleEvent(useWizardStore.getState().bible_draft, event);
        if (nextDraft) store.setBibleDraft(nextDraft);

        if (event.event === "done") {
          const data = event.data as { regeneration_count?: number };
          store.setRegenerationCount(
            typeof data.regeneration_count === "number"
              ? data.regeneration_count
              : store.regeneration_count + 1,
          );
          store.setStatus("done");
          store.setStep(5);
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "发生未知故障";
      store.setError({ step: 4, message, retryable: true });
    }
  }

  return (
    <StepShell eyebrow="Manuscript 02" title="生成设定和大纲" description="AI 正在根据您的灵感、题材和回答，生成一份可编辑的作品设定。">
      <div className="grid gap-6">
        {/* Stale-streaming recovery banner */}
        {recovered && (
          <div className="flex flex-col gap-3 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-[13px] text-amber-800 sm:flex-row sm:items-center">
            <svg aria-hidden="true" className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span>上次合成中途中断。您可以重新启动合成，或直接查看已生成的部分内容。</span>
            {store.bible_draft && (
              <button
                type="button"
                className="shrink-0 rounded-lg bg-amber-700 px-4 py-2 text-[11px] font-black text-white transition hover:bg-amber-800 sm:ml-auto"
                onClick={() => { store.setStatus("done"); store.setStep(5); }}
              >
                查看已有内容
              </button>
            )}
          </div>
        )}

        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border-subtle pb-5">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={`inline-flex h-12 items-center gap-2 rounded-lg px-5 text-[12px] font-black shadow-[0_12px_34px_rgba(17,17,15,0.12)] transition active:scale-[0.98] ${
                store.status === "streaming" 
                ? "cursor-default bg-secondary text-text-dim shadow-none"
                : "bg-text-primary text-white hover:bg-accent"
              }`}
              disabled={store.status === "streaming"} 
              onClick={start}
            >
              {store.status === "streaming" ? (
                <>
                  <div className="relative w-5 h-5">
                    <div className="absolute inset-0 animate-spin rounded-full border-2 border-accent/20 border-t-accent" />
                  </div>
                  <span>正在生成中…</span>
                </>
              ) : (
                <>
                  <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  开始生成
                </>
              )}
            </button>
            
            <div className="rounded-lg border border-border-subtle bg-secondary/45 px-3 py-2">
              <span className="block text-[9px] font-black uppercase tracking-[0.18em] text-text-dim">已生成次数</span>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                <span className="font-serif text-lg leading-none tracking-normal text-text-primary">{store.regeneration_count}/3</span>
              </div>
            </div>
          </div>
          
          <button 
            type="button"
            className="group inline-flex h-10 items-center gap-2 rounded-lg border border-border-subtle bg-white/70 px-3 text-[11px] font-black text-text-muted transition hover:border-text-primary hover:text-text-primary"
            onClick={() => store.setStep(1)}
          >
            <svg aria-hidden="true" className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
            调整方向
          </button>
        </header>

        {/* Progress Visualization */}
        <div className="group relative overflow-hidden rounded-xl border border-border-subtle bg-secondary/45 p-5">
          <div className="relative z-10 mb-4 flex items-center justify-between gap-6">
            <div className="flex flex-col gap-1">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-accent">生成进度</p>
              <h4 className="font-serif text-2xl font-normal tracking-normal text-text-primary">{phase.label}</h4>
            </div>
            <div className="text-right">
              <span className="font-serif text-4xl font-normal tracking-normal text-text-primary/15 transition-colors duration-500 group-hover:text-accent/25">{phase.percent}%</span>
            </div>
          </div>
          
          <progress
            aria-label="生成进度"
            className="wizard-generation-progress relative z-10"
            value={phase.percent}
            max={100}
          />
        </div>

        {/* Dynamic Cards */}
        <BibleStreamCards draft={store.bible_draft} eventsCount={events.length} />

        {/* Console / Journal */}
        <details className="group overflow-hidden rounded-xl border border-border-subtle bg-white shadow-sm transition duration-300">
          <summary className="flex cursor-pointer list-none items-center justify-between bg-secondary/35 p-4 text-[10px] font-black uppercase tracking-[0.18em] text-text-dim transition-colors hover:text-text-primary">
            <div className="flex items-center gap-3">
              <div className="h-1.5 w-1.5 rounded-full bg-accent" />
              <span>生成日志 ({events.length} 条记录)</span>
            </div>
            <svg aria-hidden="true" className="w-4 h-4 transition-transform duration-300 group-open:rotate-180 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <div className="custom-scrollbar max-h-[400px] space-y-3 overflow-auto border-t border-border-subtle bg-white p-4 font-mono text-[11px]">
            {events.length === 0 && (
              <p className="font-serif text-base text-text-dim/60">等待第一段内容生成…</p>
            )}
            {events.map((item, index) => (
              <article key={`${item.event}-${index}`} className="group/entry relative border-l border-border-strong pl-5 transition-colors duration-300 hover:border-accent">
                <div className="absolute left-[-4.5px] top-1 h-2 w-2 rounded-full bg-border-strong transition duration-300 group-hover/entry:bg-accent" />
                <div className="mb-2 flex items-center gap-3">
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-accent">{item.event}</span>
                  <span className="font-sans text-[9px] text-text-dim">{new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                </div>
                <pre className="whitespace-pre-wrap rounded-lg border border-transparent bg-secondary/30 p-3 leading-relaxed text-text-secondary transition duration-300 group-hover/entry:border-border-subtle">
                  {JSON.stringify(item.data, null, 2)}
                </pre>
              </article>
            ))}
          </div>
        </details>
      </div>
    </StepShell>
  );
}

function getStreamPhase(draft: Partial<BibleDraft> | undefined, status: string) {
  if (status === "done") return { label: "设定已生成，正在进入核对步骤…", percent: 100 };
  if (!draft?.meta) return { label: "准备作品标题和基础信息…", percent: 8 };
  if (!draft.characters?.length) return { label: "正在生成主要角色…", percent: 22 };
  if (!draft.world) return { label: "正在生成世界观和规则…", percent: 42 };
  if (!draft.outline?.volume_1?.chapters?.length) return { label: "正在生成章节大纲…", percent: 62 };
  if (!draft.first_chapter_beats?.length) return { label: "正在生成首章节拍…", percent: 82 };
  return { label: "正在检查内容完整性…", percent: 95 };
}

function BibleStreamCards({ draft, eventsCount }: { draft?: Partial<BibleDraft>; eventsCount: number }) {
  if (!draft || eventsCount === 0) {
    return (
      <div className="flex flex-col items-center gap-5 rounded-xl border border-dashed border-border-strong bg-secondary/20 p-10 text-center">
        <div className="flex gap-3">
          <div className="h-2 w-2 animate-pulse rounded-full bg-accent/20" />
          <div className="h-2 w-2 animate-pulse rounded-full bg-accent/40 [animation-delay:200ms]" />
          <div className="h-2 w-2 animate-pulse rounded-full bg-accent/60 [animation-delay:400ms]" />
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-text-dim">准备生成内容</p>
          <p className="font-serif text-lg tracking-normal text-text-dim/60">等待第一段内容生成…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid animate-fade-in gap-6">
      {draft.meta ? (
        <StreamCard label="基础设定" title={draft.meta.suggested_title} folio="01">
          <div className="mt-4 flex flex-wrap gap-2">
             {draft.meta.alternative_titles.map((title, i) => (
               <div key={i} className="rounded-lg border border-border-subtle bg-secondary px-3 py-1 text-[12px] font-serif text-text-secondary">
                 <span className="mr-2 font-sans text-[8px] font-bold uppercase opacity-30">备选 {i + 1}</span>
                 {title}
               </div>
             ))}
          </div>
        </StreamCard>
      ) : null}

      {draft.characters?.length ? (
        <div className="grid gap-4">
          <FolioLabel index="02" label="主要角色" />
          <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {draft.characters.map((character, index) => (
              <StreamCard key={`${character.name}-${index}`} label={character.role} title={character.name} minimalist>
                <p className="my-3 line-clamp-3 border-l-2 border-accent/10 pl-4 font-serif text-[13px] leading-relaxed text-text-secondary">
                  {character.personality}
                </p>
                <div className="text-[11px] font-bold uppercase tracking-widest text-accent opacity-60">
                   &ldquo;{character.catchphrase}&rdquo;
                </div>
              </StreamCard>
            ))}
          </section>
        </div>
      ) : null}

      {draft.world ? (
        <StreamCard label="世界观" title="世界设定" folio="03">
          <p className="mb-4 max-w-3xl font-serif text-base leading-relaxed text-text-secondary">{draft.world.setting_summary}</p>
          <div className="flex flex-wrap gap-2">
            {draft.world.rules.map((rule) => (
              <span key={rule} className="rounded-lg border border-border-strong bg-white px-3 py-1 text-[10px] font-bold text-text-primary shadow-sm transition-colors duration-300 hover:border-accent">
                {rule}
              </span>
            ))}
          </div>
        </StreamCard>
      ) : null}

      {draft.outline?.volume_1?.chapters?.length ? (
        <div className="grid gap-4">
          <FolioLabel index="04" label="章节大纲" />
          <StreamCard label="章节大纲" title={`${draft.outline.volume_1.chapters.length} 章剧情推进`} minimalist>
            <div className="mt-4 grid gap-2">
              {draft.outline.volume_1.chapters.map((chapter) => (
                <div key={chapter.index} className="group/chapter flex items-start gap-4 rounded-lg p-4 transition duration-300 hover:bg-secondary/55">
                  <span className="shrink-0 font-serif text-2xl tracking-normal text-accent/25 transition-colors duration-300 group-hover/chapter:text-accent">
                    {String(chapter.index).padStart(2, "0")}
                  </span>
                  <div className="flex flex-col gap-1">
                    <h5 className="font-serif text-lg font-normal tracking-normal text-text-primary">{chapter.title}</h5>
                    <p className="max-w-2xl text-[13px] leading-relaxed text-text-muted">{chapter.summary}</p>
                  </div>
                </div>
              ))}
            </div>
          </StreamCard>
        </div>
      ) : null}
    </div>
  );
}

function FolioLabel({ index, label }: { index: string; label: string }) {
  return (
    <div className="group flex items-center gap-3 px-2">
      <span className="font-serif text-2xl tracking-normal text-accent/45 transition-colors duration-300 group-hover:text-accent">{index}</span>
      <label className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">
        {label}
      </label>
    </div>
  );
}

function StreamCard({
  label,
  title,
  folio,
  children,
  minimalist = false,
}: {
  label: string;
  title: string;
  folio?: string;
  children: ReactNode;
  minimalist?: boolean;
}) {
  if (minimalist) {
    return (
      <article className="group animate-fade-in-up rounded-xl border border-border-subtle bg-white p-5 shadow-sm transition duration-300 hover:border-accent/30">
        <p className="mb-2 flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.18em] text-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          {label}
        </p>
        <h3 className="font-serif text-xl font-normal tracking-normal text-text-primary">{title}</h3>
        {children}
      </article>
    );
  }

  return (
    <article className="group relative animate-fade-in-up overflow-hidden rounded-xl border border-border-subtle bg-white p-5 shadow-sm transition duration-300 hover:border-accent/30 md:p-6">
      {folio && (
        <div className="pointer-events-none absolute right-5 top-5 select-none font-serif text-[48px] leading-none tracking-normal text-text-primary/[0.045] transition-colors duration-300 group-hover:text-accent/10">
          {folio}
        </div>
      )}
      <p className="mb-3 flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.18em] text-accent">
        <span className="h-px w-6 bg-accent/30" />
        {label}
      </p>
      <h3 className="mb-5 font-serif text-2xl font-normal tracking-normal text-text-primary md:text-3xl">{title}</h3>
      <div className="relative z-10">{children}</div>
    </article>
  );
}

function mergeBibleEvent(draft: Partial<BibleDraft> | undefined, item: StreamEvent): Partial<BibleDraft> | undefined {
  if (item.event === "done" || item.event === "error") return draft;
  const next: Partial<BibleDraft> = { ...(draft ?? {}) };

  if (item.event === "meta") next.meta = item.data as BibleDraft["meta"];
  if (item.event === "world") next.world = item.data as BibleDraft["world"];
  if (item.event === "character") next.characters = upsertEventIndexed(next.characters, item.data);
  if (item.event === "outline_chapter") {
    const chapter = item.data as BibleDraft["outline"]["volume_1"]["chapters"][number];
    next.outline = {
      volume_1: {
        ...(next.outline?.volume_1 ?? {
          name: "开篇卷",
          theme: "首卷成长与主要冲突",
          chapter_count_estimate: 8,
        }),
        chapters: upsertAt(
          next.outline?.volume_1?.chapters,
          Math.max(0, chapter.index - 1),
          chapter,
        ),
      },
    };
  }
  if (item.event === "first_chapter_beat") {
    const { index, ...beat } = item.data as BibleDraft["first_chapter_beats"][number] & { index: number };
    next.first_chapter_beats = upsertAt(next.first_chapter_beats, index, beat);
  }

  return next;
}

function upsertEventIndexed<T>(current: T[] | undefined, raw: unknown): T[] {
  const { index, ...value } = raw as T & { index: number };
  return upsertAt(current, index, value as T);
}

function upsertAt<T>(current: T[] | undefined, index: number, value: T): T[] {
  const next = [...(current ?? [])];
  next[index] = value;
  return next.filter(Boolean);
}
