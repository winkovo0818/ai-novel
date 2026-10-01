import { generationBudgetPause } from "./generationBudget";
import type { NovelGenerationRun, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/** Identify one stage so an older finishing lease cannot suppress its successor. */
export function generationJobWhere(run: NovelGenerationRun): Prisma.BackgroundJobWhereInput {
  const planning = run.status === "planning";
  return { novel_id: run.novel_id, type: planning ? "plan_outline" : "generate_chapter", AND: [
    { payload: { path: ["run_id"], equals: run.id } },
    { payload: { path: [planning ? "target_chapters" : "chapter_index"], equals: planning ? run.total_chapters : run.current_chapter + 1 } },
  ] };
}

/** Caller holds the per-novel advisory lock (or the run row lock). */
export async function ensureGenerationJob(tx: Prisma.TransactionClient, run: NovelGenerationRun) {
  const where = generationJobWhere(run);
  const inflight = await tx.backgroundJob.findFirst({ where: { ...where, status: { in: ["pending", "running"] } } });
  if (inflight) return false;
  const planning = run.status === "planning";
  await tx.backgroundJob.create({ data: { novel_id: run.novel_id, type: planning ? "plan_outline" : "generate_chapter", status: "pending",
    payload: { novel_id: run.novel_id, run_id: run.id,
      ...(planning ? { target_chapters: run.total_chapters } : { chapter_index: run.current_chapter + 1 }) } } });
  return true;
}

/** Repair interrupted chains, but never restart paused or exhausted runs. */
export async function reconcileGenerationRuns(novelId?: string) {
  const runs = await prisma.novelGenerationRun.findMany({ where: { status: { in: ["planning", "running"] },
    ...(novelId ? { novel_id: novelId } : {}) }, select: { id: true, novel_id: true } });
  let repaired = 0;
  for (const candidate of runs) {
    repaired += await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${candidate.novel_id})::bigint)`;
      const run = await tx.novelGenerationRun.findUnique({ where: { id: candidate.id } });
      if (!run || !["planning", "running"].includes(run.status)) return 0;
      // Row lock also serializes reconciliation with a finishing handler.
      const locked = await tx.novelGenerationRun.updateMany({ where: { id: run.id, status: run.status, current_chapter: run.current_chapter, total_chapters: run.total_chapters },
        data: { updated_at: new Date() } });
      if (!locked.count) return 0;
      const where = generationJobWhere(run);
      const inflight = await tx.backgroundJob.findFirst({ where: { ...where, status: { in: ["pending", "running"] } } });
      if (inflight) return 0;
      const last = await tx.backgroundJob.findFirst({ where, orderBy: { created_at: "desc" } });
      if (last?.status === "failed") {
        await tx.novelGenerationRun.update({ where: { id: run.id }, data: { status: "failed", last_error: last.last_error ?? "后台任务已耗尽重试，请检查后恢复" } });
        return 1;
      }
      const budgetPause = generationBudgetPause(run);
      if (budgetPause) {
        await tx.novelGenerationRun.update({ where: { id: run.id }, data: { status: "paused", ...budgetPause } });
        return 1;
      }
      return await ensureGenerationJob(tx, run) ? 1 : 0;
    });
  }
  return repaired;
}
