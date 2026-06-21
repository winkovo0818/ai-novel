import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http/json";
import { evaluateNovelQuality, type QualityChapterInput } from "@/lib/evals/novelQuality";
import { BibleDraftSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/novels/:id/quality?chapter=N
 *
 * Returns the 7-dimension quality score for the sliding window
 * (N-2, N-1, N) around the given chapter index.
 */
export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const chapterParam = url.searchParams.get("chapter");
  const chapterIndex = chapterParam ? parseInt(chapterParam, 10) : undefined;

  if (chapterIndex == null || isNaN(chapterIndex) || chapterIndex < 1) {
    return jsonError("INVALID_INPUT", "chapter query parameter required (positive integer)", false, 400);
  }

  const novel = await prisma.novel.findUnique({
    where: { id },
    include: {
      bible: true,
      chapters: {
        where: {
          chapter_index: { lte: chapterIndex },
          status: "done",
        },
        orderBy: { chapter_index: "desc" },
        take: 3,
      },
    },
  });

  if (!novel || !novel.bible) {
    return jsonError("NOVEL_NOT_FOUND", "Novel or Bible not found", false, 404);
  }

  const bible = BibleDraftSchema.safeParse(novel.bible.content);
  if (!bible.success) {
    return jsonError("INVALID_INPUT", "Bible is invalid", false, 400);
  }

  const recentChapters = novel.chapters.reverse(); // oldest first
  if (recentChapters.length < 3) {
    return jsonOk({
      coldStart: true,
      chapterCount: recentChapters.length,
      message: `至少需要 3 章才能评估。当前已有 ${recentChapters.length} 章。`,
    });
  }

  const chapterInputs: QualityChapterInput[] = recentChapters.map((ch) => ({
    chapterIndex: ch.chapter_index,
    title: ch.title,
    content: ch.content,
  }));

  const report = evaluateNovelQuality({
    bible: bible.data,
    chapters: chapterInputs,
    fixtureId: `editor-window-${chapterIndex}`,
  });

  return jsonOk({
    coldStart: false,
    window: [recentChapters[0].chapter_index, recentChapters[1].chapter_index, recentChapters[2].chapter_index],
    overallScore: report.overallScore,
    maxScore: report.maxScore,
    scorePct: Math.round((report.overallScore / report.maxScore) * 1000) / 10,
    level: report.level,
    dimensions: report.metrics.map((m) => ({
      key: m.key,
      label: m.label,
      score: m.score,
      max: m.max,
      warnings: m.warnings,
    })),
  });
}
