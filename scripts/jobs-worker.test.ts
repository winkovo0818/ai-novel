import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobStatus } from "@/lib/jobs/queue";

const mocks = vi.hoisted(() => ({
  runNextJob: vi.fn(),
  sweepStaleRunningJobs: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock("@/lib/jobs/queue", () => ({
  runNextJob: mocks.runNextJob,
  sweepStaleRunningJobs: mocks.sweepStaleRunningJobs,
}));

vi.mock("../lib/jobs/queue", () => ({
  runNextJob: mocks.runNextJob,
  sweepStaleRunningJobs: mocks.sweepStaleRunningJobs,
}));

vi.mock("../lib/db", () => ({
  prisma: {
    $disconnect: mocks.disconnect,
  },
}));

vi.mock("../lib/jobs/handlers", () => ({}));

import { parseJobTypes, runJobsWorker } from "./jobs-worker";

const logger = {
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sweepStaleRunningJobs.mockResolvedValue(0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("parseJobTypes", () => {
  it("parses comma-separated job types", () => {
    expect(parseJobTypes("summarize_chapter,index_chapter")).toEqual([
      "summarize_chapter",
      "index_chapter",
    ]);
  });

  it("returns undefined for an empty filter", () => {
    expect(parseJobTypes(undefined)).toBeUndefined();
    expect(parseJobTypes("  ")).toBeUndefined();
  });

  it("rejects unknown job types", () => {
    expect(() => parseJobTypes("summarize_chapter,nope")).toThrow("Invalid JOBS_WORKER_TYPES");
  });
});

describe("runJobsWorker", () => {
  it("runs jobs until the queue is idle in once mode", async () => {
    mocks.runNextJob
      .mockResolvedValueOnce("done" satisfies JobStatus)
      .mockResolvedValueOnce("pending" satisfies JobStatus)
      .mockResolvedValueOnce(null);

    const result = await runJobsWorker({
      once: true,
      pollIntervalMs: 0,
      sweepIntervalMs: 60_000,
      logger,
      novelId: "n-1",
      type: "index_chapter",
    });

    expect(result).toEqual({ processed: 2, swept: 0, stoppedReason: "idle" });
    expect(mocks.sweepStaleRunningJobs).toHaveBeenCalledWith("n-1");
    expect(mocks.runNextJob).toHaveBeenCalledWith({
      novelId: "n-1",
      type: "index_chapter",
      status: "pending",
    });
  });

  it("reports stale jobs swept before processing", async () => {
    mocks.sweepStaleRunningJobs.mockResolvedValue(2);
    mocks.runNextJob.mockResolvedValueOnce(null);

    const result = await runJobsWorker({
      once: true,
      logger,
    });

    expect(result).toEqual({ processed: 0, swept: 2, stoppedReason: "idle" });
    expect(logger.warn).toHaveBeenCalledWith("[jobs-worker] requeued 2 stale running job(s)");
  });

  it("stops when the abort signal is raised while polling", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    mocks.runNextJob.mockResolvedValue(null);

    const resultPromise = runJobsWorker({
      pollIntervalMs: 1_000,
      sweepIntervalMs: 60_000,
      signal: controller.signal,
      logger,
    });
    await vi.advanceTimersByTimeAsync(10);
    controller.abort();
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(resultPromise).resolves.toEqual({
      processed: 0,
      swept: 0,
      stoppedReason: "signal",
    });
  });
});
