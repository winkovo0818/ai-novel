"use client";

import { useState, useEffect } from "react";
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
    <StepShell eyebrow="分册 04" title="圣经合成中" description="AI 正在根据您的灵感、题材与决策维度，实时合成一套完整的叙事基础设施。">
      <div className="grid gap-8">
        {/* Stale-streaming recovery banner */}
        {recovered && (
          <div className="flex items-center gap-4 rounded-2xl bg-amber-50 border border-amber-100 px-6 py-4 text-[13px] text-amber-800">
            <svg aria-hidden="true" className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span>上次合成中途中断。您可以重新启动合成，或直接查看已生成的部分内容。</span>
            {store.bible_draft && (
              <button
                type="button"
                className="ml-auto shrink-0 rounded-full bg-amber-600 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white hover:bg-amber-700 transition"
                onClick={() => { store.setStatus("done"); store.setStep(5); }}
              >
                查看已有内容
              </button>
            )}
          </div>
        )}

        <header className="flex flex-wrap items-center justify-between gap-6 border-b border-border-subtle pb-6">
          <div className="flex items-center gap-6">
            <button 
              className={`h-14 px-8 rounded-full font-bold shadow-premium transition flex items-center gap-3 active:scale-95 ${
                store.status === "streaming" 
                ? "bg-secondary text-text-dim cursor-default" 
                : "bg-text-primary text-white hover:bg-accent"
              }`} 
              disabled={store.status === "streaming"} 
              onClick={start}
            >
              {store.status === "streaming" ? (
                <>
                  <div className="relative w-5 h-5">
                    <div className="absolute inset-0 rounded-full border-2 border-accent/20 border-t-accent animate-spin" />
                  </div>
                  <span className="font-serif text-base tracking-wide">正在实时编织中…</span>
                </>
              ) : (
                <>
                  <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  初始化合成流
                </>
              )}
            </button>
            
            <div className="flex flex-col gap-1 border-l border-border-strong pl-6">
               <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-text-dim">当前合成周期</span>
               <div className="flex items-center gap-2">
                 <div className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                 <span className="font-serif text-lg text-text-primary">{store.regeneration_count}/3</span>
               </div>
            </div>
          </div>
          
          <button 
            className="group flex items-center gap-2.5 text-[10px] font-bold uppercase tracking-[0.3em] text-text-muted hover:text-text-primary transition duration-500" 
            onClick={() => store.setStep(3)}
          >
            <svg aria-hidden="true" className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
            修改叙事决策
          </button>
        </header>

        {/* Progress Visualization */}
        <div className="bg-secondary/30 border border-border-subtle rounded-[2rem] p-6 relative overflow-hidden group">
          <div className="flex items-center justify-between gap-8 mb-4 relative z-10">
            <div className="flex flex-col gap-1">
              <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-accent">核心合成算法运行中 / CORE ENGINE</p>
              <h4 className="text-2xl font-serif font-normal text-text-primary tracking-tight">{phase.label}</h4>
            </div>
            <div className="text-right">
               <span className="text-4xl font-serif font-normal text-text-primary/10 group-hover:text-accent/20 transition-colors duration-500">{phase.percent}%</span>
            </div>
          </div>
          
          <div className="relative h-1 w-full bg-border-strong rounded-full overflow-hidden z-10 shadow-inner">
            <div 
              className="absolute top-0 left-0 h-full bg-accent transition duration-500 ease-in-out" 
              style={{ width: `${phase.percent}%` }}
            />
          </div>
        </div>

        {/* Dynamic Cards */}
        <BibleStreamCards draft={store.bible_draft} eventsCount={events.length} />

        {/* Console / Journal */}
        <details className="group bg-white border border-border-strong rounded-[2rem] overflow-hidden shadow-sm transition duration-300">
          <summary className="cursor-pointer p-5 text-[10px] font-bold uppercase tracking-[0.3em] text-text-dim hover:text-text-primary transition-colors list-none flex justify-between items-center bg-secondary/20">
            <div className="flex items-center gap-3">
               <div className="w-1 h-1 rounded-full bg-accent" />
               <span>叙事合成日志 ({events.length} 条记录)</span>
            </div>
            <svg aria-hidden="true" className="w-4 h-4 transition-transform duration-300 group-open:rotate-180 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <div className="border-t border-border-subtle bg-white p-6 max-h-[400px] overflow-auto font-mono text-[11px] space-y-3 custom-scrollbar">
            {events.length === 0 && (
              <p className="text-text-dim opacity-50 font-serif text-base">等待首个叙事数据包解压…</p>
            )}
            {events.map((item, index) => (
              <article key={`${item.event}-${index}`} className="group/entry relative pl-6 border-l border-border-strong hover:border-accent transition-colors duration-500">
                <div className="absolute left-[-4.5px] top-1 w-2 h-2 rounded-full bg-border-strong group-hover/entry:bg-accent transition duration-500" />
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-accent font-bold uppercase text-[9px] tracking-[0.2em]">{item.event}</span>
                  <span className="text-text-dim text-[9px] font-sans">{new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                </div>
                <pre className="text-text-secondary whitespace-pre-wrap leading-relaxed bg-secondary/30 p-3 rounded-lg border border-transparent group-hover/entry:border-border-subtle transition duration-500">
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
  if (!draft || eventsCount === 0) {
    return (
      <div className="border-2 border-dashed border-border-strong p-16 text-center rounded-[2rem] bg-secondary/10 flex flex-col items-center gap-6">
        <div className="flex gap-3">
          <div className="h-2 w-2 rounded-full bg-accent/20 animate-pulse" />
          <div className="h-2 w-2 rounded-full bg-accent/40 animate-pulse [animation-delay:200ms]" />
          <div className="h-2 w-2 rounded-full bg-accent/60 animate-pulse [animation-delay:400ms]" />
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-text-dim">正在建立神经连接</p>
          <p className="text-lg font-serif text-text-dim/60">等待首个叙事数据包解压…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-8 animate-fade-in">
      {draft.meta ? (
        <StreamCard label="核心设定" title={draft.meta.suggested_title} folio="01">
          <div className="flex flex-wrap gap-2 mt-4">
             {draft.meta.alternative_titles.map((title, i) => (
               <div key={i} className="px-4 py-1 bg-secondary border border-border-subtle rounded-full text-[12px] font-serif text-text-secondary">
                 <span className="opacity-30 mr-2 font-sans font-bold uppercase text-[8px]">备选 {i+1}</span>
                 {title}
               </div>
             ))}
          </div>
        </StreamCard>
      ) : null}

      {draft.characters?.length ? (
        <div className="grid gap-6">
          <FolioLabel index="02" label="活跃角色原型 / CHARACTER ARCHETYPES" />
          <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {draft.characters.map((character, index) => (
              <StreamCard key={`${character.name}-${index}`} label={character.role} title={character.name} minimalist>
                <p className="text-[13px] line-clamp-3 leading-relaxed text-text-secondary font-serif border-l-2 border-accent/10 pl-4 my-3">
                  {character.personality}
                </p>
                <div className="text-[11px] font-bold text-accent uppercase tracking-widest opacity-60">
                   &ldquo;{character.catchphrase}&rdquo;
                </div>
              </StreamCard>
            ))}
          </section>
        </div>
      ) : null}

      {draft.world ? (
        <StreamCard label="世界观" title="系统性设定基座" folio="03">
          <p className="text-base leading-relaxed text-text-secondary font-serif mb-4 max-w-3xl">{draft.world.setting_summary}</p>
          <div className="flex flex-wrap gap-2">
            {draft.world.rules.map((rule) => (
              <span key={rule} className="px-3 py-1 bg-white border border-border-strong rounded-xl text-[10px] font-bold text-text-primary shadow-sm hover:border-accent transition-colors duration-500">
                {rule}
              </span>
            ))}
          </div>
        </StreamCard>
      ) : null}

      {draft.outline?.volume_1?.chapters?.length ? (
        <div className="grid gap-6">
          <FolioLabel index="04" label="叙事大纲 / THE MANUSCRIPT INDEX" />
          <StreamCard label="首卷分册" title={draft.outline.volume_1.name || "新征程"} minimalist>
            <div className="grid gap-2 mt-4">
              {draft.outline.volume_1.chapters.map((chapter) => (
                <div key={chapter.index} className="group/chapter p-5 rounded-[1.5rem] hover:bg-secondary/50 transition duration-300 flex gap-4 items-start">
                  <span className="font-serif text-2xl text-accent/20 group-hover/chapter:text-accent transition-colors duration-300 shrink-0">
                    {String(chapter.index).padStart(2, '0')}
                  </span>
                  <div className="flex flex-col gap-1">
                    <h5 className="text-lg font-serif font-normal text-text-primary group-hover/chapter:translate-x-1.5 transition-transform duration-300">{chapter.title}</h5>
                    <p className="text-[13px] text-text-muted leading-relaxed max-w-2xl opacity-0 group-hover/chapter:opacity-100 group-hover/chapter:translate-x-1.5 transition duration-500">{chapter.summary}</p>
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
    <div className="flex items-center gap-4 group px-4">
      <span className="font-serif text-2xl text-accent/40 group-hover:text-accent transition-colors duration-300">{index}</span>
      <label className="text-[10px] font-bold uppercase tracking-[0.3em] text-text-muted">
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
      <article className="animate-fade-in-up bg-white border border-border-subtle p-6 rounded-[2rem] shadow-sm hover:shadow-premium transition duration-500 group">
        <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-accent mb-2 flex items-center gap-2">
           <span className="w-1 h-1 rounded-full bg-accent" />
           {label}
        </p>
        <h3 className="text-xl font-serif font-normal text-text-primary tracking-tight group-hover:translate-x-1.5 transition-transform duration-300">{title}</h3>
        {children}
      </article>
    );
  }

  return (
    <article className="animate-fade-in-up bg-white border border-border-subtle p-6 md:p-10 rounded-[2.5rem] shadow-premium hover:shadow-2xl transition duration-500 relative overflow-hidden group">
      {folio && (
        <div className="absolute top-6 right-8 font-serif text-[60px] leading-none text-text-primary/5 select-none pointer-events-none opacity-20 group-hover:text-accent/10 transition-colors duration-500">
          {folio}
        </div>
      )}
      <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-accent mb-4 flex items-center gap-3">
         <div className="h-px w-6 bg-accent/30" />
         {label}
      </p>
      <h3 className="text-3xl md:text-4xl font-serif font-normal text-text-primary mb-6 tracking-tight group-hover:translate-x-3 transition-transform duration-500">{title}</h3>
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

