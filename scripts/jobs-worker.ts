import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { prisma } from "../lib/db";
import {
  runNextJob,
  sweepStaleRunningJobs,
  type ClaimNextJobOptions,
  type JobType,
} from "../lib/jobs/queue";

import "../lib/jobs/handlers";

interface WorkerLogger {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface JobsWorkerOptions extends ClaimNextJobOptions {
  once?: boolean;
  pollIntervalMs?: number;
  sweepIntervalMs?: number;
  signal?: AbortSignal;
  logger?: WorkerLogger;
}

export interface JobsWorkerResult {
  processed: number;
  swept: number;
  stoppedReason: "idle" | "signal";
}

const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_SWEEP_INTERVAL_MS = 60_000;

export async function runJobsWorker(options: JobsWorkerOptions = {}): Promise<JobsWorkerResult> {
  const logger = options.logger ?? console;
  const pollIntervalMs = options.pollIntervalMs ?? numberFromEnv("JOBS_WORKER_POLL_MS", DEFAULT_POLL_INTERVAL_MS);
  const sweepIntervalMs = options.sweepIntervalMs ?? numberFromEnv("JOBS_WORKER_SWEEP_MS", DEFAULT_SWEEP_INTERVAL_MS);
  let processed = 0;
  let swept = 0;
  let nextSweepAt = 0;

  logger.log("[jobs-worker] started");

  while (!options.signal?.aborted) {
    const now = Date.now();
    if (now >= nextSweepAt) {
      const sweepCount = await sweepStaleRunningJobs(options.novelId);
      swept += sweepCount;
      if (sweepCount > 0) logger.warn(`[jobs-worker] requeued ${sweepCount} stale running job(s)`);
      nextSweepAt = now + sweepIntervalMs;
    }

    const status = await runNextJob({
      novelId: options.novelId,
      type: options.type,
      status: "pending",
    });

    if (status === null) {
      if (options.once) {
        logger.log(`[jobs-worker] queue idle; processed=${processed} swept=${swept}`);
        return { processed, swept, stoppedReason: "idle" };
      }
      await sleep(pollIntervalMs, options.signal);
      continue;
    }

    processed += 1;
    logger.log(`[jobs-worker] job finished with status=${status}`);

    if (status === "pending") {
      await sleep(pollIntervalMs, options.signal);
    }
  }

  logger.log(`[jobs-worker] stopping; processed=${processed} swept=${swept}`);
  return { processed, swept, stoppedReason: "signal" };
}

export function parseJobTypes(value: string | undefined): JobType[] | undefined {
  if (!value?.trim()) return undefined;
  const types = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  for (const type of types) {
    if (!isJobType(type)) {
      throw new Error(`Invalid JOBS_WORKER_TYPES entry: ${type}`);
    }
  }

  return types as JobType[];
}

function buildOptionsFromEnv(signal: AbortSignal): JobsWorkerOptions {
  return {
    once: process.env.JOBS_WORKER_ONCE === "1",
    novelId: process.env.JOBS_WORKER_NOVEL_ID,
    type: parseJobTypes(process.env.JOBS_WORKER_TYPES),
    pollIntervalMs: numberFromEnv("JOBS_WORKER_POLL_MS", DEFAULT_POLL_INTERVAL_MS),
    sweepIntervalMs: numberFromEnv("JOBS_WORKER_SWEEP_MS", DEFAULT_SWEEP_INTERVAL_MS),
    signal,
  };
}

function installSignalHandlers(controller: AbortController, logger: WorkerLogger): void {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      logger.warn(`[jobs-worker] received ${signal}; draining current job then stopping`);
      controller.abort();
    });
  }
}

function numberFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0 || signal?.aborted) return Promise.resolve();
  return new Promise((resolveSleep) => {
    const timer = setTimeout(resolveSleep, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolveSleep();
    }, { once: true });
  });
}

function isJobType(value: string): value is JobType {
  return value === "summarize_chapter" || value === "index_chapter" || value === "refresh_summaries";
}

function isDirectRun(): boolean {
  return Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
}

async function main() {
  const controller = new AbortController();
  installSignalHandlers(controller, console);
  const result = await runJobsWorker(buildOptionsFromEnv(controller.signal));
  console.log(`[jobs-worker] exited: ${result.stoppedReason}`);
}

if (isDirectRun()) {
  main()
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[jobs-worker] failed: ${message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
