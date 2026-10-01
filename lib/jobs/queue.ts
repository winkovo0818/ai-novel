import { JobDeferredError } from "./deferred";
import { prisma } from "@/lib/db";
import type { BackgroundJob } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { type JobExecution, createJobExecution } from "./execution";

export type JobType = "summarize_chapter" | "index_chapter" | "refresh_summaries" | "generate_chapter" | "plan_outline";
export const JOB_TYPES: readonly JobType[] = ["summarize_chapter", "index_chapter", "refresh_summaries", "generate_chapter", "plan_outline"] as const;

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
  (payload: Prisma.JsonValue, execution?: JobExecution): Promise<void>;
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
  plan_outline: { timeoutMs: numberFromEnv("JOB_PLAN_OUTLINE_TIMEOUT_MS", 300_000), maxAttempts: 2, maxConcurrent: 1 },
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
  // Auto-pilot: one job writes one whole chapter (draft → critic → revise →
  // persist), so its budget dwarfs the post-processing jobs. Serial
  // (maxConcurrent 1) so chapters generate one at a time — avoids two chapters
  // racing to write the same Bible, and eases LLM rate limits. The budget must
  // exceed draft + rounds×(critic + revise): too small and a slow model both
  // exhausts its deadline. Cancellation and write leases prevent timed out
  // handlers from committing after a retry has begun.
  // 20min covers the worst case (240s draft + 2×(120s critic + 240s revise)).
  generate_chapter: {
    timeoutMs: numberFromEnv("JOB_GENERATE_CHAPTER_TIMEOUT_MS", 1_200_000),
    maxAttempts: numberFromEnv("JOB_GENERATE_CHAPTER_MAX_ATTEMPTS", 2),
    maxConcurrent: numberFromEnv("JOB_GENERATE_CHAPTER_MAX_CONCURRENT", 1),
  },
};

export function getJobTypeConfig(type: string): JobTypeConfig {
  return isJobType(type) ? JOB_TYPE_CONFIG[type] : DEFAULT_JOB_TYPE_CONFIG;
}

// Lease expiration follows the handler budget; updated_at is refreshed by a
// heartbeat, so a healthy long generation is never mistaken for a dead worker.
const STALE_RUNNING_TIMEOUT_MS = numberFromEnv("JOB_STALE_RUNNING_MS", 5 * 60_000);
const CLAIM_LOCK_KEY = 739_421_008;

