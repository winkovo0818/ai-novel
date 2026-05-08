"use client";

import { useState } from "react";
import type { ReactNode } from "react";

import { useWizardStore } from "@/lib/store/wizardStore";
import type { BibleDraft } from "@/lib/validation/schemas";
import { StepShell } from "./StepShell";

type StreamEvent = {
  event: string;
  data: unknown;
};

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
    <StepShell eyebrow="STEP 04" title="圣经合成中" description="正在编织叙事经纬。AI 正在实时同步合成作品的叙事基础设施。">
      <div className="grid gap-32">
        <div className="flex flex-wrap items-center gap-16">
          <button className="btn-primary" disabled={store.status === "streaming"} onClick={start}>
            {store.status === "streaming" ? (
              <span className="flex items-center gap-8">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                正在合成...
              </span>
            ) : "启动合成流"}
          </button>
          <div className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
            重试周期: {store.regeneration_count}/3
          </div>
          <button className="btn-secondary" onClick={() => store.setStep(3)}>
            修改决策
          </button>
        </div>

        <div className="bg-surface border border-border-strong rounded-md p-24 shadow-sm">
          <div className="flex items-center justify-between gap-12 mb-16">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">当前合成阶段</p>
              <p className="mt-4 text-lg font-semibold text-text-primary">{phase.label}</p>
            </div>
            <span className="text-xl font-bold text-primary">{phase.percent}%</span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all duration-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]" style={{ width: `${phase.percent}%` }} />
          </div>
        </div>

        <BibleStreamCards draft={store.bible_draft} eventsCount={events.length} />

        <details className="group bg-surface border border-border-strong rounded-md overflow-hidden">
          <summary className="cursor-pointer p-16 text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted hover:bg-secondary transition-colors list-none flex justify-between items-center">
            <span>数据包日志 / 实时合成数据 ({events.length})</span>
            <span className="group-open:rotate-180 transition-transform">↓</span>
          </summary>
          <div className="border-t border-border-subtle bg-secondary/20 p-16 max-h-96 overflow-auto font-mono text-[10px] space-y-8">
            {events.map((item, index) => (
              <article key={`${item.event}-${index}`} className="border-l-2 border-primary/30 pl-12 py-4">
                <p className="text-primary font-bold mb-4">EVENT::{item.event.toUpperCase()}</p>
                <pre className="text-text-secondary whitespace-pre-wrap">{JSON.stringify(item.data, null, 2)}</pre>
              </article>
            ))}
          </div>
        </details>
      </div>
    </StepShell>
  );
}

function getStreamPhase(draft: Partial<BibleDraft> | undefined, status: string) {
  if (status === "done") return { label: "合成已完成，正在跳转核对页面...", percent: 100 };
  if (!draft?.meta) return { label: "正在初始化元数据...", percent: 8 };
  if (!draft.characters?.length) return { label: "正在构建角色矩阵...", percent: 22 };
  if (!draft.world) return { label: "正在生成世界规则协议...", percent: 42 };
  if (!draft.outline?.volume_1?.chapters?.length) return { label: "正在编排单元目录...", percent: 62 };
  if (!draft.first_chapter_beats?.length) return { label: "正在绘制叙事脉络节拍...", percent: 82 };
  return { label: "执行最后的完整性校验...", percent: 95 };
}

function BibleStreamCards({ draft, eventsCount }: { draft?: Partial<BibleDraft>; eventsCount: number }) {
  if (!draft || eventsCount === 0) {
    return (
      <div className="border-2 border-dashed border-border-strong p-48 text-center rounded-md bg-surface/50">
        <div className="flex justify-center mb-16">
          <div className="flex gap-4">
            <div className="h-2 w-2 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]" />
            <div className="h-2 w-2 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]" />
            <div className="h-2 w-2 bg-primary rounded-full animate-bounce" />
          </div>
        </div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted">等待首个叙事数据包...</p>
      </div>
    );
  }

  return (
    <div className="grid gap-24 animate-slide">
      {draft.meta ? (
        <StreamCard label="核心设定" title={draft.meta.suggested_title}>
          <p className="text-xs text-text-muted mt-8">建议标题方案: {draft.meta.alternative_titles.join(" / ")}</p>
        </StreamCard>
      ) : null}

      {draft.characters?.length ? (
        <section className="grid gap-16 md:grid-cols-3">
          {draft.characters.map((character, index) => (
            <StreamCard key={`${character.name}-${index}`} label={character.role} title={character.name}>
              <p className="line-clamp-3 mb-12">{character.personality}</p>
              <div className="p-12 bg-secondary/30 rounded-sm text-xs italic text-text-muted border-l-2 border-primary/20">
                "{character.catchphrase}"
              </div>
            </StreamCard>
          ))}
        </section>
      ) : null}

      {draft.world ? (
        <StreamCard label="世界系统" title="核心设定">
          <p className="mb-16">{draft.world.setting_summary}</p>
          <div className="flex flex-wrap gap-8">
            {draft.world.rules.map((rule) => (
              <span key={rule} className="px-8 py-3 bg-primary/5 rounded-full text-[10px] font-bold border border-primary/10 text-primary uppercase">
                {rule}
              </span>
            ))}
          </div>
        </StreamCard>
      ) : null}

      {draft.outline?.volume_1?.chapters?.length ? (
        <StreamCard label="叙事大纲" title={draft.outline.volume_1.name || "首部曲"}>
          <div className="grid gap-8">
            {draft.outline.volume_1.chapters.map((chapter) => (
              <div key={chapter.index} className="p-16 bg-background border border-border-subtle rounded-sm hover:border-primary/30 transition-colors">
                <p className="text-[10px] font-bold text-text-dim mb-4">UNIT {String(chapter.index).padStart(2, "0")}</p>
                <p className="font-semibold text-text-primary mb-4">{chapter.title}</p>
                <p className="text-[11px] text-text-secondary line-clamp-2 italic">{chapter.summary}</p>
              </div>
            ))}
          </div>
        </StreamCard>
      ) : null}

      {draft.first_chapter_beats?.length ? (
        <StreamCard label="开篇节拍" title="叙事序列 01">
          <div className="grid gap-12 md:grid-cols-2">
            {draft.first_chapter_beats.map((beat) => (
              <div key={beat.beat} className="p-16 bg-background border border-border-subtle rounded-sm">
                <p className="text-[10px] font-bold text-text-dim mb-4">BEAT {String(beat.beat).padStart(2, "0")} / {beat.scene}</p>
                <p className="text-[11px] text-text-secondary leading-relaxed">{beat.purpose}</p>
              </div>
            ))}
          </div>
        </StreamCard>
      ) : null}
    </div>
  );
}

function StreamCard({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <article className="animate-fade border border-border-strong bg-surface p-24 rounded-md shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-8">{label}</p>
      <h3 className="text-xl font-bold text-text-primary mb-16 tracking-tight">{title}</h3>
      <div className="text-sm text-text-secondary leading-relaxed">{children}</div>
    </article>
  );
}

async function readSse(body: ReadableStream<Uint8Array>, onEvent: (event: StreamEvent) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const event = parseSseBlock(block);
      if (event) onEvent(event);
    }
  }
}

function parseSseBlock(block: string): StreamEvent | null {
  if (block.startsWith(":")) return null;
  const event = block.match(/^event: (.+)$/m)?.[1];
  const data = block.match(/^data: (.+)$/m)?.[1];
  if (!event || !data) return null;
  return { event, data: JSON.parse(data) };
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
