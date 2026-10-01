import type { NovelGenerationRun } from "@prisma/client";
import { prisma } from "@/lib/db";
import { JobDeferredError } from "@/lib/jobs/deferred";
import type { JobExecution } from "@/lib/jobs/execution";
import type { LlmCallContext } from "@/lib/llm/callContext";
import type { QuotaCheck } from "@/lib/llm/usage";
import { addCost, getRun } from "./generationRun";
import { generationBudgetPause } from "./generationBudget";

type Phase = "planning" | "running" | "postprocessing";

export async function enforceGenerationBudget(run: NovelGenerationRun, postprocessing = false) {
  const pause = generationBudgetPause(run, new Date(), postprocessing);
  if (!pause) return;
  if (["planning", "running"].includes(run.status)) {
    const changed = await prisma.novelGenerationRun.updateMany({
      where: { id: run.id, status: run.status }, data: { status: "paused", ...pause },
    });
    if (!changed.count) throw new Error("生成任务状态已改变");
  }
  throw new JobDeferredError(pause.resume_after, pause.last_error);
}

async function deferForQuota(runId: string, quota: QuotaCheck) {
  const daily = ["daily_cost", "daily_calls"].includes(quota.limitType ?? "");
  const monthly = ["monthly_cost", "monthly_calls"].includes(quota.limitType ?? "");
  if (!daily && !monthly) return; // Permanent/configuration errors retain ordinary failure handling.
  const reset = new Date(daily ? quota.nextDailyResetAt : quota.nextMonthlyResetAt);
  if (!Number.isFinite(reset.getTime()) || reset.getTime() <= Date.now()) return;
  await prisma.novelGenerationRun.updateMany({
    where: { id: runId, status: { in: ["planning", "running"] } },
    data: { status: "paused", pause_reason: "quota", resume_after: reset, last_error: quota.reason ?? "调用配额已用尽，等待配额重置" },
  });
  throw new JobDeferredError(reset, quota.reason ?? "等待调用配额重置");
}

/** Shared by planning, writing, summaries and embeddings. */
export function generationCallContext(input: {
  runId?: string; novelId: string; userId?: string; phase: Phase; execution?: JobExecution;
}): LlmCallContext {
  return {
    userId: input.userId, novelId: input.novelId, signal: input.execution?.signal, enforceQuota: true,
    beforeCall: async () => {
      await input.execution?.assertActive();
      if (!input.runId) return;
      const latest = await getRun(input.runId);
      if (!latest || latest.novel_id !== input.novelId) throw new Error("生成任务不存在或不属于当前作品");
      if (input.phase !== "postprocessing" && latest.status !== input.phase) {
        if (latest.status === "paused" && ["daily_budget", "quota"].includes(latest.pause_reason ?? "") && latest.resume_after) {
          throw new JobDeferredError(latest.resume_after, latest.last_error ?? "等待预算或配额重置");
        }
        throw new Error("Generation run is no longer running or planning");
      }
      await enforceGenerationBudget(latest, input.phase === "postprocessing");
    },
    onCost: input.runId ? async cny => { await addCost(input.runId!, cny); } : undefined,
    onQuotaBlocked: input.runId ? quota => deferForQuota(input.runId!, quota) : undefined,
  };
}
