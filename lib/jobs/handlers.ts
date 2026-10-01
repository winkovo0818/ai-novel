import { generationCallContext } from "@/lib/agent/generationExecution";
import { prisma } from "@/lib/db";
import { chatCompletionWithRetry } from "@/lib/llm/client";
import { buildSummarizePrompt } from "@/lib/llm/prompts/summarize";
import { indexChapter } from "@/lib/agent/chunking";
import { refreshSummaries } from "@/lib/agent/summaries";
import { registerHandler } from "./queue";
import { handleGenerateChapter } from "./generateChapterHandler";
import { handlePlanOutline } from "./planOutlineHandler";
import { withLlmCallContext } from "@/lib/llm/callContext";

interface SummarizeChapterPayload {
  chapter_id: string;
  run_id?: string;
}

interface IndexChapterPayload {
  novel_id: string;
  chapter_id: string;
  run_id?: string;
}

interface RefreshSummariesPayload {
  novel_id: string;
}

function isSummarizePayload(p: unknown): p is SummarizeChapterPayload {
  return typeof p === "object" && p !== null && typeof (p as { chapter_id?: unknown }).chapter_id === "string";
}

function isIndexPayload(p: unknown): p is IndexChapterPayload {
  if (typeof p !== "object" || p === null) return false;
  const obj = p as { novel_id?: unknown; chapter_id?: unknown };
  return typeof obj.novel_id === "string" && typeof obj.chapter_id === "string";
}

function isRefreshPayload(p: unknown): p is RefreshSummariesPayload {
  return typeof p === "object" && p !== null && typeof (p as { novel_id?: unknown }).novel_id === "string";
}

let registered = false;

export function registerJobHandlers(): void {
  if (registered) return;
  registered = true;

  registerHandler("summarize_chapter", async (payload, execution) => {
    if (!isSummarizePayload(payload)) throw new Error("Invalid summarize_chapter payload");
    const chapter = await prisma.chapterDraft.findUnique({ where: { id: payload.chapter_id }, include: { novel: true } });
    if (!chapter || !chapter.content.trim()) return;

    const result = await withLlmCallContext(generationCallContext({ runId: payload.run_id, novelId: chapter.novel_id,
      userId: chapter.novel?.user_id ?? undefined, phase: "postprocessing", execution }), () => chatCompletionWithRetry({
      route: "/jobs/summarize_chapter",
      agent: "summarizer",
      messages: buildSummarizePrompt(chapter.chapter_index, chapter.title, chapter.content),
      temperature: 0,
      timeoutMs: 120_000,
    }, 1));

    // Only clear dirty flags when the summarized version is still current.
    await prisma.$transaction(async tx => {
      await execution?.assertActive(tx);
      const locked = await tx.chapterDraft.updateMany({ where: { id: chapter.id, version: chapter.version }, data: { summary_dirty: false } });
      if (!locked.count) throw new Error("Chapter changed while summarizing; retry with the latest content");
      await tx.chapterSummary.upsert({
        where: { chapter_id: chapter.id },
        create: { chapter_id: chapter.id, summary: result.content.trim() },
        update: { summary: result.content.trim() },
      });
      execution?.signal.throwIfAborted();
    });
  });

  registerHandler("index_chapter", async (payload, execution) => {
    if (!isIndexPayload(payload)) throw new Error("Invalid index_chapter payload");
    const chapter = await prisma.chapterDraft.findUnique({ where: { id: payload.chapter_id }, include: { novel: true } });
    if (!chapter) return;
    if (chapter.novel_id !== payload.novel_id) throw new Error("Chapter belongs to another novel");
    await withLlmCallContext(generationCallContext({ runId: payload.run_id, novelId: payload.novel_id,
      userId: chapter.novel?.user_id ?? undefined, phase: "postprocessing", execution }), () => indexChapter(payload.novel_id, payload.chapter_id, chapter.content, async tx => {
        await execution?.assertActive(tx);
        const locked = await tx.chapterDraft.updateMany({ where: { id: chapter.id, version: chapter.version }, data: { index_dirty: false } });
        if (!locked.count) throw new Error("Chapter changed while indexing; retry with the latest content");
      }));
    // M3.1: indexChapter() rebuilds MemoryChunk rows for this chapter. Clear
    // index_dirty so the management page badge reflects "fresh" again.
  });

  registerHandler("refresh_summaries", async (payload, execution) => {
    if (!isRefreshPayload(payload)) throw new Error("Invalid refresh_summaries payload");
    await withLlmCallContext({ signal: execution?.signal, beforeCall: execution?.assertActive },
      () => refreshSummaries(payload.novel_id, execution));
  });

  registerHandler("generate_chapter", handleGenerateChapter);
  registerHandler("plan_outline", handlePlanOutline);
}

// Auto-register on module import so route handlers and queue runners
// don't need to call registerJobHandlers() explicitly.
registerJobHandlers();
