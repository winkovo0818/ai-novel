import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export type JobType = "summarize_chapter" | "index_chapter" | "refresh_summaries";

export type JobStatus = "pending" | "running" | "done" | "failed";

export interface EnqueueJobInput {
  type: JobType;
  payload: Prisma.InputJsonValue;
  novelId: string;
}

/**
 * Enqueue a background job. Returns the persisted row.
 *
 * Callers typically follow this with `runPendingJobsForNovel(novelId)`
 * fired-and-forgotten to drain the queue inline. If that drain fails,
 * the row stays in "pending" / "failed" state so the editor can surface
 * it to the user instead of the work disappearing silently.
 */
export async function enqueueJob(input: EnqueueJobInput) {
  return prisma.backgroundJob.create({
    data: {
      novel_id: input.novelId,
      type: input.type,
      payload: input.payload,
      status: "pending",
    },
  });
}

export interface JobHandler {
  (payload: Prisma.JsonValue): Promise<void>;
}

const handlers = new Map<JobType, JobHandler>();

export function registerHandler(type: JobType, handler: JobHandler): void {
  handlers.set(type, handler);
}

export function getHandler(type: JobType): JobHandler | undefined {
  return handlers.get(type);
}

const MAX_ATTEMPTS = 3;

/**
 * Run a single job by id. Atomic state transitions:
 *   pending -> running (only if previous status was pending or failed)
 *   running -> done | failed
 *
 * Returns the final status. Errors bubble up so callers can decide whether
 * to retry the whole drain.
 */
export async function runJob(jobId: string): Promise<JobStatus> {
  // Claim the job: only flip pending/failed -> running so concurrent runners
  // don't double-process the same row.
  const claimed = await prisma.backgroundJob.updateMany({
    where: {
      id: jobId,
      status: { in: ["pending", "failed"] },
    },
    data: {
      status: "running",
      started_at: new Date(),
    },
  });

  if (claimed.count === 0) {
    // Another runner picked it up, or it was already terminal.
    const existing = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
    return (existing?.status as JobStatus | undefined) ?? "failed";
  }

  const job = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
  if (!job) return "failed";

  const handler = getHandler(job.type as JobType);
  if (!handler) {
    await prisma.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        attempts: { increment: 1 },
        last_error: `No handler registered for type "${job.type}"`,
        finished_at: new Date(),
      },
    });
    return "failed";
  }

  try {
    await handler(job.payload);
    await prisma.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: "done",
        attempts: { increment: 1 },
        last_error: null,
        finished_at: new Date(),
      },
    });
    return "done";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const nextAttempts = job.attempts + 1;
    const willRetry = nextAttempts < MAX_ATTEMPTS;
    await prisma.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: willRetry ? "pending" : "failed",
        attempts: nextAttempts,
        last_error: message.slice(0, 1000),
        finished_at: willRetry ? null : new Date(),
      },
    });
    return willRetry ? "pending" : "failed";
  }
}

/**
 * Drain all pending jobs for a novel sequentially. Best-effort — if one job
 * fails we still try the rest. Returns the count processed.
 */
export async function runPendingJobsForNovel(novelId: string): Promise<number> {
  const pending = await prisma.backgroundJob.findMany({
    where: { novel_id: novelId, status: "pending" },
    orderBy: { created_at: "asc" },
    select: { id: true },
  });

  for (const { id } of pending) {
    try {
      await runJob(id);
    } catch {
      // runJob already records the error on the row; keep draining.
    }
  }

  return pending.length;
}
