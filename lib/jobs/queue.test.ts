import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
const findUnique = vi.fn();
const findMany = vi.fn();
const updateMany = vi.fn();
const update = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    backgroundJob: {
      create,
      findUnique,
      findMany,
      updateMany,
      update,
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
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
});
