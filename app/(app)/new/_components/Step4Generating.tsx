"use client";

import { useState } from "react";
import type { ReactNode } from "react";

import { useWizardStore } from "@/lib/store/wizardStore";
import type { BibleDraft } from "@/lib/validation/schemas";
import { readSse, type StreamEvent } from "@/lib/stream/readSse";
import { StepShell } from "./StepShell";

export function Step4Generating() {
  const store = useWizardStore();
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const phase = getStreamPhase(store.bible_draft, store.status);

  async function start() {
    if (store.regeneration_count >= 3) {
      store.setError({ step: 4, message: "重试次数已达上限。请继续执行当前协议或联系管理员。", retryable: false });
      return;
    }

    if (!store.session_id || !store.default_profile || !store.inputs.logline) {
      store.setError({ step: 4, message: "协议参数不完整，无法启动合成过程。", retryable: false });
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
          store.setError({ step: 4, message: data.message ?? "合成阶段故障", retryable: data.retryable ?? true });
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
    <StepShell eyebrow="分册 04" title="圣经合成中" description="AI 正在根据您的灵感、题材与决策维度，实时合成完整的叙事基础设施。">
      <div className="grid gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              className={`h-10 px-5 rounded-full font-bold shadow-sm transition-[background-color,box-shadow,transform] duration-200 flex items-center gap-2 text-[13px] active:scale-95 ${
                store.status === "streaming"
                  ? "bg-secondary text-text-dim cursor-default"
                  : "bg-text-primary text-white hover:bg-accent hover:shadow-md"
              }`}
              disabled={store.status === "streaming"}
              onClick={start}
            >
              {store.status === "streaming" ? (
                <>
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-accent/20 border-t-accent animate-spin" aria-hidden="true" />
                  <span className="tracking-wide">编织中…</span>
                </>
              ) : (
                <>
                  <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  初始化合成流
                </>
              )}
            </button>

            <div className="flex flex-col gap-0.5 border-l border-border-strong pl-4">
              <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-text-dim">当前周期</span>
              <div className="flex items-center gap-1.5">
                <div className="h-1 w-1 rounded-full bg-accent animate-pulse" aria-hidden="true" />
                <span className="font-serif text-sm text-text-primary tabular-nums">{store.regeneration_count}/3</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            className="group flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.25em] text-text-muted hover:text-text-primary transition-colors duration-300"
            onClick={() => store.setStep(3)}
          >
            <svg aria-hidden="true" className="w-3 h-3 group-hover:-translate-x-0.5 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
            修改决策
          </button>

          {store.bible_draft && store.status !== "streaming" && (
            <button
              type="button"
              className="group flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.25em] text-accent hover:text-text-primary transition-colors duration-300"
              onClick={() => store.setStep(5)}
            >
              继续审核
              <svg aria-hidden="true" className="w-3 h-3 group-hover:translate-x-0.5 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 5l7 7-7 7M5 12h14" />
              </svg>
            </button>
          )}
        </header>

        <div className="bg-secondary/40 border border-accent/20 rounded-xl p-4 relative overflow-hidden">
          <div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-accent/[0.04] to-transparent pointer-events-none animate-shimmer"
            aria-hidden="true"
          />

          <div className="flex items-center justify-between gap-4 mb-2.5 relative z-10">
            <div className="flex flex-col gap-0.5">
              <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-accent">核心算法运行中 / CORE ENGINE</p>
              <h4 className="text-base font-serif font-normal text-text-primary">{phase.label}</h4>
            </div>
            <span className="text-2xl font-serif font-normal text-text-primary/15 tabular-nums">{phase.percent}%</span>
          </div>

          <div className="relative h-1 w-full bg-border-strong rounded-full overflow-hidden">
            <div
              className="absolute top-0 left-0 h-full bg-accent transition-[width] duration-500 ease-out"
              style={{ width: `${phase.percent}%` }}
            />
          </div>
        </div>

        <BibleStreamCards draft={store.bible_draft} eventsCount={events.length} />

        <details className="group bg-white border border-border-subtle rounded-xl overflow-hidden shadow-sm">
          <summary className="cursor-pointer p-3.5 text-[10px] font-bold uppercase tracking-[0.25em] text-text-muted hover:text-text-primary transition-colors list-none flex justify-between items-center bg-secondary/30">
            <span className="flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-accent" aria-hidden="true" />
              <span>合成日志 ({events.length} 条记录)</span>
            </span>
            <svg aria-hidden="true" className="w-3.5 h-3.5 transition-transform duration-300 group-open:rotate-180 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <div className="border-t border-border-subtle bg-white p-4 max-h-[320px] overflow-auto font-mono text-[11px] space-y-2.5 custom-scrollbar">
            {events.length === 0 && (
              <p className="text-text-dim font-serif text-sm">等待首个叙事数据包解压…</p>
            )}
            {events.map((item, index) => (
              <article key={`${item.event}-${index}`} className="relative pl-4 border-l border-border-strong hover:border-accent transition-colors duration-300">
                <div className="absolute left-[-3.5px] top-1 w-1.5 h-1.5 rounded-full bg-border-strong" aria-hidden="true" />
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-accent font-bold uppercase text-[9px] tracking-[0.2em]">{item.event}</span>
                  <span className="text-text-dim text-[9px] font-sans tabular-nums">{new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                </div>
                <pre className="text-text-secondary whitespace-pre-wrap leading-relaxed bg-secondary/30 p-2 rounded">
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
  if (status === "done") return { label: "合成已完成，正在装订分册…", percent: 100 };
  if (!draft?.meta) return { label: "初始化元叙事协议…", percent: 8 };
  if (!draft.characters?.length) return { label: "编织角色原型矩阵…", percent: 22 };
  if (!draft.world) return { label: "架构世界系统规则…", percent: 42 };
  if (!draft.outline?.volume_1?.chapters?.length) return { label: "构建叙事大纲脉络…", percent: 62 };
  if (!draft.first_chapter_beats?.length) return { label: "映射首章叙事节拍…", percent: 82 };
  return { label: "执行最后的完整性校验…", percent: 95 };
}

function BibleStreamCards({ draft, eventsCount }: { draft?: Partial<BibleDraft>; eventsCount: number }) {
  if (!draft) {
    return (
      <div
        className="flex flex-col items-center justify-center py-10 gap-5 border border-accent/20 rounded-xl bg-accent/[0.03] relative overflow-hidden"
        role="status"
        aria-live="polite"
        aria-label="AI 正在合成叙事基础设施"
      >
<div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-accent/[0.05] to-transparent pointer-events-none animate-shimmer-fast"
            aria-hidden="true"
          />

          <div className="relative h-14 w-14 z-10" aria-hidden="true">
            <div className="absolute inset-0 rounded-full border-2 border-accent/10" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-accent border-r-accent/40 animate-spin-slow" />
            <div className="absolute inset-2.5 rounded-full border border-accent/15" />
          <div className="absolute inset-[18px] rounded-full bg-accent/15 animate-pulse" />
          <div className="absolute inset-[22px] rounded-full bg-accent" />
        </div>

        <div className="flex flex-col items-center gap-2 text-center px-6 z-10 min-h-[3.5rem]">
          <p className="text-[10px] font-bold text-accent uppercase tracking-[0.3em] flex items-center gap-2">
            <span className="h-1 w-1 rounded-full bg-accent animate-pulse" aria-hidden="true" />
            正在建立神经连接
            <span className="h-1 w-1 rounded-full bg-accent animate-pulse delay-300" aria-hidden="true" />
          </p>
          <p className="text-[13px] text-text-dim max-w-sm">
            等待首个叙事数据包解压…
          </p>
        </div>

        <div className="flex gap-1.5 z-10" aria-hidden="true">
          <span className="h-1.5 w-1.5 rounded-full bg-accent/40 animate-pulse" />
          <span className="h-1.5 w-1.5 rounded-full bg-accent/60 animate-pulse delay-200" />
          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse delay-400" />
        </div>

        <p className="text-[11px] text-text-dim font-sans tracking-wide z-10">通常 5-15 秒</p>
      </div>
    );
  }

  return (
    <div className="grid gap-5 animate-fade-in">
      {draft.meta ? (
        <StreamCard label="核心设定" title={draft.meta.suggested_title} folio="01">
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {draft.meta.alternative_titles.map((title, i) => (
              <div key={i} className="px-3 py-1 bg-secondary border border-border-subtle rounded-full text-[11px] font-serif text-text-secondary">
                <span className="opacity-40 mr-1.5 font-sans font-bold uppercase text-[8px]">备选 {i + 1}</span>
                {title}
              </div>
            ))}
          </div>
        </StreamCard>
      ) : null}

      {draft.characters?.length ? (
        <div className="grid gap-3">
          <FolioLabel index="02" label="角色原型 / CHARACTER ARCHETYPES" />
          <section className="grid gap-2.5 md:grid-cols-2 lg:grid-cols-3">
            {draft.characters.map((character, index) => (
              <StreamCard key={`${character.name}-${index}`} label={character.role} title={character.name} minimalist>
                <p className="text-[12px] line-clamp-3 leading-relaxed text-text-secondary border-l-2 border-accent/15 pl-2.5 my-2.5">
                  {character.personality}
                </p>
                <div className="text-[10px] font-bold text-accent uppercase tracking-widest opacity-70">
                  &ldquo;{character.catchphrase}&rdquo;
                </div>
              </StreamCard>
            ))}
          </section>
        </div>
      ) : null}

      {draft.world ? (
        <StreamCard label="世界观" title="系统性设定基座" folio="03">
          <p className="text-[13px] leading-relaxed text-text-secondary mb-3 max-w-2xl">{draft.world.setting_summary}</p>
          <div className="flex flex-wrap gap-1.5">
            {draft.world.rules.map((rule) => (
              <span key={rule} className="px-2.5 py-1 bg-white border border-border-strong rounded-md text-[10px] font-bold text-text-primary hover:border-accent transition-colors duration-300">
                {rule}
              </span>
            ))}
          </div>
        </StreamCard>
      ) : null}

      {draft.outline?.volume_1?.chapters?.length ? (
        <div className="grid gap-3">
          <FolioLabel index="04" label="叙事大纲 / MANUSCRIPT INDEX" />
          <StreamCard label="首卷分册" title={draft.outline.volume_1.name || "新征程"} minimalist>
            <div className="grid gap-1.5 mt-3">
              {draft.outline.volume_1.chapters.map((chapter) => (
                <div key={chapter.index} className="group/chapter p-3 rounded-lg hover:bg-secondary/50 transition-colors duration-200 flex gap-3 items-start">
                  <span className="font-serif text-base text-accent/25 group-hover/chapter:text-accent transition-colors duration-200 shrink-0 leading-none mt-0.5 tabular-nums">
                    {String(chapter.index).padStart(2, "0")}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <h5 className="text-sm font-serif font-normal text-text-primary">{chapter.title}</h5>
                    <p className="text-[12px] text-text-muted leading-relaxed">{chapter.summary}</p>
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
    <div className="flex items-center gap-2">
      <span className="font-serif text-sm text-accent/50" aria-hidden="true">{index}</span>
      <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-text-muted">{label}</label>
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
      <article className="animate-fade-in-up bg-white border border-border-subtle p-3.5 rounded-xl shadow-sm hover:shadow-md hover:border-border-strong transition-[box-shadow,border-color] duration-300">
        <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-accent mb-1.5 flex items-center gap-1.5">
          <span className="w-1 h-1 rounded-full bg-accent" aria-hidden="true" />
          {label}
        </p>
        <h3 className="text-base font-serif font-normal text-text-primary tracking-tight">{title}</h3>
        {children}
      </article>
    );
  }

  return (
    <article className="animate-fade-in-up bg-white border border-border-subtle p-5 rounded-xl shadow-sm hover:shadow-md hover:border-border-strong transition-[box-shadow,border-color] duration-300 relative overflow-hidden">
      {folio && (
        <div className="absolute top-3 right-4 font-serif text-3xl leading-none text-text-primary/5 select-none pointer-events-none" aria-hidden="true">
          {folio}
        </div>
      )}
      <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-accent mb-1.5 flex items-center gap-2">
        <span className="h-px w-4 bg-accent/40" aria-hidden="true" />
        {label}
      </p>
      <h3 className="text-xl md:text-2xl font-serif font-normal text-text-primary mb-2 tracking-tight">{title}</h3>
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
          theme: "首卷成长与核心冲突",
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
