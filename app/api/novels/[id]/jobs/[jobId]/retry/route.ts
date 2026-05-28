import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { getRequiredUserId } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string; jobId: string }>;
}

/**
 * POST /api/novels/:id/jobs/:jobId/retry
 *
 * Resets a `failed` BackgroundJob back to `pending`. The worker process
 * consumes it later; this API does not run handlers inside the request.
 */
export async function POST(_request: Request, context: RouteContext) {
  const { id, jobId } = await context.params;

  const novel = await prisma.novel.findUnique({
    where: { id },
    select: { id: true, user_id: true },
  });
  if (!novel) return jsonError("NOVEL_NOT_FOUND", "Novel not found", false, 404);

  let userId: string;
  try {
    userId = await getRequiredUserId();
  } catch {
    return jsonError("UNAUTHORIZED", "Login required", false, 401);
  }
  if (!canAccessOwnerResource(novel.user_id, userId)) {
    return jsonError("NOVEL_NOT_FOUND", "Novel not found", false, 404);
  }

  const job = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
  if (!job || job.novel_id !== id) {
    return jsonError("JOB_NOT_FOUND", "Job not found", false, 404);
  }

  if (job.status !== "failed") {
    return jsonError(
      "JOB_NOT_RETRYABLE",
      `Job is in status "${job.status}" and cannot be retried`,
      false,
      409,
    );
  }

  const updated = await prisma.backgroundJob.update({
    where: { id: jobId },
    data: { status: "pending", attempts: 0, last_error: null, finished_at: null },
  });

  return jsonOk({
    id: jobId,
    status: updated.status,
    last_error: updated.last_error,
  });
}
