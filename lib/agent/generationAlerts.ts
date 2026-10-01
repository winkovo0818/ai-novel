import type { NovelGenerationRun } from "@prisma/client";
import { prisma } from "@/lib/db";

type AlertKind = "review" | "failed" | "budget" | "stalled";
export function generationAlert(run: NovelGenerationRun, now = new Date()): { kind: AlertKind; message: string } | null {
  if (run.status === "needs_review" || (run.status === "paused" && run.pause_reason === "volume_review")) {
    return { kind: "review", message: run.last_error ?? "连载需要人工复核，请处理后恢复" };
  }
  if (run.status === "failed") return { kind: "failed", message: run.last_error ?? "连载任务失败，请检查后恢复" };
  if (run.status === "paused" && run.pause_reason === "total_budget") return { kind: "budget", message: run.last_error ?? "累计预算已用尽，请提高预算后恢复" };
  const configured = Number(process.env.GENERATION_STALL_ALERT_MS ?? 30 * 60_000);
  const stallMs = Number.isFinite(configured) && configured >= 60_000 ? configured : 30 * 60_000;
  if (["running", "planning"].includes(run.status) && now.getTime() - run.last_progress_at.getTime() >= stallMs) {
    return { kind: "stalled", message: "连载长时间没有推进，请检查 worker、模型服务和后台任务" };
  }
  return null;
}

/** One active alert of each kind; acknowledgement survives repeated sweeps. */
export async function reconcileGenerationAlerts(novelId?: string, now = new Date()) {
  let cursor: string | undefined;
  while (true) {
    const runs = await prisma.novelGenerationRun.findMany({ where: {
      status: { in: ["planning", "running", "paused", "needs_review", "failed"] },
      ...(novelId ? { novel_id: novelId } : {}),
    }, orderBy: { id: "asc" }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    if (!runs.length) break;
    for (const candidate of runs) {
      await prisma.$transaction(async tx => {
        // Serialize the alert snapshot with progress, pause and resume writes.
        await tx.$queryRaw`SELECT "id" FROM "NovelGenerationRun" WHERE "id" = ${candidate.id} FOR UPDATE`;
        const run = await tx.novelGenerationRun.findUniqueOrThrow({ where: { id: candidate.id } });
        const novel = await tx.novel.findUnique({ where: { id: run.novel_id }, select: { deleted_at: true } });
        const alert = novel && !novel.deleted_at ? generationAlert(run, now) : null;
        await tx.novelGenerationAlert.updateMany({ where: { run_id: run.id, resolved_at: null, ...(alert ? { kind: { not: alert.kind } } : {}) }, data: { resolved_at: now } });
        if (!alert) return;
        const existing = await tx.novelGenerationAlert.findUnique({ where: { run_id_kind: { run_id: run.id, kind: alert.kind } } });
        if (existing && !existing.resolved_at && existing.message === alert.message) return;
        await tx.novelGenerationAlert.upsert({ where: { run_id_kind: { run_id: run.id, kind: alert.kind } },
          create: { run_id: run.id, ...alert }, update: { message: alert.message, read_at: null, resolved_at: null, created_at: now } });
      });
    }
    if (runs.length < 100) break;
    cursor = runs.at(-1)!.id;
  }
  // Terminal tasks no longer need an action alert.
  await prisma.novelGenerationAlert.updateMany({ where: { resolved_at: null, run: { status: { in: ["completed", "cancelled"] } } }, data: { resolved_at: now } });
}
