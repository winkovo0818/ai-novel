import { generationBudgetPause } from "./generationBudget";
import { z } from "zod";
import type { Novel, BibleDraft as BibleRow } from "@prisma/client";
import { prisma } from "@/lib/db";
import { BibleDraftSchema, getAllChapters } from "@/lib/validation/schemas";
import { GenerationPolicySchema, generationPolicy, nextPlanningTarget } from "./generationPolicy";
import { ensureGenerationJob } from "./generationScheduling";

export class GenerationError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}

export const StartRequestSchema = GenerationPolicySchema.extend({
  total_chapters: z.number().int().min(1).max(80).default(40),
  revision_rounds: z.number().int().min(0).max(4).default(2),
  quality_floor: z.number().min(0).max(100).default(85),
  cost_cap_cny: z.number().finite().positive().optional(),
  checkpoint_mode: z.enum(["none", "per_volume", "on_fail"]).default("on_fail"),
}).superRefine((config, ctx) => {
  if (config.unlimited_budget && config.cost_cap_cny != null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "累计预算与不限预算不能同时启用" });
  }
  if (config.continuous && ((config.cost_cap_cny == null && !config.unlimited_budget) || config.checkpoint_mode === "none")) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "持续连载需要明确预算策略和质量检查点" });
  }
});

