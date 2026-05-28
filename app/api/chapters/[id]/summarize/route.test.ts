import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const upsert = vi.fn();
const updateChapter = vi.fn();
const aggregate = vi.fn();
const transaction = vi.fn();
const getRequiredUserId = vi.fn();
const chatCompletion = vi.fn();
const enqueueJob = vi.fn();
const runPendingJobsForNovel = vi.fn();
const logError = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    chapterDraft: { findUnique, update: updateChapter },
    chapterSummary: { upsert },
    llmUsage: { aggregate },
    $transaction: transaction,
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getRequiredUserId,
}));

vi.mock("@/lib/llm/client", () => ({
  chatCompletion,
}));

vi.mock("@/lib/jobs/queue", () => ({
  enqueueJob,
  runPendingJobsForNovel,
}));

vi.mock("@/lib/jobs/handlers", () => ({}));

vi.mock("@/lib/observability/logger", () => ({
  errorMessage: (err: unknown) => err instanceof Error ? err.message : String(err),
  logError,
}));

beforeEach(() => {
  vi.clearAllMocks();
  aggregate.mockResolvedValue({ _sum: { cost_cny: 0 }, _count: 0 });
  transaction.mockImplementation(async (ops: unknown[]) => ops);
  enqueueJob.mockResolvedValue({ id: "job-1" });
  runPendingJobsForNovel.mockResolvedValue(0);
});

describe("POST /api/chapters/[id]/summarize ownership", () => {
  it("returns 404 when chapter belongs to another user", async () => {
    findUnique.mockResolvedValue({
      id: "chapter-1",
      content: "正文",
      novel_id: "novel-1",
      novel: { user_id: "owner-1" },
    });
    getRequiredUserId.mockResolvedValue("owner-2");

    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/x", { method: "POST" }), {
      params: Promise.resolve({ id: "chapter-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe("CHAPTER_NOT_FOUND");
    expect(chatCompletion).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    findUnique.mockResolvedValue({
      id: "chapter-1",
      content: "正文",
      novel_id: "novel-1",
      novel: { user_id: "owner-1" },
    });
    getRequiredUserId.mockRejectedValue(new Error("UNAUTHORIZED"));

    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/x", { method: "POST" }), {
      params: Promise.resolve({ id: "chapter-1" }),
    });
    expect(res.status).toBe(401);
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it("returns 404 when chapter does not exist", async () => {
    findUnique.mockResolvedValue(null);

    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/x", { method: "POST" }), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 429 when daily cost quota is exceeded", async () => {
    findUnique.mockResolvedValue({
      id: "chapter-1",
      content: "正文",
      novel_id: "novel-1",
      novel: { user_id: "owner-1" },
    });
    getRequiredUserId.mockResolvedValue("owner-1");
    aggregate
      .mockResolvedValueOnce({ _sum: { cost_cny: 60 }, _count: 5 })
      .mockResolvedValueOnce({ _sum: { cost_cny: 60 }, _count: 5 });

    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/x", { method: "POST" }), {
      params: Promise.resolve({ id: "chapter-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.error.code).toBe("QUOTA_EXCEEDED");
    expect(chatCompletion).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("previews a regenerated summary with diff metadata without writing", async () => {
    findUnique.mockResolvedValue({
      id: "chapter-1",
      novel_id: "novel-1",
      chapter_index: 1,
      title: "第一章",
      content: "正文",
      novel: { user_id: "owner-1" },
      summary: { summary: "旧摘要" },
    });
    getRequiredUserId.mockResolvedValue("owner-1");
    chatCompletion.mockResolvedValue({ content: " 新摘要 " });

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({ mode: "preview" }),
      }),
      { params: Promise.resolve({ id: "chapter-1" }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toMatchObject({
      mode: "preview",
      previousSummary: "旧摘要",
      summary: "新摘要",
      diff: {
        changed: true,
        beforeCharacters: 3,
        afterCharacters: 3,
      },
    });
    expect(upsert).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("applies a previewed summary and schedules derived memory refreshes without calling the LLM", async () => {
    findUnique.mockResolvedValue({
      id: "chapter-1",
      novel_id: "novel-1",
      chapter_index: 1,
      title: "第一章",
      content: "正文",
      novel: { user_id: "owner-1" },
      summary: { summary: "旧摘要" },
    });
    getRequiredUserId.mockResolvedValue("owner-1");

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({ mode: "apply", summary: " 新摘要 " }),
      }),
      { params: Promise.resolve({ id: "chapter-1" }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toMatchObject({
      mode: "apply",
      previousSummary: "旧摘要",
      summary: "新摘要",
      diff: { changed: true },
    });
    expect(chatCompletion).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledWith({
      where: { chapter_id: "chapter-1" },
      create: { chapter_id: "chapter-1", summary: "新摘要" },
      update: { summary: "新摘要" },
    });
    expect(updateChapter).toHaveBeenCalledWith({
      where: { id: "chapter-1" },
      data: { summary_dirty: false },
    });
    expect(enqueueJob).toHaveBeenCalledWith({
      type: "refresh_summaries",
      payload: { novel_id: "novel-1" },
      novelId: "novel-1",
    });
    expect(enqueueJob).toHaveBeenCalledTimes(1);
    expect(runPendingJobsForNovel).toHaveBeenCalledWith("novel-1");
  });

  it("requires a non-empty summary before applying", async () => {
    findUnique.mockResolvedValue({
      id: "chapter-1",
      novel_id: "novel-1",
      chapter_index: 1,
      title: "第一章",
      content: "正文",
      novel: { user_id: "owner-1" },
      summary: null,
    });
    getRequiredUserId.mockResolvedValue("owner-1");

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({ mode: "apply", summary: "  " }),
      }),
      { params: Promise.resolve({ id: "chapter-1" }) },
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("INVALID_INPUT");
    expect(chatCompletion).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });
});
