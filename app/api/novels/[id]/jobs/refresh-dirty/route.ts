import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { enqueueJob, runPendingJobsForNovel } from "@/lib/jobs/queue";
import { errorMessage, logError } from "@/lib/observability/logger";
import { getRequiredUserId } from "@/utils/supabase/auth";

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

  let userId: string;
  try {
    userId = await getRequiredUserId();
  } catch {
    return jsonError("UNAUTHORIZED", "Login required", false, 401);
  }
  if (!canAccessOwnerResource(novel.user_id, userId)) {
    return jsonError("NOVEL_NOT_FOUND", "Novel not found", false, 404);
  }

  const dirty = await prisma.chapterDraft.findMany({
    where: {
      novel_id: id,
      OR: [{ summary_dirty: true }, { index_dirty: true }],
    },
    select: { id: true, summary_dirty: true, index_dirty: true, content: true },
  });

  let summarizeQueued = 0;
  let indexQueued = 0;
  for (const chapter of dirty) {
    // Empty content can't be summarized or indexed — skip silently. The
    // dirty flag stays set; once the user adds content and saves, the
    // next refresh-dirty will pick it up.
    if (!chapter.content.trim()) continue;
    if (chapter.summary_dirty) {
      await enqueueJob({
        type: "summarize_chapter",
        payload: { chapter_id: chapter.id },
        novelId: id,
      });
      summarizeQueued += 1;
    }
    if (chapter.index_dirty) {
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
    chapters_dirty: dirty.length,
  });
}
