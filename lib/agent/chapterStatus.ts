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
 * 2. Missing: row absent (no summary, no chunks).
 * 3. Stale: M3.1 dirty bit is true (PATCH set it on content change). We
 *    fall back to a timestamp comparison so chapters edited *before* the
 *    M3.1 migration backfill ran don't silently appear fresh.
 * 4. Fresh: row exists, dirty bit clear, timestamps look in order.
 */
export function buildChapterStatus(args: BuildArgs): ChapterStatusView {
  const { chapter, summary, hasMemoryChunks, latestJob } = args;

  const isJobRunning = latestJob?.status === "running" || latestJob?.status === "pending";
  const isJobFailed = latestJob?.status === "failed";

  const summaryFreshness: ChapterFreshness = (() => {
    if (latestJob?.type === "summarize_chapter" && isJobRunning) return "running";
    if (latestJob?.type === "summarize_chapter" && isJobFailed) return "failed";
    if (!summary) return "missing";
    if (chapter.summary_dirty) return "stale";
    if (summary.updated_at < chapter.updated_at) return "stale";
    return "fresh";
  })();

  const indexFreshness: ChapterFreshness = (() => {
    if (latestJob?.type === "index_chapter" && isJobRunning) return "running";
    if (latestJob?.type === "index_chapter" && isJobFailed) return "failed";
    if (!hasMemoryChunks) return "missing";
    if (chapter.index_dirty) return "stale";
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
