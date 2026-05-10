import { prisma } from "@/lib/db";
import { chatCompletion } from "@/lib/llm/client";
import { buildSummarizePrompt } from "@/lib/llm/prompts/summarize";
import { indexChapter } from "@/lib/agent/chunking";
import { refreshSummaries } from "@/lib/agent/summaries";
import { registerHandler } from "./queue";

interface SummarizeChapterPayload {
  chapter_id: string;
}

interface IndexChapterPayload {
  novel_id: string;
  chapter_id: string;
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

  registerHandler("summarize_chapter", async (payload) => {
    if (!isSummarizePayload(payload)) throw new Error("Invalid summarize_chapter payload");
    const chapter = await prisma.chapterDraft.findUnique({ where: { id: payload.chapter_id } });
    if (!chapter || !chapter.content.trim()) return;

    const result = await chatCompletion({
      route: "/jobs/summarize_chapter",
      agent: "summarizer",
      messages: buildSummarizePrompt(chapter.chapter_index, chapter.title, chapter.content),
      temperature: 0,
      timeoutMs: 15_000,
    });

    // M3.1: upsert + clear summary_dirty in one transaction so the chapter
    // management page's "needs refresh" badge flips off the moment the
    // summary lands. If summarize_dirty was set again between findUnique
    // and now, we still clear it — the next user edit re-sets it via PATCH,
    // which is the contract the editor relies on.
    await prisma.$transaction([
      prisma.chapterSummary.upsert({
        where: { chapter_id: chapter.id },
        create: { chapter_id: chapter.id, summary: result.content.trim() },
        update: { summary: result.content.trim() },
      }),
      prisma.chapterDraft.update({
        where: { id: chapter.id },
        data: { summary_dirty: false },
      }),
    ]);
  });

  registerHandler("index_chapter", async (payload) => {
    if (!isIndexPayload(payload)) throw new Error("Invalid index_chapter payload");
    const chapter = await prisma.chapterDraft.findUnique({ where: { id: payload.chapter_id } });
    if (!chapter || !chapter.content.trim()) return;
    await indexChapter(payload.novel_id, payload.chapter_id, chapter.content);
    // M3.1: indexChapter() rebuilds MemoryChunk rows for this chapter. Clear
    // index_dirty so the management page badge reflects "fresh" again.
    await prisma.chapterDraft.update({
      where: { id: chapter.id },
      data: { index_dirty: false },
    });
  });

  registerHandler("refresh_summaries", async (payload) => {
    if (!isRefreshPayload(payload)) throw new Error("Invalid refresh_summaries payload");
    await refreshSummaries(payload.novel_id);
  });
}

// Auto-register on module import so route handlers and queue runners
// don't need to call registerJobHandlers() explicitly.
registerJobHandlers();
