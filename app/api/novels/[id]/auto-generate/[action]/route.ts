import { jsonError, jsonOk } from "@/lib/http/json";
import { resumeGeneration } from "@/lib/agent/autoGeneration";
import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { getRequiredUserId } from "@/lib/auth/session";
import { sweepStaleRunningJobs } from "@/lib/jobs/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string; action: string }>;
}

const VALID_ACTIONS = new Set(["resume"]);

/** POST /api/novels/:id/auto-generate/:action */
export async function POST(_request: Request, context: RouteContext) {
  const { id, action } = await context.params;

  if (!VALID_ACTIONS.has(action)) {
    return jsonError("INVALID_ACTION", `不支持的操作: ${action}`, false, 400);
  }

  let userId: string;
  try {
    userId = await getRequiredUserId();
  } catch {
    return jsonError("UNAUTHORIZED", "Login required", false, 401);
  }

  const novel = await prisma.novel.findUnique({
    where: { id },
    select: { id: true, user_id: true },
  });
  if (!novel || !canAccessOwnerResource(novel.user_id, userId)) {
    return jsonError("NOVEL_NOT_FOUND", "Novel not found", false, 404);
  }

  if (action === "resume") {
    const run = await prisma.novelGenerationRun.findFirst({
      where: { novel_id: id, status: { in: ["paused", "needs_review", "failed"] } },
      orderBy: { created_at: "desc" },
    });
    if (!run) {
      return jsonError("NO_PAUSED_RUN", "没有可恢复的生成任务", false, 404);
    }

    // 回收滞留的 running job
    const swept = await sweepStaleRunningJobs(id);
    if (swept > 0) {
      console.log(`[auto-generate:resume] 回收了 ${swept} 个滞留的 running job`);
    }

    const result = await resumeGeneration(id, run.id);
    if ("error" in result) return jsonError("RESUME_BLOCKED", result.error!, false, 409);
    return jsonOk(result);
  }

  return jsonError("INVALID_ACTION", `不支持的操作: ${action}`, false, 400);
}
