import { prisma } from "@/lib/db";
import type { BackgroundJob } from "@prisma/client";
import type { Prisma } from "@prisma/client";

export type JobType = "summarize_chapter" | "index_chapter" | "refresh_summaries";
const JOB_TYPES: readonly JobType[] = ["summarize_chapter", "index_chapter", "refresh_summaries"] as const;

export type JobStatus = "pending" | "running" | "done" | "failed";

export interface EnqueueJobInput {
  type: JobType;
  payload: Prisma.InputJsonValue;
  novelId: string;
}

export interface ClaimNextJobOptions {
  novelId?: string;
  type?: JobType | readonly JobType[];
  status?: Extract<JobStatus, "pending" | "failed"> | readonly Extract<JobStatus, "pending" | "failed">[];
}

export interface JobTypeConfig {
  timeoutMs: number;
  maxAttempts: number;
  maxConcurrent: number;
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

const DEFAULT_JOB_TYPE_CONFIG: JobTypeConfig = {
  timeoutMs: 120_000,
  maxAttempts: 3,
  maxConcurrent: 2,
};

const JOB_TYPE_CONFIG: Record<JobType, JobTypeConfig> = {
  summarize_chapter: {
    timeoutMs: numberFromEnv("JOB_SUMMARIZE_TIMEOUT_MS", 150_000),
    maxAttempts: numberFromEnv("JOB_SUMMARIZE_MAX_ATTEMPTS", 3),
    maxConcurrent: numberFromEnv("JOB_SUMMARIZE_MAX_CONCURRENT", 2),
  },
  index_chapter: {
    timeoutMs: numberFromEnv("JOB_INDEX_TIMEOUT_MS", 120_000),
    maxAttempts: numberFromEnv("JOB_INDEX_MAX_ATTEMPTS", 3),
    maxConcurrent: numberFromEnv("JOB_INDEX_MAX_CONCURRENT", 2),
  },
  refresh_summaries: {
    timeoutMs: numberFromEnv("JOB_REFRESH_TIMEOUT_MS", 180_000),
    maxAttempts: numberFromEnv("JOB_REFRESH_MAX_ATTEMPTS", 2),
    maxConcurrent: numberFromEnv("JOB_REFRESH_MAX_CONCURRENT", 1),
  },
};

export function getJobTypeConfig(type: string): JobTypeConfig {
  return isJobType(type) ? JOB_TYPE_CONFIG[type] : DEFAULT_JOB_TYPE_CONFIG;
}

/**
 * P0-6: how long a job may stay in `running` before drains treat it as
 * orphaned. The drainer is invoked inline from API routes and dies with
 * the Serverless function — if the function is killed (timeout, OOM,
 * cold-shed) between the claim and the finalize update, the row sits in
 * `running` forever and `runPendingJobsForNovel` never sees it again
 * (it only queries `pending`). Five minutes is well past every handler's
 * own LLM timeout, so any `running` row older than this is provably
 * abandoned. Override via env for stress tests with slow handlers.
 */
const STALE_RUNNING_TIMEOUT_MS = Number(
  process.env.JOB_STALE_RUNNING_MS ?? 5 * 60 * 1000,
);

/**
 * Reset `running` jobs whose `started_at` is past the TTL back to
 * `pending` so the next drain re-picks them up. Returns the count
 * resurrected. `attempts` is intentionally NOT incremented — the
 * failure here is infrastructural (function torn down), not a handler
 * error, and we don't want to burn the user's retry budget on it.
 * The handler's own per-call timeout (and MAX_ATTEMPTS on real
 * failures) is still the backstop for genuinely broken handlers.
 */
export async function sweepStaleRunningJobs(novelId?: string): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_RUNNING_TIMEOUT_MS);
  const result = await prisma.backgroundJob.updateMany({
    where: {
      status: "running",
      started_at: { lt: cutoff },
      ...(novelId ? { novel_id: novelId } : {}),
    },
    data: {
      status: "pending",
      last_error: "Previous run timed out (stale running > TTL); requeued",
    },
  });
  return result.count;
}

/**
 * Claim the oldest matching runnable job by flipping it to `running`.
 *
 * The find + conditional update loop is intentionally two-step: two workers
 * may observe the same candidate, but only one can update that exact row while
 * it is still in the requested status. The loser retries and either claims
 * the next row or returns null.
 */
