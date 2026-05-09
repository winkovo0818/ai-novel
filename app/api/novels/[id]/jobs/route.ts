import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { enqueueJob, runPendingJobsForNovel, type JobType } from "@/lib/jobs/queue";
import { getRequiredUserId } from "@/utils/supabase/auth";
import { z } from "zod";

// Side-effect import: registers job handlers on first load.
import "@/lib/jobs/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const JobTypeSchema = z.enum(["summarize_chapter", "index_chapter", "refresh_summaries"]);
const JobInputSchema = z.object({
  type: JobTypeSchema,
  payload: z.record(z.unknown()),
});
const EnqueueRequestSchema = z.object({
  jobs: z.array(JobInputSchema).min(1).max(10),
});

async function authorize(novelId: string) {
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    select: { id: true, user_id: true },
  });
  if (!novel) return { ok: false as const, response: jsonError("NOVEL_NOT_FOUND", "Novel not found", false, 404) };

  let userId: string;
  try {
    userId = await getRequiredUserId();
  } catch {
    return { ok: false as const, response: jsonError("UNAUTHORIZED", "Login required", false, 401) };
  }
  if (!canAccessOwnerResource(novel.user_id, userId)) {
    return { ok: false as const, response: jsonError("NOVEL_NOT_FOUND", "Novel not found", false, 404) };
  }
  return { ok: true as const, novelId };
}

/**
 * POST /api/novels/:id/jobs — enqueue a batch of background jobs and
 * trigger an inline drain. Drain runs fire-and-forget; if it crashes
 * the rows are still in the queue and will surface via GET.
 */
export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const auth = await authorize(id);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = EnqueueRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("INVALID_INPUT", "Invalid jobs payload", false, 400);
  }

  const created = [];
  for (const input of parsed.data.jobs) {
    const job = await enqueueJob({
      type: input.type as JobType,
      payload: input.payload as Prisma.InputJsonValue,
      novelId: id,
    });
    created.push({ id: job.id, type: job.type, status: job.status });
  }

  // Drain best-effort. We don't await it because the caller doesn't need
  // to block on memory work — failures stay visible via GET /jobs.
  void runPendingJobsForNovel(id).catch((err) => {
    console.error(`[jobs] drain failed for novel ${id}:`, err instanceof Error ? err.message : err);
  });

  return jsonOk({ enqueued: created });
}

/**
 * GET /api/novels/:id/jobs — list recent jobs so the editor can show
 * a "memory refreshing" / "refresh failed" badge.
 */
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const auth = await authorize(id);
  if (!auth.ok) return auth.response;

  const jobs = await prisma.backgroundJob.findMany({
    where: { novel_id: id },
    orderBy: { created_at: "desc" },
    take: 20,
    select: {
      id: true,
      type: true,
      status: true,
      attempts: true,
      last_error: true,
      created_at: true,
      finished_at: true,
    },
  });

  const summary = {
    pending: jobs.filter((j) => j.status === "pending").length,
    running: jobs.filter((j) => j.status === "running").length,
    failed: jobs.filter((j) => j.status === "failed").length,
  };

  return jsonOk({ jobs, summary });
}
