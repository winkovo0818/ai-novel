import { ZodError } from "zod";
import { logWarn, errorMessage } from "@/lib/observability/logger";
import { prisma } from "@/lib/db";
import { resumeGeneration } from "./autoGeneration";

/** Only resource pauses carry a timer. Manual pauses and review never auto-resume. */
export async function wakeScheduledGenerationRuns(novelId?: string, now = new Date()) {
  let woken = 0;
  let cursor: string | undefined;
  while (true) {
    const due = await prisma.novelGenerationRun.findMany({
      where: { status: "paused", pause_reason: { in: ["daily_budget", "quota"] }, resume_after: { lte: now },
        ...(novelId ? { novel_id: novelId } : {}) },
      orderBy: { id: "asc" }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: { id: true, novel_id: true, user_id: true, updated_at: true },
    });
    for (const run of due) {
      const novel = await prisma.novel.findUnique({ where: { id: run.novel_id }, select: { deleted_at: true, user_id: true } });
      if (!novel || novel.deleted_at || novel.user_id !== run.user_id) {
        await prisma.novelGenerationRun.updateMany({ where: { id: run.id, status: "paused", pause_reason: { in: ["daily_budget", "quota"] } },
          data: { status: "cancelled", pause_reason: null, resume_after: null, last_error: "作品已移除或归属已改变，已停止自动唤醒" } });
        continue;
      }
      try {
        const resumed = await resumeGeneration(run.novel_id, run.id, true, now);
        if (!("error" in resumed)) woken++;
      } catch (error) {
        if (error instanceof ZodError) {
          await prisma.novelGenerationRun.updateMany({where: {id: run.id, updated_at: run.updated_at, status: "paused", pause_reason: {in: ["daily_budget", "quota"]}},
            data: {status: "needs_review", pause_reason: null, resume_after: null, last_error: "连载配置不合法，请修复后恢复"}});
        } else logWarn("generation.wakeup_failed", {run_id: run.id, error: errorMessage(error)});
      }
    }
    if (due.length < 100) break;
    cursor = due.at(-1)!.id;
  }
  return woken;
}
