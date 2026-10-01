import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { BibleDraft } from "@/lib/validation/schemas";
import { planVolume, volumeBounds, VolumePlanSchema, type VolumeArc } from "./volumePlan";
import { readRecentStoryProgress } from "./storyMemory";
import type { JobExecution } from "@/lib/jobs/execution";

export async function readVolumeArc(novelId: string, chapter: number): Promise<VolumeArc | undefined> {
  const row = await prisma.novelVolumePlan.findFirst({ where: { novel_id: novelId, start_chapter: { lte: chapter }, end_chapter: { gte: chapter } }, orderBy: { volume_index: "desc" } });
  return row ? { volume_index: row.volume_index, start_chapter: row.start_chapter, end_chapter: row.end_chapter,
    planned_after_chapter: row.planned_after_chapter, plan: VolumePlanSchema.parse(row.content) } : undefined;
}

/** Saved one volume at a time so interruption does not discard an already paid-for plan. */
export async function ensureVolumeArc(input: { novelId: string; runId: string; bible: BibleDraft; bibleUpdatedAt: Date;
  currentChapter: number; chapter: number; total: number; continuous: boolean; model?: string }, execution?: JobExecution): Promise<VolumeArc> {
  const bounds = volumeBounds(input.bible, input.chapter, input.continuous, input.total);
  const existing = await readVolumeArc(input.novelId, input.chapter);
  if (existing && existing.end_chapter >= bounds.end_chapter) return existing;
  const recentOutline = await prisma.novelOutlineChapter.findMany({ where: { novel_id: input.novelId, chapter_index: { lte: input.currentChapter } }, orderBy: { chapter_index: "desc" }, take: 20 });
  const previous = await prisma.novelVolumePlan.findMany({ where: { novel_id: input.novelId, volume_index: { lt: bounds.volume_index } }, orderBy: { volume_index: "desc" }, take: 2 });
  const recentProgress = await readRecentStoryProgress(input.novelId, input.currentChapter);
  const plan = await planVolume({ novelId: input.novelId, bible: input.bible, ...bounds, current_chapter: input.currentChapter,
    recentProgress, recentOutline: recentOutline.reverse(), previousPlans: previous.reverse().map(r => VolumePlanSchema.parse(r.content)), model: input.model, continuous: input.continuous });
  return prisma.$transaction(async tx => {
    await execution?.assertActive(tx);
    const run = await tx.novelGenerationRun.findUnique({ where: { id: input.runId } });
    if (run?.status !== "planning" || run.total_chapters !== input.total) throw new Error("任务已暂停或规划终点已改变");
    const locked = await tx.novelGenerationRun.updateMany({ where: { id: input.runId, status: "planning", total_chapters: input.total }, data: { updated_at: new Date() } });
    if (!locked.count) throw new Error("卷规划任务状态已改变");
    const bible = await tx.bibleDraft.updateMany({ where: { novel_id: input.novelId, updated_at: input.bibleUpdatedAt }, data: { updated_at: input.bibleUpdatedAt } });
    if (!bible.count) throw new Error("卷规划期间作品设定已改变");
    const winner = await tx.novelVolumePlan.findUnique({ where: { novel_id_volume_index: { novel_id: input.novelId, volume_index: bounds.volume_index } } });
    if (winner && winner.end_chapter >= bounds.end_chapter) {
      execution?.signal.throwIfAborted();
      return { volume_index: winner.volume_index, start_chapter: winner.start_chapter, end_chapter: winner.end_chapter,
        planned_after_chapter: winner.planned_after_chapter, plan: VolumePlanSchema.parse(winner.content) };
    }
    await tx.novelVolumePlan.upsert({ where: { novel_id_volume_index: { novel_id: input.novelId, volume_index: bounds.volume_index } },
      create: { ...bounds, novel_id: input.novelId, planned_after_chapter: input.currentChapter, content: plan as Prisma.InputJsonValue, source_bible_updated_at: input.bibleUpdatedAt },
      update: { ...bounds, planned_after_chapter: input.currentChapter, content: plan as Prisma.InputJsonValue, source_bible_updated_at: input.bibleUpdatedAt } });
    execution?.signal.throwIfAborted();
    return { ...bounds, planned_after_chapter: input.currentChapter, plan };
  });
}
