import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runChapterPipeline, type ChapterPipelineResult } from "@/lib/agent/chapterPipeline";
import { getRun, markNeedsReview } from "@/lib/agent/generationRun";
import { generationPolicy, nextPlanningTarget } from "@/lib/agent/generationPolicy";
import { evaluateChapterGate } from "@/lib/agent/qualityGate";
import type { QualityChapterInput } from "@/lib/evals/novelQuality";
import { chatCompletionWithRetry } from "@/lib/llm/client";
import { withLlmCallContext } from "@/lib/llm/callContext";
import { parseFirstJsonObject } from "@/lib/llm/extractJson";
import { buildStateDiffPrompt } from "@/lib/llm/prompts/stateDiff";
import { moderateContent } from "@/lib/moderation/moderate";
import { applyStateDiff, validateStateDiff } from "@/lib/validation/stateDiffMerge";
import { BibleDraftSchema, NovelProfileSchema, StateDiffSchema, getAllChapters, getVolumes, type BibleDraft } from "@/lib/validation/schemas";
import { loadStoryMemory, mergeRecalledState, syncStoryMemory } from "@/lib/agent/storyMemory";
import { readVolumeArc } from "@/lib/agent/volumePlanStore";
import { overduePayoffs } from "@/lib/agent/volumePlan";
import { generationCallContext } from "@/lib/agent/generationExecution";
import { generationBudgetPause } from "@/lib/agent/generationBudget";
import { JobDeferredError } from "./deferred";
import type { JobExecution } from "./execution";

export interface GenerateChapterPayload {
  novel_id: string;
  chapter_index: number;
  revision_rounds?: number;
  run_id?: string;
}
export function isGenerateChapterPayload(p: unknown): p is GenerateChapterPayload {
  if (typeof p !== "object" || p === null) return false;
  const o = p as Partial<GenerateChapterPayload>;
  return typeof o.novel_id === "string" && Number.isInteger(o.chapter_index) && (o.chapter_index ?? 0) > 0;
}

/** No state is written until the chapter, verdict, and state update are ready. */
async function chapterStateDiff(novelId: string, bible: BibleDraft, result: ChapterPipelineResult, model?: string, storyState = bible.story_state, maxStateChanges?: number) {
  try {
    const response = await chatCompletionWithRetry({
      route: "/jobs/generate_chapter/state-diff", agent: "state_updater", novelId,
      model,
      messages: buildStateDiffPrompt({ bible, storyState,
        chapterIndex: result.chapterIndex, chapterTitle: result.title, chapterContent: result.content }),
      responseFormat: "json_object", temperature: 0, timeoutMs: 90_000,
    });
    const diff = StateDiffSchema.safeParse(parseFirstJsonObject(response.content));
    if (!diff.success) return { reason: "状态变更 JSON 无法解析" };
    const issues = validateStateDiff(bible, diff.data, result.content, maxStateChanges != null ? { maxStateChanges } : undefined);
    if (issues.length) return { reason: issues.map(i => i.message).join("；") };
    return { bible: applyStateDiff(bible, diff.data, result.chapterIndex) };
  } catch (error) {
    if (error instanceof JobDeferredError) throw error;
    return { reason: error instanceof Error ? error.message : "状态更新失败" };
  }
}

