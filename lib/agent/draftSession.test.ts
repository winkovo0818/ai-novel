import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn();
const update = vi.fn();
const deleteMany = vi.fn();
const findUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    draftSession: { upsert, update, deleteMany, findUnique },
  },
}));

// Prisma sentinel — keep the import path identical to runtime so the
// production code can compare against the same symbol.
vi.mock("@prisma/client", () => ({
  Prisma: { JsonNull: { __prismaJsonNull: true } },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// Import lazily so the @prisma/client mock applies.
async function load() {
  return await import("./draftSession");
}

describe("createDraftSession", () => {
  it("upserts on (user, novel, chapter_index) with a fresh streaming row", async () => {
    upsert.mockResolvedValue({ id: "ds-1" });
    const { createDraftSession } = await load();

    const id = await createDraftSession({
      userId: "user-1",
      novelId: "novel-1",
      chapterIndex: 3,
    });

    expect(id).toBe("ds-1");
    expect(upsert).toHaveBeenCalledWith({
      where: {
        user_id_novel_id_chapter_index: {
          user_id: "user-1",
          novel_id: "novel-1",
          chapter_index: 3,
        },
      },
      create: expect.objectContaining({
        user_id: "user-1",
        novel_id: "novel-1",
        chapter_index: 3,
        buffer: "",
        status: "streaming",
      }),
      update: expect.objectContaining({
        buffer: "",
        status: "streaming",
        error_code: null,
        error_message: null,
      }),
    });
  });
});

describe("createDraftBufferFlusher", () => {
  it("does NOT write on the first delta (within throttle window, below char batch)", async () => {
    update.mockResolvedValue({});
    const { createDraftBufferFlusher } = await load();
    const flusher = createDraftBufferFlusher("ds-1");

    flusher.schedule("a");

    expect(update).not.toHaveBeenCalled();
  });

  it("writes once the per-batch char threshold is reached", async () => {
    update.mockResolvedValue({});
    const { createDraftBufferFlusher } = await load();
    const flusher = createDraftBufferFlusher("ds-1");

    // Crossing 256 chars in a single schedule call triggers a write.
    flusher.schedule("x".repeat(300));

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: "ds-1" },
      data: { buffer: "x".repeat(300) },
    });
  });

  it("writes after the time threshold even without a big batch", async () => {
    update.mockResolvedValue({});
    const { createDraftBufferFlusher } = await load();
    const flusher = createDraftBufferFlusher("ds-1");

    flusher.schedule("hi");
    expect(update).not.toHaveBeenCalled();

    // Cross the 500ms threshold.
    vi.advanceTimersByTime(600);
    flusher.schedule("hi there");

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenLastCalledWith({
      where: { id: "ds-1" },
      data: { buffer: "hi there" },
    });
  });

  it("flush() forces a pending write even if throttle hasn't fired", async () => {
    update.mockResolvedValue({});
    const { createDraftBufferFlusher } = await load();
    const flusher = createDraftBufferFlusher("ds-1");

    flusher.schedule("only-pending");
    expect(update).not.toHaveBeenCalled();

    await flusher.flush();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: "ds-1" },
      data: { buffer: "only-pending" },
    });
  });

  it("flush() is a no-op when nothing is pending", async () => {
    update.mockResolvedValue({});
    const { createDraftBufferFlusher } = await load();
    const flusher = createDraftBufferFlusher("ds-1");
    await flusher.flush();
    expect(update).not.toHaveBeenCalled();
  });

  it("swallows persistence errors so the SSE stream keeps flowing", async () => {
    update.mockRejectedValue(new Error("db down"));
    const { createDraftBufferFlusher } = await load();
    const flusher = createDraftBufferFlusher("ds-1");

    flusher.schedule("x".repeat(300));
    await vi.waitFor(() => expect(update).toHaveBeenCalled());
    // The schedule call itself must not have thrown.
    flusher.schedule("y".repeat(300));
    await flusher.flush();
  });
});

describe("completeDraftSession", () => {
  it("transitions to completed with the final buffer + retrieval payload", async () => {
    update.mockResolvedValue({});
    const { completeDraftSession } = await load();

    await completeDraftSession("ds-1", {
      buffer: "final body",
      retrieval: { status: "ok", memories: [] },
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: "ds-1" },
      data: {
        buffer: "final body",
        status: "completed",
        retrieval: { status: "ok", memories: [] },
      },
    });
  });

  it("substitutes Prisma.JsonNull when no retrieval payload was provided", async () => {
    update.mockResolvedValue({});
    const { completeDraftSession } = await load();

    await completeDraftSession("ds-1", { buffer: "x" });

    expect(update).toHaveBeenCalledWith({
      where: { id: "ds-1" },
      data: expect.objectContaining({
        retrieval: { __prismaJsonNull: true },
      }),
    });
  });

  it("swallows write failures (best-effort)", async () => {
    update.mockRejectedValue(new Error("db down"));
    const { completeDraftSession } = await load();
    await expect(completeDraftSession("ds-1", { buffer: "x" })).resolves.toBeUndefined();
  });
});

