import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
const findUnique = vi.fn();
const findMany = vi.fn();
const findFirst = vi.fn();
const count = vi.fn();
const updateMany = vi.fn();
const update = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    backgroundJob: {
      create,
      findUnique,
      findMany,
      findFirst,
      count,
      updateMany,
      update,
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  count.mockResolvedValue(0);
});

describe("enqueueJob", () => {
  it("inserts a pending row with the supplied type, payload, and novel_id", async () => {
    create.mockResolvedValue({ id: "job-1" });
    const { enqueueJob } = await import("./queue");

    await enqueueJob({ type: "summarize_chapter", payload: { chapter_id: "c-1" }, novelId: "n-1" });

    expect(create).toHaveBeenCalledWith({
      data: {
        novel_id: "n-1",
        type: "summarize_chapter",
        payload: { chapter_id: "c-1" },
        status: "pending",
      },
    });
  });
});

describe("runJob", () => {
  it("marks the job done when the handler resolves", async () => {
    const { registerHandler, runJob } = await import("./queue");
    const handler = vi.fn().mockResolvedValue(undefined);
    registerHandler("summarize_chapter", handler);

    updateMany.mockResolvedValue({ count: 1 });
    findUnique.mockResolvedValue({
      id: "job-1",
      type: "summarize_chapter",
      payload: { chapter_id: "c-1" },
      attempts: 0,
    });
    update.mockResolvedValue({});

    const status = await runJob("job-1");

    expect(status).toBe("done");
    expect(handler).toHaveBeenCalledWith({ chapter_id: "c-1" });
    expect(update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: expect.objectContaining({
        status: "done",
        attempts: { increment: 1 },
        last_error: null,
      }),
    });
  });

  it("marks the job back to pending and increments attempts on retryable failure", async () => {
    const { registerHandler, runJob } = await import("./queue");
    registerHandler("summarize_chapter", async () => {
      throw new Error("boom");
    });

    updateMany.mockResolvedValue({ count: 1 });
    findUnique.mockResolvedValue({
      id: "job-1",
      type: "summarize_chapter",
      payload: { chapter_id: "c-1" },
      attempts: 0,
    });
    update.mockResolvedValue({});

    const status = await runJob("job-1");

    expect(status).toBe("pending");
    expect(update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: expect.objectContaining({
        status: "pending",
        attempts: 1,
        last_error: "boom",
      }),
    });
  });

  it("marks the job failed after the third attempt", async () => {
    const { registerHandler, runJob } = await import("./queue");
    registerHandler("summarize_chapter", async () => {
      throw new Error("boom");
    });

    updateMany.mockResolvedValue({ count: 1 });
    findUnique.mockResolvedValue({
      id: "job-1",
      type: "summarize_chapter",
      payload: { chapter_id: "c-1" },
      attempts: 2,
    });
    update.mockResolvedValue({});

    const status = await runJob("job-1");

    expect(status).toBe("failed");
    expect(update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: expect.objectContaining({
        status: "failed",
        attempts: 3,
        last_error: "boom",
      }),
    });
  });

  it("uses per-type max attempts when deciding whether to retry", async () => {
    const { registerHandler, runJob } = await import("./queue");
    registerHandler("refresh_summaries", async () => {
      throw new Error("refresh failed");
    });

    updateMany.mockResolvedValue({ count: 1 });
    findUnique.mockResolvedValue({
      id: "job-refresh",
      type: "refresh_summaries",
      payload: { novel_id: "n-1" },
      attempts: 1,
    });
    update.mockResolvedValue({});

    const status = await runJob("job-refresh");

    expect(status).toBe("failed");
    expect(update).toHaveBeenCalledWith({
      where: { id: "job-refresh" },
      data: expect.objectContaining({
        status: "failed",
        attempts: 2,
        last_error: "refresh failed",
      }),
    });
  });

  it("marks a timed-out handler as pending and increments attempts", async () => {
    vi.useFakeTimers();
    const prev = process.env.JOB_INDEX_TIMEOUT_MS;
    process.env.JOB_INDEX_TIMEOUT_MS = "25";
    try {
      vi.resetModules();
      const { registerHandler, runJob } = await import("./queue");
      registerHandler("index_chapter", () => new Promise(() => undefined));

      updateMany.mockResolvedValue({ count: 1 });
      findUnique.mockResolvedValue({
        id: "job-timeout",
        type: "index_chapter",
        payload: { novel_id: "n-1", chapter_id: "c-1" },
        attempts: 0,
      });
      update.mockResolvedValue({});

      const statusPromise = runJob("job-timeout");
      await vi.advanceTimersByTimeAsync(25);

      await expect(statusPromise).resolves.toBe("pending");
      expect(update).toHaveBeenCalledWith({
        where: { id: "job-timeout" },
        data: expect.objectContaining({
          status: "pending",
          attempts: 1,
          last_error: 'Job "index_chapter" timed out after 25ms',
        }),
      });
    } finally {
      vi.useRealTimers();
      if (prev === undefined) delete process.env.JOB_INDEX_TIMEOUT_MS;
      else process.env.JOB_INDEX_TIMEOUT_MS = prev;
      vi.resetModules();
    }
  });

  it("does not double-process a job another runner already claimed", async () => {
    const { runJob } = await import("./queue");
    updateMany.mockResolvedValue({ count: 0 });
    findUnique.mockResolvedValue({ id: "job-1", status: "running" });

    const status = await runJob("job-1");

    expect(status).toBe("running");
    expect(update).not.toHaveBeenCalled();
  });

  it("fails fast when no handler is registered for the job type", async () => {
    const { runJob } = await import("./queue");
    updateMany.mockResolvedValue({ count: 1 });
    findUnique.mockResolvedValue({
      id: "job-2",
      type: "unknown_type",
      payload: {},
      attempts: 0,
    });
    update.mockResolvedValue({});

    const status = await runJob("job-2");

    expect(status).toBe("failed");
    expect(update).toHaveBeenCalledWith({
      where: { id: "job-2" },
      data: expect.objectContaining({
        status: "failed",
        last_error: expect.stringContaining("No handler"),
      }),
    });
  });
});

