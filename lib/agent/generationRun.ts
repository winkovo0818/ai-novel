import { generationBudgetDay } from "./generationBudget";
import { prisma } from "@/lib/db";
import type { NovelGenerationRun, Prisma } from "@prisma/client";

export type RunStatus =
  | "planning"
  | "running"
  | "paused"
  | "needs_review"
  | "completed"
  | "failed"
  | "cancelled";

export type CheckpointMode = "none" | "per_volume" | "on_fail";

export interface CreateRunInput {
  novelId: string;
  userId: string;
  totalChapters: number;
  /** Max self-revision passes per chapter. Default 2. */
  revisionRounds?: number;
  /** Percent quality floor (0-100). Default 85. */
  qualityFloor?: number;
  /** When to pause for human review. Default "on_fail". */
  checkpointMode?: CheckpointMode;
  /** Spend threshold checked before calls; in-flight calls can exceed it. null = no cap. */
  costCapCny?: number | null;
  /** Free-form run config (model, target_words, ...). */
  config?: Prisma.InputJsonValue;
}

/**
 * Lifecycle helpers for a NovelGenerationRun — the run-level state the
 * self-chaining generate_chapter jobs read/update between chapters. Kept as
 * thin, single-purpose functions so the handler and CLI launcher share one
 * source of truth for the run state machine
 * (planning → running → paused | needs_review | completed | failed | cancelled).
 */
export function createRun(input: CreateRunInput): Promise<NovelGenerationRun> {
  return prisma.novelGenerationRun.create({
    data: {
      novel_id: input.novelId,
      user_id: input.userId,
      status: "planning",
      total_chapters: input.totalChapters,
      revision_rounds: input.revisionRounds ?? 2,
      quality_floor: input.qualityFloor ?? 85,
      checkpoint_mode: input.checkpointMode ?? "on_fail",
      cost_cap_cny: input.costCapCny ?? null,
      config: input.config ?? {},
    },
  });
}

export function getRun(runId: string): Promise<NovelGenerationRun | null> {
  return prisma.novelGenerationRun.findUnique({ where: { id: runId } });
}

function update(runId: string, data: Prisma.NovelGenerationRunUpdateInput): Promise<NovelGenerationRun> {
  return prisma.novelGenerationRun.update({ where: { id: runId }, data });
}

/** planning → running, once outline planning is done and the chain is about to start. */
export function markRunning(runId: string): Promise<NovelGenerationRun> {
  return update(runId, { status: "running", last_error: null, pause_reason: null, resume_after: null });
}

/**
 * Record that chapters up to and including chapterIndex are persisted. Uses set
 * (not increment) so re-running the same chapter after a retry stays idempotent
 * and resume can read current_chapter as ground truth.
 */
export function advanceProgress(runId: string, chapterIndex: number): Promise<NovelGenerationRun> {
  return update(runId, { current_chapter: chapterIndex });
}

/**
 * Accumulate spend. Returns the updated row so the caller can compare
 * cost_cny_spent against cost_cap_cny and pause when the budget is exceeded.
 */
export async function addCost(runId: string, cny: number, now = new Date()): Promise<NovelGenerationRun> {
  if (!Number.isFinite(cny) || cny < 0) throw new Error("Invalid generation cost");
  const day = generationBudgetDay(now);
  return prisma.$transaction(async tx => {
    // Updating total first acquires the row lock before the day reset decision.
    const run = await tx.novelGenerationRun.update({ where: { id: runId }, data: { cost_cny_spent: { increment: cny } } });
    if (run.cost_day && run.cost_day > day) return run; // A late prior-day receipt must not reset today's counter.
    return tx.novelGenerationRun.update({ where: { id: runId }, data: {
      cost_day: day,
      daily_cost_cny_spent: run.cost_day === day ? { increment: cny } : cny,
    } });
  });
}

export function pause(runId: string, reason?: string): Promise<NovelGenerationRun> {
  return update(runId, { status: "paused", pause_reason: "manual", resume_after: null, ...(reason ? { last_error: reason } : {}) });
}

export function resume(runId: string): Promise<NovelGenerationRun> {
  return update(runId, { status: "running", last_error: null, pause_reason: null, resume_after: null });
}

export function cancel(runId: string): Promise<NovelGenerationRun> {
  return update(runId, { status: "cancelled", pause_reason: null, resume_after: null });
}

export async function markNeedsReview(runId: string, reason: string): Promise<NovelGenerationRun> {
  await prisma.novelGenerationRun.updateMany({ where: { id: runId, status: { in: ["running", "planning"] } },
    data: { status: "needs_review", last_error: reason, pause_reason: null, resume_after: null } });
  return prisma.novelGenerationRun.findUniqueOrThrow({ where: { id: runId } });
}

export function markCompleted(runId: string): Promise<NovelGenerationRun> {
  return update(runId, { status: "completed", last_error: null, pause_reason: null, resume_after: null });
}

export function markFailed(runId: string, error: string): Promise<NovelGenerationRun> {
  return update(runId, { status: "failed", pause_reason: null, resume_after: null, last_error: error.slice(0, 1000) });
}
