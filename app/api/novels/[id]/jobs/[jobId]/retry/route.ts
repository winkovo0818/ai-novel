import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { getRequiredUserId } from "@/lib/auth/session";
import { runJob } from "@/lib/jobs/queue";

import "@/lib/jobs/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string; jobId: string }>;
}

/**
 * POST /api/novels/:id/jobs/:jobId/retry
 *
 * Resets a `failed` BackgroundJob back to `pending` and immediately tries
 * to run it. The queue's runJob handles the pending → running transition
 * atomically so concurrent retries don't double-execute.
 *
 * Refuses to retry running / done / pending rows — those need no
 * intervention. Returns the resulting job state.
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

  if (job.status === "running" || job.status === "done") {
    return jsonError(
      "JOB_NOT_RETRYABLE",
      `Job is in status "${job.status}" and cannot be retried`,
      false,
      409,
    );
  }

  // Reset failed/pending to pending and clear last_error so runJob will pick
  // it up. Also reset attempts so the user gets a fresh 3-attempt budget.
  await prisma.backgroundJob.update({
    where: { id: jobId },
    data: { status: "pending", attempts: 0, last_error: null, finished_at: null },
  });

  const finalStatus = await runJob(jobId);
  const refreshed = await prisma.backgroundJob.findUnique({ where: { id: jobId } });

  return jsonOk({
    id: jobId,
    status: refreshed?.status ?? finalStatus,
    last_error: refreshed?.last_error ?? null,
  });
}
