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

  async function start() {
    if (store.regeneration_count >= 3) {
      store.setError({ step: 4, message: "重摆次数已用完。你可以直接保存当前草稿，或返回前面修改灵感。", retryable: false });
      return;
    }

    if (!store.session_id || !store.default_profile || !store.inputs.logline) {
      store.setError({ step: 4, message: "缺少生成 Bible 所需的前置输入", retryable: false });
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
        throw new Error(`Bible stream failed: HTTP ${response.status}`);
      }

      await readSse(response.body, (event) => {
        if (event.event === "error") {
          const data = event.data as { message?: string; retryable?: boolean; regeneration_count?: number };
          if (typeof data.regeneration_count === "number") {
            store.setRegenerationCount(data.regeneration_count);
          }
          store.setError({ step: 4, message: data.message ?? "Bible 生成失败", retryable: data.retryable ?? true });
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
      const message = err instanceof Error ? err.message : "unknown error";
      store.setError({ step: 4, message, retryable: true });
    }
  }

  return (
    <StepShell eyebrow="Step 4" title="流式生成 Bible 草稿" description="卡片会随着 SSE 节点逐张浮现；生成完成后自动进入审阅。">
      <div className="grid gap-5">
        <div className="flex flex-wrap gap-3">
          <button className="rounded-2xl bg-neutral-950 px-5 py-3 font-medium text-white disabled:opacity-50" disabled={store.status === "streaming"} onClick={start}>
          {store.status === "streaming" ? "生成中..." : "开始生成"}
          </button>
          <span className="self-center text-sm text-neutral-500">已重摆 {store.regeneration_count}/3 次</span>
          <button className="rounded-2xl border border-neutral-300 px-5 py-3 font-medium" onClick={() => store.setStep(3)}>
            返回修改答案
          </button>
        </div>

        <BibleStreamCards draft={store.bible_draft} eventsCount={events.length} />

        <details className="rounded-2xl border border-neutral-200 bg-neutral-950 p-4 text-white">
          <summary className="cursor-pointer text-sm font-medium">查看 SSE 原始事件（{events.length}）</summary>
          <div className="mt-4 grid max-h-96 gap-3 overflow-auto">
            {events.map((item, index) => (
              <article key={`${item.event}-${index}`} className="rounded-xl bg-white/10 p-3">
                <p className="text-xs font-semibold text-neutral-300">{item.event}</p>
                <pre className="mt-2 whitespace-pre-wrap text-xs text-neutral-100">{JSON.stringify(item.data, null, 2)}</pre>
              </article>
            ))}
          </div>
        </details>
      </div>
    </StepShell>
  );
}

function BibleStreamCards({ draft, eventsCount }: { draft?: Partial<BibleDraft>; eventsCount: number }) {
  if (!draft || eventsCount === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-neutral-300 bg-white p-8 text-neutral-500">
        等待第一张 Bible 卡片...
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {draft.meta ? (
        <StreamCard label="Meta" title={draft.meta.suggested_title} tone="dark">
          <p>{draft.meta.alternative_titles.join(" / ")}</p>
        </StreamCard>
      ) : null}

      {draft.characters?.length ? (
        <section className="grid gap-3 md:grid-cols-3">
          {draft.characters.map((character, index) => (
            <StreamCard key={`${character.name}-${index}`} label={character.role} title={character.name}>
              <p>{character.personality}</p>
              <p className="mt-3 rounded-xl bg-neutral-100 p-3">“{character.catchphrase}”</p>
            </StreamCard>
          ))}
        </section>
      ) : null}

      {draft.world ? (
        <StreamCard label="World" title="世界观核心">
          <p>{draft.world.setting_summary}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {draft.world.rules.map((rule) => <span key={rule} className="rounded-full bg-neutral-100 px-3 py-1 text-sm">{rule}</span>)}
          </div>
        </StreamCard>
      ) : null}

      {draft.outline?.volume_1?.chapters?.length ? (
        <StreamCard label="Outline" title={draft.outline.volume_1.name || "首卷大纲"}>
          <div className="grid gap-3">
            {draft.outline.volume_1.chapters.map((chapter) => (
              <div key={chapter.index} className="rounded-xl bg-neutral-50 p-4">
                <p className="font-medium">{chapter.index}. {chapter.title}</p>
                <p className="mt-1 text-sm text-neutral-600">{chapter.summary}</p>
              </div>
            ))}
          </div>
        </StreamCard>
      ) : null}

      {draft.first_chapter_beats?.length ? (
        <StreamCard label="Beats" title="第一章节拍">
          <div className="grid gap-3 md:grid-cols-2">
            {draft.first_chapter_beats.map((beat) => (
              <div key={beat.beat} className="rounded-xl bg-neutral-50 p-4">
                <p className="font-medium">Beat {beat.beat}: {beat.scene}</p>
                <p className="mt-1 text-sm text-neutral-600">{beat.purpose}</p>
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
  tone = "light",
  children,
}: {
  label: string;
  title: string;
  tone?: "light" | "dark";
  children: ReactNode;
}) {
  const dark = tone === "dark";
  return (
    <article className={`animate-in rounded-3xl border p-5 shadow-sm ${dark ? "border-neutral-900 bg-neutral-950 text-white" : "border-neutral-200 bg-white text-neutral-950"}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${dark ? "text-neutral-400" : "text-neutral-500"}`}>{label}</p>
      <h3 className="mt-2 text-xl font-semibold">{title}</h3>
      <div className={`mt-3 text-sm ${dark ? "text-neutral-300" : "text-neutral-700"}`}>{children}</div>
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
  if (item.event === "character") next.characters = upsertIndexed(next.characters, item.data);
  if (item.event === "outline_chapter") {
    next.outline = {
      volume_1: {
        ...(next.outline?.volume_1 ?? { name: "", theme: "", chapter_count_estimate: 0 }),
        chapters: upsertIndexed(next.outline?.volume_1?.chapters, item.data),
      },
    };
  }
  if (item.event === "first_chapter_beat") next.first_chapter_beats = upsertIndexed(next.first_chapter_beats, item.data);

  return next;
}

function upsertIndexed<T>(current: T[] | undefined, raw: unknown): T[] {
  const { index, ...value } = raw as T & { index: number };
  const next = [...(current ?? [])];
  next[index] = value as T;
  return next.filter(Boolean);
}
