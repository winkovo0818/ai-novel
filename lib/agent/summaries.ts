import { prisma } from "@/lib/db";
import { chatCompletionWithRetry } from "@/lib/llm/client";
import { buildVolumeSummaryPrompt, buildNovelSummaryPrompt } from "@/lib/llm/prompts/tieredSummary";
import { getVolumes } from "@/lib/validation/schemas";
import { BibleDraftSchema } from "@/lib/validation/schemas";

export interface RefreshSummariesResult {
  refreshedVolumes: number[];
  novelSummaryUpdated: boolean;
}

/**
 * Refresh VolumeSummary and NovelSummary for a novel.
 *
 * Strategy:
 * - For each volume, if there are new chapter summaries not yet covered,
 *   regenerate the volume summary.
 * - If any volume summary was updated, regenerate the novel summary.
 * - A volume summary covers the chapters whose summaries exist at generation time.
 */
export async function refreshSummaries(novelId: string): Promise<RefreshSummariesResult> {
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    include: {
      bible: true,
      chapters: {
        orderBy: { chapter_index: "asc" },
        include: { summary: true },
      },
      volume_summaries: true,
      novel_summary: true,
    },
  });

  if (!novel || !novel.bible) {
    throw new Error("Novel or Bible not found");
  }

  const bible = BibleDraftSchema.safeParse(novel.bible.content);
  if (!bible.success) {
    throw new Error("Invalid Bible");
  }

  const volumes = getVolumes(bible.data);
  const refreshedVolumes: number[] = [];

  // Build a map of chapter_index -> summary text
  const chapterSummaryMap = new Map<number, string>();
  for (const chapter of novel.chapters) {
    if (chapter.summary) {
      chapterSummaryMap.set(chapter.chapter_index, chapter.summary.summary);
    }
  }

  // Refresh each volume summary
  for (let volIdx = 0; volIdx < volumes.length; volIdx++) {
    const volume = volumes[volIdx];
    const existingSummary = novel.volume_summaries.find((vs) => vs.volume_index === volIdx);

    // Collect chapter summaries for this volume
    const chapterSummaries = volume.chapters
      .map((ch) => chapterSummaryMap.get(ch.index))
      .filter((s): s is string => Boolean(s));

    if (chapterSummaries.length === 0) continue;

    // Check if we need to refresh:
    // - No existing summary
    // - Or covered chapters don't match current chapter summaries
    const needsRefresh =
      !existingSummary ||
      existingSummary.covered_chapters.length !== chapterSummaries.length ||
      !volume.chapters
        .filter((ch) => chapterSummaryMap.has(ch.index))
        .every((ch) => existingSummary.covered_chapters.includes(String(ch.index)));

    if (!needsRefresh) continue;

    const result = await chatCompletionWithRetry(
      {
        route: "/api/novels/:id/summaries/refresh",
        messages: buildVolumeSummaryPrompt({
          volumeIndex: volIdx + 1,
          volumeName: volume.name,
          chapterSummaries,
        }),
        temperature: 0,
        timeoutMs: 15_000,
      },
      1,
    );

    const covered_chapters = volume.chapters
      .filter((ch) => chapterSummaryMap.has(ch.index))
      .map((ch) => String(ch.index));

    await prisma.volumeSummary.upsert({
      where: { novel_id_volume_index: { novel_id: novelId, volume_index: volIdx } },
      create: {
        novel_id: novelId,
        volume_index: volIdx,
        summary: result.content.trim(),
        covered_chapters,
      },
      update: {
        summary: result.content.trim(),
        covered_chapters,
      },
    });

    refreshedVolumes.push(volIdx);
  }

  // Refresh novel summary if any volume was updated or no novel summary exists
  if (refreshedVolumes.length > 0 || !novel.novel_summary) {
    const updatedVolumeSummaries = await prisma.volumeSummary.findMany({
      where: { novel_id: novelId },
      orderBy: { volume_index: "asc" },
    });

    if (updatedVolumeSummaries.length > 0) {
      const result = await chatCompletionWithRetry(
        {
          route: "/api/novels/:id/summaries/refresh",
          messages: buildNovelSummaryPrompt({
            volumeSummaries: updatedVolumeSummaries.map((vs) => ({
              volumeIndex: vs.volume_index + 1,
              volumeName: volumes[vs.volume_index]?.name ?? `第${vs.volume_index + 1}卷`,
              summary: vs.summary,
            })),
          }),
          temperature: 0,
          timeoutMs: 15_000,
        },
        1,
      );

      await prisma.novelSummary.upsert({
        where: { novel_id: novelId },
        create: {
          novel_id: novelId,
          summary: result.content.trim(),
        },
        update: {
          summary: result.content.trim(),
        },
      });
    }
  }

  return {
    refreshedVolumes,
    novelSummaryUpdated: refreshedVolumes.length > 0 || !novel.novel_summary,
  };
}
