import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/db";
import { enqueueJob, runPendingJobsForNovel } from "@/lib/jobs/queue";
import { errorMessage, logError } from "@/lib/observability/logger";
import { routeGuard } from "@/lib/auth/routeGuard";

// Side-effect import: registers job handlers on first load.
import "@/lib/jobs/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/novels/:id/jobs/refresh-dirty — M3.1 batch flush.
 *
 * Scans every chapter in this novel for `summary_dirty` / `index_dirty`
 * flags and enqueues the corresponding jobs in one server-side pass.
 * Lets the chapter management page surface a single button instead of
 * the editor pushing jobs after every keystroke autosave.
 *
 * Bundles in one `refresh_summaries` job at the end if any chapter is
 * being summarized — volume / novel summaries are derived from chapter
 * summaries, so a chapter resummarize is the only thing that can stale
 * them.
 */
export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  const novel = await prisma.novel.findUnique({
    where: { id },
    select: { id: true, user_id: true },
  });
  if (!novel) {
    return jsonError("NOVEL_NOT_FOUND", "Novel not found", false, 404);
  }

  const guard = await routeGuard({
    route: "/api/novels/:id/jobs/refresh-dirty",
    resource: { type: "novel", id, ownerId: novel.user_id },
  });
  if ("response" in guard) return guard.response;

  // Fetch every chapter with summary + chunk count so we discover
  // chapters drafted before the M3.1 dirty-flag migration that have
  // never been summarized or indexed.
  const chapters = await prisma.chapterDraft.findMany({
    where: { novel_id: id },
    include: { summary: true },
    orderBy: { chapter_index: "asc" },
  });

  // MemoryChunk has no reverse relation from ChapterDraft, so query
  // separately to know which chapters have never been indexed.
  const chunkCounts = await prisma.memoryChunk.groupBy({
    by: ["chapter_id"],
    where: { novel_id: id, chapter_id: { not: null } },
    _count: { _all: true },
  });
  const chaptersWithChunks = new Set(
    chunkCounts.filter((c) => c._count._all > 0).map((c) => c.chapter_id),
  );

  let summarizeQueued = 0;
  let indexQueued = 0;
  for (const chapter of chapters) {
    // Empty content can't be summarized or indexed — skip silently. The
    // dirty flag stays set; once the user adds content and saves, the
    // next refresh-dirty will pick it up.
    if (!chapter.content.trim()) continue;
    const needsSummarize = chapter.summary_dirty || !chapter.summary;
    const needsIndex = chapter.index_dirty || !chaptersWithChunks.has(chapter.id);
    if (needsSummarize) {
      await enqueueJob({
        type: "summarize_chapter",
        payload: { chapter_id: chapter.id },
        novelId: id,
      });
      summarizeQueued += 1;
    }
    if (needsIndex) {
      await enqueueJob({
        type: "index_chapter",
        payload: { novel_id: id, chapter_id: chapter.id },
        novelId: id,
      });
      indexQueued += 1;
    }
  }

  let summariesQueued = 0;
  if (summarizeQueued > 0) {
    await enqueueJob({
      type: "refresh_summaries",
      payload: { novel_id: id },
      novelId: id,
    });
    summariesQueued = 1;
  }

  // Drain best-effort, same pattern as POST /jobs.
  if (summarizeQueued + indexQueued + summariesQueued > 0) {
    void runPendingJobsForNovel(id).catch((err) => {
      logError("jobs.refresh_dirty_drain_failed", {
        novel_id: id,
        error: errorMessage(err),
      });
    });
  }

  return jsonOk({
    summarize_queued: summarizeQueued,
    index_queued: indexQueued,
    summaries_queued: summariesQueued,
    chapters_scanned: chapters.length,
  });
}