describe("claimNextJob", () => {
  it("claims the oldest pending job globally by default", async () => {
    const { claimNextJob } = await import("./queue");
    const createdAt = new Date("2026-05-27T00:00:00.000Z");
    const job = {
      id: "job-1",
      novel_id: "n-1",
      type: "summarize_chapter",
      payload: { chapter_id: "c-1" },
      status: "pending",
      attempts: 0,
      last_error: null,
      created_at: createdAt,
      updated_at: createdAt,
      started_at: null,
      finished_at: null,
    };
    findFirst.mockResolvedValue(job);
    updateMany.mockResolvedValue({ count: 1 });

    const claimed = await claimNextJob();

    expect(findFirst).toHaveBeenCalledWith({
      where: { status: { in: ["pending"] } },
      orderBy: { created_at: "asc" },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "job-1", status: { in: ["pending"] } },
      data: {
        status: "running",
        started_at: expect.any(Date),
        finished_at: null,
      },
    });
    expect(claimed).toMatchObject({
      id: "job-1",
      status: "running",
      finished_at: null,
    });
    expect(claimed?.started_at).toBeInstanceOf(Date);
  });

  it("supports filtering by novel, type, and retryable status", async () => {
    const { claimNextJob } = await import("./queue");
    findFirst.mockResolvedValue(null);

    const claimed = await claimNextJob({
      novelId: "n-2",
      type: ["index_chapter", "refresh_summaries"],
      status: ["pending", "failed"],
    });

    expect(claimed).toBeNull();
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        status: { in: ["pending", "failed"] },
        novel_id: "n-2",
        type: { in: ["index_chapter", "refresh_summaries"] },
      },
      orderBy: { created_at: "asc" },
    });
  });

  it("does not claim a job when the requested type is at its concurrency limit", async () => {
    const prev = process.env.JOB_REFRESH_MAX_CONCURRENT;
    process.env.JOB_REFRESH_MAX_CONCURRENT = "1";
    try {
      vi.resetModules();
      const { claimNextJob } = await import("./queue");
      count.mockResolvedValue(1);

      const claimed = await claimNextJob({ type: "refresh_summaries" });

      expect(claimed).toBeNull();
      expect(count).toHaveBeenCalledWith({
        where: { type: "refresh_summaries", status: "running" },
      });
      expect(findFirst).not.toHaveBeenCalled();
    } finally {
      if (prev === undefined) delete process.env.JOB_REFRESH_MAX_CONCURRENT;
      else process.env.JOB_REFRESH_MAX_CONCURRENT = prev;
      vi.resetModules();
    }
  });

  it("skips saturated types when claiming any job", async () => {
    const prev = process.env.JOB_REFRESH_MAX_CONCURRENT;
    process.env.JOB_REFRESH_MAX_CONCURRENT = "1";
    try {
      vi.resetModules();
      const { claimNextJob } = await import("./queue");
      count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1);
      findFirst.mockResolvedValue(null);

      await claimNextJob();

      expect(findFirst).toHaveBeenCalledWith({
        where: {
          status: { in: ["pending"] },
          type: { notIn: ["refresh_summaries"] },
        },
        orderBy: { created_at: "asc" },
      });
    } finally {
      if (prev === undefined) delete process.env.JOB_REFRESH_MAX_CONCURRENT;
      else process.env.JOB_REFRESH_MAX_CONCURRENT = prev;
      vi.resetModules();
    }
  });

  it("retries when another worker claimed the same candidate first", async () => {
    const { claimNextJob } = await import("./queue");
    const createdAt = new Date("2026-05-27T00:00:00.000Z");
    const first = {
      id: "job-1",
      novel_id: "n-1",
      type: "summarize_chapter",
      payload: {},
      status: "pending",
      attempts: 0,
      last_error: null,
      created_at: createdAt,
      updated_at: createdAt,
      started_at: null,
      finished_at: null,
    };
    const second = { ...first, id: "job-2" };
    findFirst.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });

    const claimed = await claimNextJob({ novelId: "n-1" });

    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(updateMany.mock.calls[0][0].where).toEqual({
      id: "job-1",
      status: { in: ["pending"] },
    });
    expect(updateMany.mock.calls[1][0].where).toEqual({
      id: "job-2",
      status: { in: ["pending"] },
    });
    expect(claimed?.id).toBe("job-2");
  });
});