describe("failDraftSession", () => {
  it("records the error and clamps the message length", async () => {
    update.mockResolvedValue({});
    const { failDraftSession } = await load();

    const longMessage = "x".repeat(1000);
    await failDraftSession("ds-1", {
      buffer: "partial",
      code: "LLM_TIMEOUT",
      message: longMessage,
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: "ds-1" },
      data: {
        buffer: "partial",
        status: "failed",
        error_code: "LLM_TIMEOUT",
        error_message: longMessage.slice(0, 500),
      },
    });
  });
});

describe("getResumableDraftSession", () => {
  it("normalizes the row into the public ResumableDraft shape", async () => {
    const updatedAt = new Date("2026-05-12T01:00:00Z");
    findUnique.mockResolvedValue({
      id: "ds-1",
      status: "completed",
      buffer: "hello",
      error_code: null,
      error_message: null,
      retrieval: { status: "ok" },
      chapter_index: 2,
      updated_at: updatedAt,
    });
    const { getResumableDraftSession } = await load();

    const result = await getResumableDraftSession("user-1", "novel-1", 2);
    expect(result).toEqual({
      id: "ds-1",
      status: "completed",
      buffer: "hello",
      errorCode: null,
      errorMessage: null,
      retrieval: { status: "ok" },
      chapterIndex: 2,
      updatedAt,
    });
  });

  it("returns null when no row matches the slot", async () => {
    findUnique.mockResolvedValue(null);
    const { getResumableDraftSession } = await load();
    expect(await getResumableDraftSession("user-1", "novel-1", 99)).toBeNull();
  });

  it("leaves a streaming row alone when updated_at is within the TTL (P0-5)", async () => {
    vi.setSystemTime(new Date("2026-05-12T01:00:00Z"));
    const updatedAt = new Date("2026-05-12T00:59:00Z"); // 1 minute ago
    findUnique.mockResolvedValue({
      id: "ds-1",
      status: "streaming",
      buffer: "partial",
      error_code: null,
      error_message: null,
      retrieval: null,
      chapter_index: 2,
      updated_at: updatedAt,
    });
    const { getResumableDraftSession } = await load();

    const result = await getResumableDraftSession("user-1", "novel-1", 2);
    expect(result?.status).toBe("streaming");
    expect(result?.buffer).toBe("partial");
    expect(update).not.toHaveBeenCalled();
  });

  it("flips a stale streaming row to failed STALE_STREAMING_TIMEOUT (P0-5)", async () => {
    vi.setSystemTime(new Date("2026-05-12T01:00:00Z"));
    // 6 minutes ago — past the 5-minute TTL. Stuck because the Serverless
    // function that started the stream was torn down before completeDraft
    // / failDraft could run.
    const updatedAt = new Date("2026-05-12T00:54:00Z");
    findUnique.mockResolvedValue({
      id: "ds-stale",
      status: "streaming",
      buffer: "half-written",
      error_code: null,
      error_message: null,
      retrieval: null,
      chapter_index: 4,
      updated_at: updatedAt,
    });
    update.mockResolvedValue({ id: "ds-stale" });
    const { getResumableDraftSession } = await load();

    const result = await getResumableDraftSession("user-1", "novel-1", 4);
    expect(result).toEqual({
      id: "ds-stale",
      status: "failed",
      buffer: "half-written",
      errorCode: "STALE_STREAMING_TIMEOUT",
      errorMessage: "上次起草超时未完成,请重新生成",
      retrieval: null,
      chapterIndex: 4,
      updatedAt,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "ds-stale" },
      data: {
        status: "failed",
        error_code: "STALE_STREAMING_TIMEOUT",
        error_message: "上次起草超时未完成,请重新生成",
      },
    });
  });

  it("returns failed view even if the sweep DB write loses (P0-5 best-effort)", async () => {
    vi.setSystemTime(new Date("2026-05-12T01:00:00Z"));
    const updatedAt = new Date("2026-05-12T00:50:00Z"); // 10 min ago
    findUnique.mockResolvedValue({
      id: "ds-stale-2",
      status: "streaming",
      buffer: "x",
      error_code: null,
      error_message: null,
      retrieval: null,
      chapter_index: 1,
      updated_at: updatedAt,
    });
    update.mockRejectedValue(new Error("connection lost"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getResumableDraftSession } = await load();

    const result = await getResumableDraftSession("user-1", "novel-1", 1);
    // Caller sees failed even though the row in DB is still streaming —
    // the next read will retry the sweep.
    expect(result?.status).toBe("failed");
    expect(result?.errorCode).toBe("STALE_STREAMING_TIMEOUT");
    warn.mockRestore();
  });
});

describe("dismissDraftSession", () => {
  it("deletes by (user, novel, chapter_index)", async () => {
    deleteMany.mockResolvedValue({ count: 1 });
    const { dismissDraftSession } = await load();

    await dismissDraftSession("user-1", "novel-1", 5);

    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        user_id: "user-1",
        novel_id: "novel-1",
        chapter_index: 5,
      },
    });
  });

  it("swallows delete errors silently", async () => {
    deleteMany.mockRejectedValue(new Error("db unreachable"));
    const { dismissDraftSession } = await load();
    await expect(dismissDraftSession("user-1", "novel-1", 5)).resolves.toBeUndefined();
  });
});