export async function sweepStaleRunningJobs(novelId?: string): Promise<number> {
  const now = Date.now();
  const result = await prisma.backgroundJob.updateMany({
    where: {
      status: "running",
      updated_at: { lt: new Date(now - STALE_RUNNING_TIMEOUT_MS) },
      OR: JOB_TYPES.map(type => ({
        type,
        started_at: { lt: new Date(now - Math.max(STALE_RUNNING_TIMEOUT_MS, getJobTypeConfig(type).timeoutMs + 60_000)) },
      })),
      ...(novelId ? { novel_id: novelId } : {}),
    },
    data: { status: "pending", last_error: "Previous run expired (stale running lease); requeued" },
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
  return prisma.$transaction(async tx => {
    // Serializes count + claim across all worker processes, including inline drains.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(${CLAIM_LOCK_KEY}::bigint)`;
    const statuses = normalizeList(options.status ?? "pending");
    const types = normalizeList(options.type);
    const typeConstraint = await buildClaimTypeConstraint(types, tx);
    if (typeConstraint === null) return null;
    const where = buildClaimWhere(options.novelId, statuses, typeConstraint);
    while (true) {
      const candidate = await tx.backgroundJob.findFirst({ where, orderBy: { created_at: "asc" } });
      if (!candidate) return null;
      const startedAt = new Date();
      const claimed = await tx.backgroundJob.updateMany({
        where: { id: candidate.id, status: { in: statuses } },
        data: { status: "running", started_at: startedAt, finished_at: null },
      });
      if (claimed.count > 0) return { ...candidate, status: "running", started_at: startedAt, finished_at: null };
    }
  });
}

export async function runJob(jobId: string): Promise<JobStatus> {
  const job = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(${CLAIM_LOCK_KEY}::bigint)`;
    const candidate = await tx.backgroundJob.findUnique({ where: { id: jobId } });
    if (!candidate || !["pending", "failed"].includes(candidate.status)) return null;
    if (candidate.available_at === null || (candidate.available_at && candidate.available_at > new Date())) return null;
    const running = await tx.backgroundJob.count({ where: { type: candidate.type, status: "running" } });
    if (running >= getJobTypeConfig(candidate.type).maxConcurrent) return null;
    const startedAt = new Date();
    const claimed = await tx.backgroundJob.updateMany({
      where: { id: jobId, status: { in: ["pending", "failed"] } },
      data: { status: "running", started_at: startedAt, finished_at: null },
    });
    return claimed.count ? { ...candidate, started_at: startedAt, status: "running" } : null;
  });
  if (!job) {
    const existing = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
    return (existing?.status as JobStatus | undefined) ?? "failed";
  }
  return executeClaimedJob(job);
}

export async function runNextJob(options: ClaimNextJobOptions = {}): Promise<JobStatus | null> {
  const job = await claimNextJob(options);
  if (!job) return null;
  return executeClaimedJob(job);
}

async function executeClaimedJob(job: BackgroundJob): Promise<JobStatus> {
  if (isJobType(job.type) && !getHandler(job.type)) await import("./handlers");
  const handler = getHandler(job.type as JobType);
  const config = getJobTypeConfig(job.type);
  const controller = new AbortController();
  const execution = createJobExecution(job, controller.signal);
  const lease = { id: job.id, status: "running", started_at: job.started_at };
  const heartbeat = setInterval(() => {
    void execution.assertActive().catch(error => controller.abort(error));
  }, Math.min(30_000, Math.max(10, STALE_RUNNING_TIMEOUT_MS / 3)));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (!handler) throw new Error(`No handler registered for type "${job.type}"`);
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error(`Job "${job.type}" timed out after ${config.timeoutMs}ms`);
        controller.abort(error);
        reject(error);
      }, config.timeoutMs);
    });
    await Promise.race([handler(job.payload, execution), timeout]);
    controller.signal.throwIfAborted();
    const completed = await prisma.backgroundJob.updateMany({
      where: lease,
      data: { status: "done", attempts: { increment: 1 }, last_error: null, finished_at: new Date() },
    });
    return completed.count ? "done" : "failed";
  } catch (err) {
    controller.abort(err);
    if (err instanceof JobDeferredError) {
      const deferred = await prisma.backgroundJob.updateMany({ where: lease,
        data: { status: "pending", available_at: err.retryAt, last_error: err.message.slice(0, 1000), finished_at: null } });
      return deferred.count ? "pending" : "failed";
    }
    const attempts = job.attempts + 1;
    const willRetry = Boolean(handler) && attempts < config.maxAttempts;
    const updated = await prisma.backgroundJob.updateMany({
      where: lease,
      data: {
        status: willRetry ? "pending" : "failed", attempts,
        last_error: (err instanceof Error ? err.message : String(err)).slice(0, 1000),
        finished_at: willRetry ? null : new Date(),
      },
    });
    return updated.count && willRetry ? "pending" : "failed";
  } finally {
    clearInterval(heartbeat);
    if (timer) clearTimeout(timer);
  }
}

function normalizeList<T>(value: T | readonly T[] | undefined): T[] {
  if (value === undefined) return [];
  if (Array.isArray(value)) return [...value] as T[];
  return [value as T];
}

async function buildClaimTypeConstraint(
  requestedTypes: readonly JobType[],
  tx: Prisma.TransactionClient,
): Promise<Prisma.StringFilter<"BackgroundJob"> | undefined | null> {
  const typesToCheck = requestedTypes.length > 0 ? requestedTypes : JOB_TYPES;
  const saturatedTypes = await findSaturatedJobTypes(typesToCheck, tx);

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
    available_at: { lte: new Date() },
    ...(novelId ? { novel_id: novelId } : {}),
    ...(typeConstraint ? { type: typeConstraint } : {}),
  };
}

async function findSaturatedJobTypes(types: readonly JobType[], tx: Prisma.TransactionClient): Promise<Set<JobType>> {
  const saturated = new Set<JobType>();
  for (const type of types) {
    const running = await tx.backgroundJob.count({
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

/**
 * Drain all pending jobs for a novel sequentially. Best-effort — if one job
 * fails we still try the rest. Returns the count processed. P0-6: also
 * resurrects any stale `running` rows for this novel before draining, so
 * jobs killed mid-flight by a Serverless teardown don't hide forever.
 */
export async function runPendingJobsForNovel(novelId: string): Promise<number> {
  if (handlers.size === 0) await import("./handlers");
  await sweepStaleRunningJobs(novelId);

  const pending = await prisma.backgroundJob.findMany({
    where: { novel_id: novelId, status: "pending", type: { notIn: ["generate_chapter", "plan_outline"] } },
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