export async function handleGenerateChapter(payload: Prisma.JsonValue, execution?: JobExecution): Promise<void> {
  if (!isGenerateChapterPayload(payload)) throw new Error("Invalid generate_chapter payload");
  const { novel_id, chapter_index, run_id } = payload;
  const run = run_id ? await getRun(run_id) : null;
  if (run_id && !run) throw new Error(`generate_chapter: run ${run_id} not found`);
  if (run && (run.status !== "running" || run.current_chapter >= chapter_index)) return;
  if (run && chapter_index !== run.current_chapter + 1) throw new Error("Generation chapter is out of order");
  if (run && run.novel_id !== novel_id) throw new Error("Generation run belongs to another novel");
  const policy = generationPolicy(run?.config);
  const novel = await prisma.novel.findUnique({
    where: { id: novel_id }, include: {
      bible: true, chapters: { where: { chapter_index: { gte: Math.max(1, chapter_index - 20) } },
        orderBy: { chapter_index: "asc" }, include: { summary: true } },
      volume_summaries: { orderBy: { volume_index: "asc" } }, novel_summary: true,
    },
  });
  if (!novel || novel.deleted_at || !novel.bible) throw new Error("Novel or Bible not found");
  const bible = BibleDraftSchema.parse(novel.bible.content);
  const profile = NovelProfileSchema.parse(novel.profile);
  const existing = novel.chapters.find(c => c.chapter_index === chapter_index);
  if (existing?.content.trim()) {
    if (run) await markNeedsReview(run.id, `第 ${chapter_index} 章已有正文，请确认后继续，自动生成不会覆盖已有内容`);
    return;
  }
  const arc = await readVolumeArc(novel_id, chapter_index);
  const memory = await loadStoryMemory(novel_id, novel.bible, chapter_index - 1, arc?.plan.thread_targets);
  if (memory.stale_records || memory.historical_available === false) {
    if (run) await markNeedsReview(run.id, "历史正文已修改，请校准剧情状态后再继续");
    return;
  }
  const recalledBible = mergeRecalledState(bible, memory.state);
  const userId = run?.user_id ?? novel.user_id ?? undefined;
  await withLlmCallContext(generationCallContext({ runId: run?.id, novelId: novel_id, userId, phase: "running", execution }), async () => {
    const result = await runChapterPipeline({
      model: policy.model,
      novelId: novel_id, userId, signal: execution?.signal, bible: { ...bible, story_state: memory.state }, volumeArc: arc, profile, chapters: novel.chapters,
      chapterIndex: chapter_index, revisionRounds: run?.revision_rounds ?? payload.revision_rounds,
      novelSummary: novel.novel_summary?.summary, volumeSummaries: novel.volume_summaries,
    });
    const moderation = await moderateContent({ route: "/jobs/generate_chapter", text: result.content, userId, novelId: novel_id });
    if (!moderation.allowed) {
      if (run) await markNeedsReview(run.id, `第 ${chapter_index} 章触发内容审核：${moderation.reason ?? "MODERATION_BLOCKED"}`);
      return;
    }
    const gate = evaluateChapterGate(buildQualityWindow(novel.chapters, chapter_index, result, bible), bible, {
      qualityFloor: run?.quality_floor, criticIssues: result.criticIssues,
    });
    // Failed output remains an editable draft; it never receives done status.
    let state = gate.pass ? await chapterStateDiff(novel_id, recalledBible, result, policy.model, memory.state, policy.max_state_changes) : { reason: gate.reason };
    const overdue = state.bible ? overduePayoffs(arc, state.bible.story_state, chapter_index) : [];
    if (overdue.length) state = { reason: `本章已到线索回收期限：${overdue.join("、")}` };
    const accepted = gate.pass && Boolean(state.bible);
    try {
      await prisma.$transaction(async tx => {
        await execution?.assertActive(tx);
        if (run) {
          const locked = await tx.novelGenerationRun.updateMany({
            where: { id: run.id, status: "running", current_chapter: run.current_chapter },
            data: { updated_at: new Date() },
          });
          if (!locked.count) return; // pause, cancel or another execution won
        }
        const data = { title: result.title, content: result.content, status: accepted ? "done" : "draft",
          summary_dirty: true, index_dirty: true };
        const chapter = existing
          ? await tx.chapterDraft.update({ where: { id: existing.id, version: existing.version, content: existing.content },
              data: { ...data, version: { increment: 1 } } })
          : await tx.chapterDraft.create({ data: { ...data, novel_id, chapter_index } });
        if (existing) await tx.chapterVersion.create({ data: {
          chapter_id: existing.id, title: existing.title, content: existing.content, status: existing.status, source: "ai",
        } });
        if (state.bible) {
          const updated = await tx.bibleDraft.update({ where: { novel_id, updated_at: novel.bible!.updated_at }, data: { content: state.bible } });
          await syncStoryMemory(tx, novel_id, state.bible, updated.updated_at, { kind: "generated_chapter", chapterIndex: chapter_index, chapterId: chapter.id, chapterVersion: chapter.version });
        }
        for (const type of ["summarize_chapter", "index_chapter"] as const) {
          await tx.backgroundJob.create({ data: { type, novel_id, status: "pending",
            payload: { novel_id, chapter_id: chapter.id, ...(run_id ? { run_id } : {}) } } });
        }
        if (run) {
          const latest = await tx.novelGenerationRun.findUniqueOrThrow({ where: { id: run.id } });
          const budgetPause = generationBudgetPause(latest);
          const overBudget = Boolean(budgetPause);
          const atVolumeEnd = getVolumes(bible).some(v => v.chapters.at(-1)?.index === chapter_index && (!policy.continuous || v.chapters.length >= 80));
          const horizonReached = chapter_index >= run.total_chapters;
          const completed = (!policy.continuous && (accepted || run.checkpoint_mode === "none") && horizonReached)
            || (policy.continuous && accepted && policy.stop_after_chapter != null && chapter_index >= policy.stop_after_chapter);
          const needsReview = !accepted && (policy.continuous || run.checkpoint_mode !== "none");
          const paused = !completed && (overBudget || (run.checkpoint_mode === "per_volume" && atVolumeEnd));
          const planning = policy.continuous && horizonReached && !paused && !needsReview;
          const total = planning ? Math.min(policy.stop_after_chapter ?? 2_147_483_647, nextPlanningTarget(chapter_index, policy.planning_window)) : run.total_chapters;
          const status = needsReview ? "needs_review" : completed ? "completed" : paused ? "paused" : planning ? "planning" : "running";
          await tx.novelGenerationRun.update({ where: { id: run.id }, data: {
            status, ...((accepted || (!policy.continuous && run.checkpoint_mode === "none")) ? { current_chapter: chapter_index } : {}),
            ...(planning ? { total_chapters: total } : {}),
            ...(accepted ? { last_progress_at: new Date() } : {}),
            ...(status === "paused" ? { pause_reason: budgetPause?.pause_reason ?? "volume_review", resume_after: budgetPause?.resume_after ?? null } : {}),
            last_error: needsReview ? `第 ${chapter_index} 章需要复核：${state.reason ?? gate.reason}`
              : overBudget ? budgetPause!.last_error : paused ? "本卷已完成，请复核后继续" : null,
          } });
          if (status === "running" || status === "planning") await tx.backgroundJob.create({ data: {
            type: planning ? "plan_outline" : "generate_chapter", novel_id, status: "pending",
            payload: { novel_id, ...(planning ? { target_chapters: total } : { chapter_index: chapter_index + 1 }), run_id: run.id },
          } });
        }
        execution?.signal.throwIfAborted();
      });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && ["P2002", "P2025"].includes(String(error.code))) {
        if (run) await markNeedsReview(run.id, `第 ${chapter_index} 章或作品设定已被修改，生成结果未覆盖原文`);
        return;
      }
      throw error;
    }
  });
}

function buildQualityWindow(
  priorChapters: Array<{ chapter_index: number; title: string | null; content: string }>,
  chapterIndex: number,
  result: ChapterPipelineResult,
  bible: BibleDraft,
): QualityChapterInput[] {
  // outlineSummary 让 continuity 维度的「大纲关键词重合」子项能正常计分；
  // rawCleanupHits 让 ai_voice 维度感知模型原始输出的 AI 痕迹（清洗前）。
  const outlineByIndex = new Map(getAllChapters(bible).map((c) => [c.index, c.summary ?? ""]));
  const window: QualityChapterInput[] = priorChapters
    .filter((c) => c.chapter_index < chapterIndex)
    .map((c) => ({
      chapterIndex: c.chapter_index,
      title: c.title ?? "",
      content: c.content,
      outlineSummary: outlineByIndex.get(c.chapter_index),
    }));
  window.push({
    chapterIndex,
    title: result.title,
    content: result.content,
    outlineSummary: outlineByIndex.get(chapterIndex),
    rawCleanupHits: result.rawCleanupHits,
  });
  return window.slice(-3);
}
