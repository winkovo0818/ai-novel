import { beforeEach, describe, expect, it, vi } from "vitest";

const findUniqueChapter = vi.fn();
const upsertSummary = vi.fn();
const updateChapter = vi.fn();
const $transaction = vi.fn();
const chatCompletion = vi.fn();
const indexChapter = vi.fn();
const refreshSummaries = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    chapterDraft: { findUnique: findUniqueChapter, update: updateChapter },
    chapterSummary: { upsert: upsertSummary },
    $transaction,
  },
}));

vi.mock("@/lib/llm/client", () => ({
  chatCompletion,
  chatCompletionWithRetry: chatCompletion,
}));

vi.mock("@/lib/agent/chunking", () => ({
  indexChapter,
}));

vi.mock("@/lib/agent/summaries", () => ({
  refreshSummaries,
}));

// We re-import inside each test so the registerHandler() side-effect runs
// once per fresh module — otherwise the registry would carry handlers
// between cases.
async function loadModule() {
  vi.resetModules();
  return import("./handlers");
}

// We hand-roll a queue stub so we can capture which handler is registered
// for each job type and invoke it directly.
const handlerRegistry = new Map<string, (payload: unknown) => Promise<void>>();

vi.mock("./queue", () => ({
  registerHandler: (type: string, handler: (payload: unknown) => Promise<void>) => {
    handlerRegistry.set(type, handler);
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  handlerRegistry.clear();
  // Default: $transaction passthrough so we can assert what was passed.
  $transaction.mockImplementation(async (ops: unknown[]) => ops);
});

describe("summarize_chapter handler", () => {
  it("upserts the summary AND clears summary_dirty in one transaction", async () => {
    await loadModule();
    findUniqueChapter.mockResolvedValue({
      id: "c-1",
      chapter_index: 1,
      title: "第一章",
      content: "正文内容".repeat(20),
    });
    chatCompletion.mockResolvedValue({ content: "  生成的摘要 " });

    const handler = handlerRegistry.get("summarize_chapter");
    expect(handler).toBeDefined();
    await handler!({ chapter_id: "c-1" });

    expect(chatCompletion).toHaveBeenCalledTimes(1);
    expect(chatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "summarizer",
        route: "/jobs/summarize_chapter",
        temperature: 0,
      }),
      1,
    );
    // M3.1 contract: clear summary_dirty alongside the upsert so the
    // chapter management page badge flips off the moment the row lands.
    expect($transaction).toHaveBeenCalledTimes(1);
    expect(upsertSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { chapter_id: "c-1" },
        create: expect.objectContaining({ chapter_id: "c-1", summary: "生成的摘要" }),
        update: { summary: "生成的摘要" },
      }),
    );
    expect(updateChapter).toHaveBeenCalledWith({
      where: { id: "c-1" },
      data: { summary_dirty: false },
    });
  });

  it("rejects payloads missing chapter_id", async () => {
    await loadModule();
    const handler = handlerRegistry.get("summarize_chapter")!;
    await expect(handler({ wrong_key: "x" })).rejects.toThrow(/Invalid summarize_chapter payload/);
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it("returns silently for a missing chapter without writing anything", async () => {
    await loadModule();
    findUniqueChapter.mockResolvedValue(null);
    const handler = handlerRegistry.get("summarize_chapter")!;
    await handler({ chapter_id: "missing" });

    expect(chatCompletion).not.toHaveBeenCalled();
    expect(upsertSummary).not.toHaveBeenCalled();
    expect(updateChapter).not.toHaveBeenCalled();
  });

  it("skips chapters whose content is whitespace-only", async () => {
    await loadModule();
    findUniqueChapter.mockResolvedValue({
      id: "c-1",
      chapter_index: 1,
      title: "空章",
      content: "   \n  ",
    });
    const handler = handlerRegistry.get("summarize_chapter")!;
    await handler({ chapter_id: "c-1" });

    expect(chatCompletion).not.toHaveBeenCalled();
    // Don't clear summary_dirty for empty content — the next save with content
    // will re-set it via PATCH; clearing now would lie about freshness.
    expect(updateChapter).not.toHaveBeenCalled();
  });
});

describe("index_chapter handler", () => {
  it("calls indexChapter then clears index_dirty", async () => {
    await loadModule();
    findUniqueChapter.mockResolvedValue({
      id: "c-1",
      content: "正文内容",
    });

    const handler = handlerRegistry.get("index_chapter")!;
    await handler({ novel_id: "n-1", chapter_id: "c-1" });

    expect(indexChapter).toHaveBeenCalledWith("n-1", "c-1", "正文内容");
    expect(updateChapter).toHaveBeenCalledWith({
      where: { id: "c-1" },
      data: { index_dirty: false },
    });
  });

  it("rejects payloads missing novel_id or chapter_id", async () => {
    await loadModule();
    const handler = handlerRegistry.get("index_chapter")!;
    await expect(handler({ chapter_id: "c" })).rejects.toThrow(/Invalid index_chapter payload/);
    await expect(handler({ novel_id: "n" })).rejects.toThrow(/Invalid index_chapter payload/);
    expect(indexChapter).not.toHaveBeenCalled();
  });

  it("returns silently when chapter is missing or content is empty", async () => {
    await loadModule();
    const handler = handlerRegistry.get("index_chapter")!;

    findUniqueChapter.mockResolvedValueOnce(null);
    await handler({ novel_id: "n-1", chapter_id: "missing" });

    findUniqueChapter.mockResolvedValueOnce({ id: "c-1", content: "" });
    await handler({ novel_id: "n-1", chapter_id: "c-1" });

    expect(indexChapter).not.toHaveBeenCalled();
    expect(updateChapter).not.toHaveBeenCalled();
  });

  it("does not clear index_dirty when indexChapter throws", async () => {
    await loadModule();
    findUniqueChapter.mockResolvedValue({ id: "c-1", content: "正文" });
    indexChapter.mockRejectedValue(new Error("embedding 503"));

    const handler = handlerRegistry.get("index_chapter")!;
    await expect(handler({ novel_id: "n-1", chapter_id: "c-1" })).rejects.toThrow(/embedding 503/);
    // Failed run must not flip the bit — otherwise the management page
    // would mis-report stale chunks as fresh after a transient outage.
    expect(updateChapter).not.toHaveBeenCalled();
  });
});

describe("refresh_summaries handler", () => {
  it("delegates to refreshSummaries with novel_id from payload", async () => {
    await loadModule();
    refreshSummaries.mockResolvedValue({ refreshedVolumes: [0], novelSummaryUpdated: true });

    const handler = handlerRegistry.get("refresh_summaries")!;
    await handler({ novel_id: "n-1" });

    expect(refreshSummaries).toHaveBeenCalledWith("n-1");
  });

  it("rejects payloads missing novel_id", async () => {
    await loadModule();
    const handler = handlerRegistry.get("refresh_summaries")!;
    await expect(handler({})).rejects.toThrow(/Invalid refresh_summaries payload/);
    expect(refreshSummaries).not.toHaveBeenCalled();
  });
});

describe("registerJobHandlers idempotency", () => {
  it("registers each handler exactly once even if called twice", async () => {
    const { registerJobHandlers } = await loadModule();
    handlerRegistry.clear();
    // Re-invoke explicitly. The module body already called it on import, so
    // this is the second call; the guard should make it a no-op. We then
    // call it again to be sure.
    registerJobHandlers();
    registerJobHandlers();
    // After explicit calls, no NEW registrations land in our registry mock
    // (the registered=true short-circuit fires).
    expect(handlerRegistry.size).toBe(0);
  });
});
