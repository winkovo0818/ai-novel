import type { NovelGenerationRun, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { runChapterPipeline, type ChapterPipelineResult } from "@/lib/agent/chapterPipeline";
import { addCost, advanceProgress, getRun, markCompleted, markNeedsReview, pause } from "@/lib/agent/generationRun";
import { evaluateChapterGate } from "@/lib/agent/qualityGate";
import { type QualityChapterInput } from "@/lib/evals/novelQuality";
import { chatCompletionWithRetry } from "@/lib/llm/client";
import { parseFirstJsonObject } from "@/lib/llm/extractJson";
import { buildStateDiffPrompt } from "@/lib/llm/prompts/stateDiff";
import { moderateContent } from "@/lib/moderation/moderate";
import { logInfo, logWarn } from "@/lib/observability/logger";
import { applyStateDiff, validateStateDiff } from "@/lib/validation/stateDiffMerge";
import { BibleDraftSchema, NovelProfileSchema, StateDiffSchema, type BibleDraft } from "@/lib/validation/schemas";
import { enqueueJob } from "./queue";

const STATE_DIFF_TIMEOUT_MS = 90_000;

export interface GenerateChapterPayload {
  novel_id: string;
  chapter_index: number;
  /** Overrides the pipeline's default self-revision rounds. */
  revision_rounds?: number;
  /**
   * When set, this chapter is part of an auto-pilot run: the handler advances
   * the run's progress/cost and chains the next chapter until completion.
   */
  run_id?: string;
}

export function isGenerateChapterPayload(p: unknown): p is GenerateChapterPayload {
  if (typeof p !== "object" || p === null) return false;
  const obj = p as { novel_id?: unknown; chapter_index?: unknown };
  return typeof obj.novel_id === "string" && typeof obj.chapter_index === "number";
}

/**
 * Run the state updater on a freshly written chapter and merge the diff into the
 * Bible. The diff feeds continuity context for later chapters but isn't what the
 * chapter persistence depends on — so a malformed / invalid diff is logged and
 * the prior Bible kept rather than aborting the run. (The spike saw ~25% diff
 * JSON-parse failures; one bad diff must not stop a 40-chapter book.)
 *
 * M0.2: a diff that parses but fails `validateStateDiff` (hallucinated entity /
 * thread status regression / oversized) is also skipped — unattended merges of
 * polluted state are inherited by every later chapter, so "state lags one
 * chapter" beats "state is wrong forever". Returns whether the merge happened
 * so the run loop can decide if a checkpoint review is warranted.
 */
async function applyChapterStateDiff(
  novelId: string,
  bible: BibleDraft,
  chapterIndex: number,
  title: string,
  content: string,
): Promise<{ merged: boolean; requiresReview?: boolean; rejectionReason?: string }> {
  let updated: BibleDraft;
  try {
    const result = await chatCompletionWithRetry({
      route: "/jobs/generate_chapter/state-diff",
      agent: "state_updater",
      novelId,
      messages: buildStateDiffPrompt({
        bible,
        storyState: bible.story_state,
        chapterIndex,
        chapterTitle: title,
        chapterContent: content,
      }),
      responseFormat: "json_object",
      temperature: 0,
      timeoutMs: STATE_DIFF_TIMEOUT_MS,
    });
    const diff = StateDiffSchema.safeParse(parseFirstJsonObject(result.content));
    if (!diff.success) {
      logWarn("generate_chapter.state_diff_invalid", { novel_id: novelId, chapter_index: chapterIndex });
      return { merged: false, rejectionReason: "状态变更 JSON 无法解析" };
    }
    const validationIssues = validateStateDiff(bible, diff.data, content);
    if (validationIssues.length > 0) {
      logWarn("generate_chapter.state_diff_rejected", {
        novel_id: novelId,
        chapter_index: chapterIndex,
        codes: validationIssues.map((issue) => issue.code).join(","),
        messages: validationIssues.map((issue) => issue.message).join(" | "),
      });
      return {
        merged: false,
        requiresReview: true,
        rejectionReason: validationIssues.map((issue) => issue.message).join("；"),
      };
    }
    updated = applyStateDiff(bible, diff.data, chapterIndex);
  } catch (err) {
    logWarn("generate_chapter.state_diff_failed", {
      novel_id: novelId,
      chapter_index: chapterIndex,
      error: err instanceof Error ? err.message : String(err),
    });
    return { merged: false, rejectionReason: "状态更新调用失败" };
  }
  await prisma.bibleDraft.update({ where: { novel_id: novelId }, data: { content: updated } });
  return { merged: true };
}

/**
 * Generate ONE chapter end-to-end, persist it, and — when part of an auto-pilot
 * run — gate it and chain the next chapter. Pipeline (draft → critic → revise) →
 * output moderation (violations never persist) → upsert → state diff → enqueue
 * post-processing. With a run_id it then advances progress/cost, enforces the
 * cost cap and quality gate, and either completes, halts for needs_review, or
 * enqueues the next chapter until total_chapters is reached.
 */
export async function handleGenerateChapter(payload: Prisma.JsonValue): Promise<void> {
  if (!isGenerateChapterPayload(payload)) throw new Error("Invalid generate_chapter payload");
  const { novel_id, chapter_index, run_id } = payload;

  const run = run_id ? await getRun(run_id) : null;
  if (run_id && !run) throw new Error(`generate_chapter: run ${run_id} not found`);
  // The run may have been paused/cancelled between this job being enqueued and
  // claimed — don't spend LLM tokens on a chapter the user no longer wants.
  if (run && (run.status === "paused" || run.status === "cancelled")) {
    logInfo("generate_chapter.run_inactive", { run_id, status: run.status, chapter_index });
    return;
  }

  const novel = await prisma.novel.findUnique({
    where: { id: novel_id },
    include: {
      bible: true,
      chapters: { orderBy: { chapter_index: "asc" }, include: { summary: true } },
      volume_summaries: { orderBy: { volume_index: "asc" } },
      novel_summary: true,
    },
  });
  if (!novel || !novel.bible) throw new Error(`generate_chapter: novel or bible not found for ${novel_id}`);

  const bible = BibleDraftSchema.safeParse(novel.bible.content);
  const profile = NovelProfileSchema.safeParse(novel.profile);
  if (!bible.success || !profile.success) {
    throw new Error(`generate_chapter: invalid bible/profile for ${novel_id}`);
  }

  const result = await runChapterPipeline({
    novelId: novel_id,
    bible: bible.data,
    profile: profile.data,
    chapters: novel.chapters,
    chapterIndex: chapter_index,
    revisionRounds: run?.revision_rounds ?? payload.revision_rounds,
    novelSummary: novel.novel_summary?.summary,
    volumeSummaries: novel.volume_summaries,
  });

  // T13 输出审核：违规正文绝不落库；auto-pilot 下挂起 needs_review 等人工处理。
  const moderation = await moderateContent({ route: "/jobs/generate_chapter", text: result.content, novelId: novel_id });
  if (!moderation.allowed) {
    logWarn("generate_chapter.moderation_blocked", { novel_id, chapter_index, reason: moderation.reason });
    if (run) await markNeedsReview(run.id, `第 ${chapter_index} 章触发内容审核：${moderation.reason ?? "MODERATION_BLOCKED"}`);
    return;
  }

  // Idempotent persist: the unique (novel_id, chapter_index) makes a re-run of
  // the same chapter overwrite instead of duplicating.
  const chapter = await prisma.chapterDraft.upsert({
    where: { novel_id_chapter_index: { novel_id, chapter_index } },
    create: { novel_id, chapter_index, title: result.title, content: result.content, status: "done" },
    update: { title: result.title, content: result.content, status: "done" },
  });

  const stateDiffOutcome = await applyChapterStateDiff(novel_id, bible.data, chapter_index, result.title, result.content);

  // Let RAG indexing and summaries catch up asynchronously — don't block.
  // These run even if the state diff was rejected below: the chapter itself
  // persisted, so leaving it unsummarized/unindexed would only add a second
  // problem for the human reviewer.
  await enqueueJob({ type: "summarize_chapter", payload: { chapter_id: chapter.id }, novelId: novel_id });
  await enqueueJob({ type: "index_chapter", payload: { novel_id, chapter_id: chapter.id }, novelId: novel_id });

  // M0.2: a diff rejected by validation (hallucinated entity / status
  // regression / oversized) means the story state is now knowingly stale.
  // Under a checkpoint mode the run pauses for human review — continuing to
  // chain chapters on top of stale state quietly degrades continuity. JSON
  // parse failures keep the old lenient behavior (~25% rate would halt every
  // run); only *semantic* rejections gate.
  if (run && stateDiffOutcome.requiresReview && run.checkpoint_mode !== "none") {
    await markNeedsReview(
      run.id,
      `第 ${chapter_index} 章状态变更被校验拒绝,未合并进 Bible:${stateDiffOutcome.rejectionReason ?? "未知原因"}`,
    );
    return;
  }

  if (run) {
    await finalizeRun(run, novel_id, novel.chapters, bible.data, chapter_index, result);
  }
}

/**
 * After a chapter persists in an auto-pilot run: record progress + spend, then
 * decide whether the chain continues. Halt conditions checked in order:
 *   1. cost cap exceeded → pause (resumable),
 *   2. quality gate failed on the last-3-chapter window → needs_review
 *      (only under a checkpoint mode; "none" logs and keeps going),
 *   3. last chapter reached → completed,
 * otherwise re-read the run (a pause/cancel may have landed while this chapter
 * was generating) and enqueue the next chapter.
 */
async function finalizeRun(
  run: NovelGenerationRun,
  novelId: string,
  priorChapters: Array<{ chapter_index: number; title: string | null; content: string }>,
  bible: BibleDraft,
  chapterIndex: number,
  result: ChapterPipelineResult,
): Promise<void> {
  await advanceProgress(run.id, chapterIndex);
  const afterCost = await addCost(run.id, result.cost.cny);

  // T13 成本上限：本章已落库，但累计花费超过硬上限就暂停（可 resume 续跑），不再链下一章。
  if (run.cost_cap_cny != null && afterCost.cost_cny_spent > run.cost_cap_cny) {
    const reason = `成本超上限：已花 ${afterCost.cost_cny_spent.toFixed(4)} 元 > 上限 ${run.cost_cap_cny} 元（停在第 ${chapterIndex} 章）`;
    await pause(run.id, reason);
    logWarn("generate_chapter.cost_cap_paused", {
      run_id: run.id,
      chapter_index: chapterIndex,
      spent: afterCost.cost_cny_spent,
      cap: run.cost_cap_cny,
    });
    return;
  }

  // T12 质量门：自修满 R 轮后，用末 3 章滑窗过门。on_fail / per_volume 下未达标即
  // 挂起人工复核并止链；none 模式只记录、继续跑（见 qualityGate 的冷启动/硬门说明）。
  // critic 的最终判定（result.criticIssues）作为第三类硬门并入：启发式分达标但 critic
  // 标记 critical 的章节会被拦下，零额外 LLM 成本（critic 已在 pipeline 跑过）。
  const gate = evaluateChapterGate(buildQualityWindow(priorChapters, chapterIndex, result), bible, {
    qualityFloor: run.quality_floor,
    criticIssues: result.criticIssues,
  });
  if (!gate.pass) {
    if (run.checkpoint_mode === "none") {
      logWarn("generate_chapter.gate_failed_continue", { run_id: run.id, chapter_index: chapterIndex, reason: gate.reason });
    } else {
      await markNeedsReview(run.id, `第 ${chapterIndex} 章质量门未过：${gate.reason}`);
      logWarn("generate_chapter.gate_failed_review", {
        run_id: run.id,
        chapter_index: chapterIndex,
        score_pct: gate.scorePct,
        reason: gate.reason,
      });
      return;
    }
  }

  if (chapterIndex >= run.total_chapters) {
    await markCompleted(run.id);
    return;
  }

  const latest = await getRun(run.id);
  if (latest && (latest.status === "paused" || latest.status === "cancelled")) {
    logInfo("generate_chapter.chain_halted", { run_id: run.id, status: latest.status, chapter_index: chapterIndex });
    return;
  }

  await enqueueJob({
    type: "generate_chapter",
    payload: { novel_id: novelId, chapter_index: chapterIndex + 1, run_id: run.id },
    novelId,
  });
}

/**
 * Build the quality gate's scoring window: prior persisted chapters before this
 * index plus the one just written, capped to the last 3 so continuity is scored
 * on a local window rather than the whole book.
 */
function buildQualityWindow(
  priorChapters: Array<{ chapter_index: number; title: string | null; content: string }>,
  chapterIndex: number,
  result: ChapterPipelineResult,
): QualityChapterInput[] {
  const window: QualityChapterInput[] = priorChapters
    .filter((c) => c.chapter_index < chapterIndex)
    .map((c) => ({ chapterIndex: c.chapter_index, title: c.title ?? "", content: c.content }));
  window.push({ chapterIndex, title: result.title, content: result.content });
  return window.slice(-3);
}