describe("runNextJob", () => {
  it("claims and runs one matching job", async () => {
    const { registerHandler, runNextJob } = await import("./queue");
    const handler = vi.fn().mockResolvedValue(undefined);
    registerHandler("refresh_summaries", handler);

    const createdAt = new Date("2026-05-27T00:00:00.000Z");
    findFirst.mockResolvedValue({
      id: "job-3",
      novel_id: "n-1",
      type: "refresh_summaries",
      payload: { novel_id: "n-1" },
      status: "pending",
      attempts: 0,
      last_error: null,
      created_at: createdAt,
      updated_at: createdAt,
      started_at: null,
      finished_at: null,
    });
    updateMany.mockResolvedValue({ count: 1 });
    update.mockResolvedValue({});

    const status = await runNextJob({ novelId: "n-1", type: "refresh_summaries" });

    expect(status).toBe("done");
    expect(handler).toHaveBeenCalledWith({ novel_id: "n-1" });
    expect(update).toHaveBeenCalledWith({
      where: { id: "job-3" },
      data: expect.objectContaining({
        status: "done",
        attempts: { increment: 1 },
      }),
    });
  });

  it("returns null when there is no matching job", async () => {
    const { runNextJob } = await import("./queue");
    findFirst.mockResolvedValue(null);

    await expect(runNextJob({ novelId: "n-404" })).resolves.toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
});

describe("runPendingJobsForNovel", () => {
  it("drains every pending job for the novel in created_at order", async () => {
    const { registerHandler, runPendingJobsForNovel } = await import("./queue");
    const handler = vi.fn().mockResolvedValue(undefined);
    registerHandler("index_chapter", handler);

    findMany.mockResolvedValue([{ id: "j1" }, { id: "j2" }]);
    updateMany.mockResolvedValue({ count: 1 });
    findUnique
      .mockResolvedValueOnce({ id: "j1", type: "index_chapter", payload: { novel_id: "n", chapter_id: "c1" }, attempts: 0 })
      .mockResolvedValueOnce({ id: "j2", type: "index_chapter", payload: { novel_id: "n", chapter_id: "c2" }, attempts: 0 });
    update.mockResolvedValue({});

    const processed = await runPendingJobsForNovel("n");

    expect(processed).toBe(2);
    expect(findMany).toHaveBeenCalledWith({
      where: { novel_id: "n", status: "pending" },
      orderBy: { created_at: "asc" },
      select: { id: true },
    });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("sweeps stale running rows for the novel before draining (P0-6)", async () => {
    const { runPendingJobsForNovel } = await import("./queue");
    findMany.mockResolvedValue([]);
    updateMany.mockResolvedValue({ count: 1 });

    await runPendingJobsForNovel("n-1");

    // The very first DB call must be the sweep — bounded to this novel,
    // matched on running + started_at older than ~5 min, and resetting
    // to pending without touching attempts.
    const sweepCall = updateMany.mock.calls[0][0];
    expect(sweepCall.where.status).toBe("running");
    expect(sweepCall.where.novel_id).toBe("n-1");
    expect(sweepCall.where.started_at).toHaveProperty("lt");
    expect(sweepCall.where.started_at.lt).toBeInstanceOf(Date);
    expect(sweepCall.data.status).toBe("pending");
    expect(sweepCall.data.last_error).toMatch(/stale running/i);
    expect("attempts" in sweepCall.data).toBe(false);
  });
});

describe("sweepStaleRunningJobs", () => {
  it("scopes to a novel when given an id (P0-6)", async () => {
    const { sweepStaleRunningJobs } = await import("./queue");
    updateMany.mockResolvedValue({ count: 3 });

    const count = await sweepStaleRunningJobs("n-7");

    expect(count).toBe(3);
    const call = updateMany.mock.calls[0][0];
    expect(call.where.novel_id).toBe("n-7");
    expect(call.where.status).toBe("running");
    expect(call.where.started_at.lt).toBeInstanceOf(Date);
  });

  it("acts globally when no novel id is supplied (P0-6)", async () => {
    const { sweepStaleRunningJobs } = await import("./queue");
    updateMany.mockResolvedValue({ count: 0 });

    await sweepStaleRunningJobs();

    const call = updateMany.mock.calls[0][0];
    expect("novel_id" in call.where).toBe(false);
    expect(call.where.status).toBe("running");
  });

  it("respects JOB_STALE_RUNNING_MS override (P0-6)", async () => {
    const prev = process.env.JOB_STALE_RUNNING_MS;
    process.env.JOB_STALE_RUNNING_MS = "1000"; // 1s
    try {
      vi.resetModules();
      const { sweepStaleRunningJobs } = await import("./queue");
      updateMany.mockResolvedValue({ count: 0 });
      const before = Date.now();
      await sweepStaleRunningJobs("n");
      const cutoff: Date = updateMany.mock.calls[0][0].where.started_at.lt;
      // cutoff should be ~1s before "now" rather than the default ~5min.
      expect(before - cutoff.getTime()).toBeGreaterThanOrEqual(900);
      expect(before - cutoff.getTime()).toBeLessThan(60_000);
    } finally {
      if (prev === undefined) delete process.env.JOB_STALE_RUNNING_MS;
      else process.env.JOB_STALE_RUNNING_MS = prev;
      vi.resetModules();
    }
  });
});
