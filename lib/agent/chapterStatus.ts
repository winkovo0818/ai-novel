import { prisma } from "@/lib/db";
import type {
  BackgroundJob,
  ChapterDraft,
  ChapterSummary,
} from "@prisma/client";

export type ChapterFreshness = "fresh" | "stale" | "missing" | "running" | "failed";

export interface ChapterStatusView {
  chapterId: string;
  chapterIndex: number;
  /** Summary freshness: missing / stale (out of date) / fresh / running / failed. */
  summary: ChapterFreshness;
  /** Index freshness in MemoryChunk. */
  index: ChapterFreshness;
  /** Latest job for this chapter, if any. */
  lastJobStatus?: BackgroundJob["status"];
  lastJobType?: string;
  lastJobError?: string;
}

interface BuildArgs {
  chapter: ChapterDraft;
  summary?: ChapterSummary | null;
  /** Whether at least one MemoryChunk exists with this chapter_id. */
  hasMemoryChunks: boolean;
  /** Latest job touching this chapter, derived from BackgroundJob.payload.chapter_id. */
  latestJob?: BackgroundJob;
}

/**
 * Decide per-chapter summary / index freshness from the raw rows.
 *
 * Priority order:
 *
 * 1. Running / failed: a BackgroundJob touching this chapter is in those
 *    states. Job state outranks dirty bits because a successful job will
 *    flip the bit anyway, and a failed job is a more actionable hint.
 * 2. Stale: M3.1 dirty bit is true (PATCH set it on content change).
 *    Dirty wins over missing so chapters that were edited but never
 *    summarized/indexed surface as "stale" and trigger the batch refresh
 *    button on the chapter management page. We also fall back to a
 *    timestamp comparison for chapters edited before the M3.1 migration.
 * 3. Missing: row absent (no summary, no chunks) and not dirty.
 * 4. Fresh: row exists, dirty bit clear.
 */
export function buildChapterStatus(args: BuildArgs): ChapterStatusView {
  const { chapter, summary, hasMemoryChunks, latestJob } = args;

  const isJobRunning = latestJob?.status === "running" || latestJob?.status === "pending";
  const isJobFailed = latestJob?.status === "failed";

  const summaryFreshness: ChapterFreshness = (() => {
    if (latestJob?.type === "summarize_chapter" && isJobRunning) return "running";
    if (latestJob?.type === "summarize_chapter" && isJobFailed) return "failed";
    // Dirty flag wins over missing: a chapter that was edited but never
    // summarized should show "stale", not "missing", so the batch
    // refresh button appears on the chapter management page.
    if (chapter.summary_dirty) return "stale";
    // Drafted but never summarised: treat as stale so the batch button picks it up.
    if (!summary) return chapter.content?.trim() ? "stale" : "missing";
    // NOTE: previously also compared summary.updated_at < chapter.updated_at
    // as a legacy fallback, but ChapterDraft.update() bumps updated_at on every
    // PATCH (title change, autosave, status flip) without setting summary_dirty,
    // which falsely re-staled every chapter after any non-content edit.
    // summary_dirty is now the authoritative signal — trust it.
    return "fresh";
  })();

  const indexFreshness: ChapterFreshness = (() => {
    if (latestJob?.type === "index_chapter" && isJobRunning) return "running";
    if (latestJob?.type === "index_chapter" && isJobFailed) return "failed";
    if (chapter.index_dirty) return "stale";
    // Drafted but never indexed: treat as stale so the batch button picks it up.
    if (!hasMemoryChunks) return chapter.content?.trim() ? "stale" : "missing";
    return "fresh";
  })();

  return {
    chapterId: chapter.id,
    chapterIndex: chapter.chapter_index,
    summary: summaryFreshness,
    index: indexFreshness,
    lastJobStatus: latestJob?.status,
    lastJobType: latestJob?.type,
    lastJobError: latestJob?.last_error ?? undefined,
  };
}

/**
 * Bulk computation across a novel — single query per table, then build
 * the per-chapter view in memory. Designed for the chapter management
 * page where we don't want N+1 queries.
 */
export async function getChapterStatusesForNovel(novelId: string): Promise<ChapterStatusView[]> {
  const [chapters, summaries, chunkCounts, jobs] = await Promise.all([
    prisma.chapterDraft.findMany({
      where: { novel_id: novelId },
      orderBy: { chapter_index: "asc" },
    }),
    prisma.chapterSummary.findMany({
      where: { chapter: { novel_id: novelId } },
    }),
    prisma.memoryChunk.groupBy({
      by: ["chapter_id"],
      where: { novel_id: novelId, chapter_id: { not: null } },
      _count: { _all: true },
    }),
    prisma.backgroundJob.findMany({
      where: { novel_id: novelId },
      orderBy: { created_at: "desc" },
    }),
  ]);

  const summaryByChapter = new Map(summaries.map((s) => [s.chapter_id, s]));
  const chunksByChapter = new Set(
    chunkCounts.filter((c) => c._count._all > 0).map((c) => c.chapter_id),
  );
  // Pick the latest job per chapter_id from the jobs payload field.
  const latestJobByChapter = new Map<string, BackgroundJob>();
  for (const job of jobs) {
    const payload = job.payload as { chapter_id?: string } | null;
    const chapterId = payload?.chapter_id;
    if (!chapterId) continue;
    if (!latestJobByChapter.has(chapterId)) latestJobByChapter.set(chapterId, job);
  }

  return chapters.map((chapter) =>
    buildChapterStatus({
      chapter,
      summary: summaryByChapter.get(chapter.id),
      hasMemoryChunks: chunksByChapter.has(chapter.id),
      latestJob: latestJobByChapter.get(chapter.id),
    }),
  );
}