/** The request only commits durable intent; the worker plans and writes. */
export async function startGeneration(novel: Novel & { bible: BibleRow | null }, userId: string,
  config: z.infer<typeof StartRequestSchema>, source = "ui") {
  const id = novel.id;
  const created = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${id})::bigint)`;
    const active = await tx.novelGenerationRun.findFirst({
      where: { novel_id: id, status: { in: ["planning", "running", "paused", "needs_review"] } },
    });
    if (active) return { error: "RUN_ACTIVE" as const };
    const chapters = await tx.chapterDraft.findMany({ where: { novel_id: id }, orderBy: { chapter_index: "asc" } });
    let current = 0;
    for (const chapter of chapters) {
      if (chapter.chapter_index !== current + 1 || chapter.status !== "done" || !chapter.content.trim()) break;
      current = chapter.chapter_index;
    }
    if ((!config.continuous && current >= config.total_chapters) || (config.stop_after_chapter != null && current >= config.stop_after_chapter)) return { error: "ALREADY_COMPLETE" as const };
    if (chapters.some(c => c.chapter_index === current + 1 && c.content.trim())) return { error: "CHAPTER_NEEDS_REVIEW" as const };
    const run = await tx.novelGenerationRun.create({ data: {
      novel_id: id, user_id: userId, status: "planning", current_chapter: current,
      total_chapters: config.continuous ? Math.min(config.stop_after_chapter ?? 2_147_483_647, nextPlanningTarget(current, config.planning_window)) : config.total_chapters,
      revision_rounds: config.revision_rounds, quality_floor: config.quality_floor,
      checkpoint_mode: config.checkpoint_mode, cost_cap_cny: config.cost_cap_cny ?? null,
      config: { source, continuous: config.continuous, planning_window: config.planning_window,
        max_state_changes: config.max_state_changes,
        ...(config.unlimited_budget ? { unlimited_budget: true } : {}),
        ...(config.stop_after_chapter != null ? { stop_after_chapter: config.stop_after_chapter } : {}),
        ...(config.daily_cost_cap_cny != null ? { daily_cost_cap_cny: config.daily_cost_cap_cny } : {}),
        ...(config.model ? { model: config.model } : {}) },
    } });
    await tx.backgroundJob.create({ data: { type: "plan_outline", status: "pending", novel_id: id,
      payload: { novel_id: id, run_id: run.id, target_chapters: run.total_chapters } } });
    return { run };
  });
  if ("error" in created) throw new GenerationError(created.error!, "已有任务、正文待复核或目标章节已完成", 409);
  const run = created.run!;
  return { id: run.id, status: "planning", total_chapters: run.total_chapters, outline_cost_cny: 0 };
}

export async function resumeGeneration(id: string, runId: string, automatic = false, now = new Date()) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${id})::bigint)`;
    const latest = await tx.novelGenerationRun.findUniqueOrThrow({ where: { id: runId } });
    if (latest.novel_id !== id) return { error: "任务不属于当前作品" };
    if (automatic && (latest.status !== "paused" || !["daily_budget", "quota"].includes(latest.pause_reason ?? "") || !latest.resume_after || latest.resume_after > now)) {
      return { error: "该任务不能自动唤醒" };
    }
    const budgetPause = generationBudgetPause(latest, now);
    if (budgetPause) {
      if (automatic) await tx.novelGenerationRun.updateMany({ where: { id: runId, status: "paused", updated_at: latest.updated_at, pause_reason: latest.pause_reason, resume_after: latest.resume_after }, data: budgetPause });
      return { error: budgetPause.last_error };
    }
    if (!["paused", "needs_review", "running", "planning", "failed"].includes(latest.status)) return { error: "任务状态已改变" };
    const other = await tx.novelGenerationRun.findFirst({ where: { novel_id: id, id: { not: runId },
      status: { in: ["planning", "running", "paused", "needs_review"] } } });
    if (other) return { error: "当前作品已有其他活动任务，请先处理该任务" };
    if (latest.cost_cap_cny != null && latest.cost_cny_spent >= latest.cost_cap_cny) return { error: "费用已达到上限，请先提高累计预算" };
    const chapters = await tx.chapterDraft.findMany({ where: { novel_id: id }, orderBy: { chapter_index: "asc" } });
    let current = latest.current_chapter;
    const policy = generationPolicy(latest.config);
    while ((policy.continuous || current < latest.total_chapters) && current < (policy.stop_after_chapter ?? 2_147_483_647)) {
      const chapter = chapters.find(c => c.chapter_index === current + 1);
      if (!chapter || chapter.status !== "done" || !chapter.content.trim()) break;
      current++;
    }
    if (((!policy.continuous && current < latest.total_chapters) || policy.continuous) && current < (policy.stop_after_chapter ?? 2_147_483_647)) {
      const next = chapters.find(c => c.chapter_index === current + 1);
      if (next?.content.trim()) {
        const error = "请先审核下一章草稿并标记完成，或清空草稿后重新生成";
        if (automatic) await tx.novelGenerationRun.updateMany({ where: { id: runId, status: "paused", updated_at: latest.updated_at, pause_reason: latest.pause_reason, resume_after: latest.resume_after },
          data: { status: "needs_review", pause_reason: null, resume_after: null, last_error: error } });
        return { error };
      }
    }
    const total = policy.continuous && current >= latest.total_chapters
      ? Math.min(policy.stop_after_chapter ?? 2_147_483_647, nextPlanningTarget(current, policy.planning_window)) : latest.total_chapters;
    let status: "completed" | "planning" | "running" = "completed";
    if (current < total) {
      const row = await tx.bibleDraft.findUnique({ where: { novel_id: id } });
      const bible = BibleDraftSchema.safeParse(row?.content);
      if (!bible.success) return { error: "作品设定不合法，请修复后恢复" };
      const outline = getAllChapters(bible.data).sort((a, b) => a.index - b.index);
      if (outline.some((chapter, i) => chapter.index !== i + 1)) return { error: "大纲章节编号缺失或重复，请修复后恢复" };
      const outlined = outline.length;
      status = outlined < total ? "planning" : "running";
    }
    const locked = await tx.novelGenerationRun.updateMany({ where: { id: runId, status: latest.status, updated_at: latest.updated_at, pause_reason: latest.pause_reason, resume_after: latest.resume_after },
      data: { status, current_chapter: current, total_chapters: total, last_error: null, pause_reason: null, resume_after: null, last_progress_at: now } });
    if (!locked.count) return { error: "任务状态已改变" };
    await tx.backgroundJob.updateMany({ where: { novel_id: id, status: "pending", payload: { path: ["run_id"], equals: runId } }, data: { available_at: now } });
    await tx.novelGenerationAlert.updateMany({ where: { run_id: runId, resolved_at: null }, data: { resolved_at: now } });
    if (status !== "completed") await ensureGenerationJob(tx, { ...latest, status, current_chapter: current, total_chapters: total });
    return { status, current_chapter: current, total_chapters: total };
  });
}