export async function claimNextJob(options: ClaimNextJobOptions = {}): Promise<BackgroundJob | null> {
  const statuses = normalizeList(options.status ?? "pending");
  const types = normalizeList(options.type);
  const typeConstraint = await buildClaimTypeConstraint(types);
  if (typeConstraint === null) return null;
  const where = buildClaimWhere(options.novelId, statuses, typeConstraint);

  while (true) {
    const candidate = await prisma.backgroundJob.findFirst({
      where,
      orderBy: { created_at: "asc" },
    });

    if (!candidate) return null;

    const startedAt = new Date();
    const claimed = await prisma.backgroundJob.updateMany({
      where: {
        id: candidate.id,
        status: { in: statuses },
      },
      data: {
        status: "running",
        started_at: startedAt,
        finished_at: null,
      },
    });

    if (claimed.count > 0) {
      return {
        ...candidate,
        status: "running",
        started_at: startedAt,
        finished_at: null,
      };
    }
  }
}

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

  return executeClaimedJob(job);
}

export async function runNextJob(options: ClaimNextJobOptions = {}): Promise<JobStatus | null> {
  const job = await claimNextJob(options);
  if (!job) return null;
  return executeClaimedJob(job);
}

async function executeClaimedJob(job: BackgroundJob): Promise<JobStatus> {
  const handler = getHandler(job.type as JobType);
  const config = getJobTypeConfig(job.type);
  if (!handler) {
    await prisma.backgroundJob.update({
      where: { id: job.id },
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
    await withTimeout(handler(job.payload), config.timeoutMs, job.type);
    await prisma.backgroundJob.update({
      where: { id: job.id },
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
    const willRetry = nextAttempts < config.maxAttempts;
    await prisma.backgroundJob.update({
      where: { id: job.id },
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

function normalizeList<T>(value: T | readonly T[] | undefined): T[] {
  if (value === undefined) return [];
  if (Array.isArray(value)) return [...value] as T[];
  return [value as T];
}

async function buildClaimTypeConstraint(
  requestedTypes: readonly JobType[],
): Promise<Prisma.StringFilter<"BackgroundJob"> | undefined | null> {
  const typesToCheck = requestedTypes.length > 0 ? requestedTypes : JOB_TYPES;
  const saturatedTypes = await findSaturatedJobTypes(typesToCheck);

  if (requestedTypes.length > 0) {
    const availableTypes = requestedTypes.filter((type) => !saturatedTypes.has(type));
    return availableTypes.length > 0 ? { in: availableTypes } : null;
  }

  if (saturatedTypes.size === 0) return undefined;
  if (saturatedTypes.size === JOB_TYPES.length) return null;
  return { notIn: [...saturatedTypes] };
}

function buildClaimWhere(
  novelId: string | undefined,
  statuses: readonly Extract<JobStatus, "pending" | "failed">[],
  typeConstraint: Prisma.StringFilter<"BackgroundJob"> | undefined,
): Prisma.BackgroundJobWhereInput {
  return {
    status: { in: [...statuses] },
    ...(novelId ? { novel_id: novelId } : {}),
    ...(typeConstraint ? { type: typeConstraint } : {}),
  };
}

async function findSaturatedJobTypes(types: readonly JobType[]): Promise<Set<JobType>> {
  const saturated = new Set<JobType>();
  for (const type of types) {
    const running = await prisma.backgroundJob.count({
      where: { type, status: "running" },
    });
    if (running >= getJobTypeConfig(type).maxConcurrent) saturated.add(type);
  }
  return saturated;
}

function isJobType(type: string): type is JobType {
  return (JOB_TYPES as readonly string[]).includes(type);
}

function numberFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, jobType: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Job "${jobType}" timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Drain all pending jobs for a novel sequentially. Best-effort — if one job
 * fails we still try the rest. Returns the count processed. P0-6: also
 * resurrects any stale `running` rows for this novel before draining, so
 * jobs killed mid-flight by a Serverless teardown don't hide forever.
 */
export async function runPendingJobsForNovel(novelId: string): Promise<number> {
  await sweepStaleRunningJobs(novelId);

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
