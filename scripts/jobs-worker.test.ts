import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEventListeners } from "node:events";
import type { JobStatus } from "@/lib/jobs/queue";

const mocks = vi.hoisted(() => ({
  runNextJob: vi.fn(),
  sweepStaleRunningJobs: vi.fn(),
  disconnect: vi.fn(),
  reconcile: vi.fn(), wake: vi.fn(), alerts: vi.fn(),
}));

vi.mock("@/lib/jobs/queue", () => ({
  JOB_TYPES: ["summarize_chapter", "index_chapter", "refresh_summaries", "generate_chapter", "plan_outline"],
  runNextJob: mocks.runNextJob,
  sweepStaleRunningJobs: mocks.sweepStaleRunningJobs,
}));

vi.mock("../lib/jobs/queue", () => ({
  JOB_TYPES: ["summarize_chapter", "index_chapter", "refresh_summaries", "generate_chapter", "plan_outline"],
  runNextJob: mocks.runNextJob,
  sweepStaleRunningJobs: mocks.sweepStaleRunningJobs,
}));

vi.mock("../lib/db", () => ({
  prisma: {
    $disconnect: mocks.disconnect,
  },
}));

vi.mock("../lib/agent/generationWake", () => ({ wakeScheduledGenerationRuns: mocks.wake }));
vi.mock("../lib/agent/generationAlerts", () => ({ reconcileGenerationAlerts: mocks.alerts }));

vi.mock("../lib/agent/generationScheduling", () => ({ reconcileGenerationRuns: mocks.reconcile }));

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
  mocks.reconcile.mockResolvedValue(0);
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


describe("long-lived worker recovery", () => {
  it("backs off after a database outage and then processes work", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    mocks.runNextJob.mockRejectedValueOnce(new Error("database unavailable")).mockImplementation(async () => { controller.abort(); return "done"; });
    const result = runJobsWorker({ signal: controller.signal, logger });
    await vi.advanceTimersByTimeAsync(499);
    expect(mocks.runNextJob).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await result).processed).toBe(1);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("retry in 500ms"));
  });
  it("does not hide infrastructure failures in once mode", async () => {
    mocks.sweepStaleRunningJobs.mockRejectedValueOnce(new Error("DB down"));
    await expect(runJobsWorker({ once: true, logger })).rejects.toThrow("DB down");
  });
  it("removes abort listeners after every idle poll", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    mocks.runNextJob.mockResolvedValue(null);
    const result = runJobsWorker({ signal: controller.signal, pollIntervalMs: 10, logger });
    await vi.advanceTimersByTimeAsync(500);
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(1);
    controller.abort(); await result;
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
  });
  it("repairs generation chains on startup, without consuming other novels", async () => {
    mocks.runNextJob.mockResolvedValue(null); mocks.reconcile.mockResolvedValue(1);
    await runJobsWorker({ once: true, novelId: "n", type: "plan_outline", logger });
    expect(mocks.reconcile).toHaveBeenCalledWith("n");
    expect(logger.warn).toHaveBeenCalledWith("[jobs-worker] reconciled 1 generation run(s)");
  });
});
