import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getRun, markNeedsReview } from "@/lib/agent/generationRun";
import { generationPolicy } from "@/lib/agent/generationPolicy";
import { planOutline } from "@/lib/agent/planOutline";
import { withLlmCallContext } from "@/lib/llm/callContext";
import { BibleDraftSchema, NovelProfileSchema, getAllChapters } from "@/lib/validation/schemas";
import { loadStoryMemory, syncStoryMemory, readRecentStoryProgress } from "@/lib/agent/storyMemory";
import { ensureVolumeArc } from "@/lib/agent/volumePlanStore";
import type { VolumeArc } from "@/lib/agent/volumePlan";
import { generationCallContext } from "@/lib/agent/generationExecution";
import { generationBudgetPause } from "@/lib/agent/generationBudget";
import type { JobExecution } from "./execution";

export async function handlePlanOutline(payload: Prisma.JsonValue, execution?: JobExecution) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || typeof payload.novel_id !== "string"
    || typeof payload.run_id !== "string" || typeof payload.target_chapters !== "number" || !Number.isInteger(payload.target_chapters)) {
    throw new Error("Invalid plan_outline payload");
  }
  const { novel_id, run_id, target_chapters } = payload;
  const run = await getRun(run_id);
  if (!run || run.novel_id !== novel_id) throw new Error("Planning run not found or belongs to another novel");
  if (run.status !== "planning" || run.total_chapters !== target_chapters) return;
  const budgetPause = generationBudgetPause(run);
  if (budgetPause) {
    await prisma.novelGenerationRun.updateMany({ where: { id: run_id, status: "planning" }, data: { status: "paused", ...budgetPause } });
    return;
  }
  const novel = await prisma.novel.findUnique({ where: { id: novel_id }, include: { bible: true } });
  if (!novel || novel.deleted_at || !novel.bible || novel.user_id !== run.user_id) throw new Error("Novel or Bible not available to run owner");
  const bible = BibleDraftSchema.parse(novel.bible.content);
  const profile = NovelProfileSchema.parse(novel.profile);
  const policy = generationPolicy(run.config);
  const covered = getAllChapters(bible).length;
  const batchTarget = Math.min(target_chapters, covered + policy.planning_window);
  const memory = await loadStoryMemory(novel_id, novel.bible, run.current_chapter);
  if (memory.stale_records || memory.historical_available === false) {
    await markNeedsReview(run_id, "历史记忆不可用或正文已修改，请校准剧情状态后再规划");
    return;
  }
  const planningBible = { ...bible, story_state: memory.state };
  const arcs: VolumeArc[] = [];
  const planned = await withLlmCallContext(generationCallContext({ runId: run_id, novelId: novel_id, userId: run.user_id, phase: "planning", execution }), async () => {
    for (let chapter = run.current_chapter + 1; chapter <= Math.max(batchTarget, run.current_chapter + 1);) {
      const arc = await ensureVolumeArc({ novelId: novel_id, runId: run_id, bible: planningBible, bibleUpdatedAt: novel.bible!.updated_at,
        currentChapter: run.current_chapter, chapter, total: target_chapters, continuous: policy.continuous, model: policy.model }, execution);
      arcs.push(arc); chapter = arc.end_chapter + 1;
    }
    const recentOutline = await prisma.novelOutlineChapter.findMany({ where: { novel_id, chapter_index: { lte: covered } }, orderBy: { chapter_index: "desc" }, take: 20 });
    const recentProgress = await readRecentStoryProgress(novel_id, run.current_chapter);
    return planOutline({ novelId: novel_id, bible, profile, targetChapters: batchTarget, storyState: memory.state,
      recentOutline: recentOutline.reverse(), recentProgress, volumePlans: arcs, continuous: policy.continuous, finalChapter: target_chapters, model: policy.model });
  });
  await prisma.$transaction(async tx => {
    await execution?.assertActive(tx);
    const locked = await tx.novelGenerationRun.updateMany({ where: { id: run_id, status: "planning", total_chapters: target_chapters },
      data: { updated_at: new Date() } });
    if (!locked.count) return;
    if (planned.addedChapters) {
      const updated = await tx.bibleDraft.update({ where: { novel_id, updated_at: novel.bible!.updated_at }, data: { content: planned.bible } });
      await syncStoryMemory(tx, novel_id, planned.bible, updated.updated_at, { kind: "outline_planner", chapterIndex: run.current_chapter });
    }
    const latest = await tx.novelGenerationRun.findUniqueOrThrow({ where: { id: run_id } });
    const pause = generationBudgetPause(latest);
    const capped = Boolean(pause);
    const needsPlanning = getAllChapters(planned.bible).length < target_chapters;
    const status = capped ? "paused" : needsPlanning ? "planning" : "running";
    await tx.novelGenerationRun.update({ where: { id: run_id }, data: { status, last_progress_at: new Date(), ...(pause ?? { last_error: null }) } });
    if (!capped) await tx.backgroundJob.create({ data: { novel_id, status: "pending", type: needsPlanning ? "plan_outline" : "generate_chapter",
      payload: { novel_id, run_id, ...(needsPlanning ? { target_chapters } : { chapter_index: latest.current_chapter + 1 }) } } });
    execution?.signal.throwIfAborted();
  });
}
