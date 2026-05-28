import { beforeEach, describe, expect, it, vi } from "vitest";

const findUniqueNovel = vi.fn();
const findManyChapters = vi.fn();
const findManyJobs = vi.fn();
const createJob = vi.fn();
const getRequiredUserId = vi.fn();
const groupBy = vi.fn();
let jobIdCounter = 0;

interface CreateJobCall {
  data: {
    type: string;
  };
}

vi.mock("@/lib/db", () => ({
  prisma: {
    novel: { findUnique: findUniqueNovel },
    chapterDraft: { findMany: findManyChapters },
    memoryChunk: { groupBy },
    backgroundJob: {
      findMany: findManyJobs,
      create: createJob,
    },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getRequiredUserId,
}));

beforeEach(() => {
  vi.clearAllMocks();
  jobIdCounter = 0;
  findManyJobs.mockResolvedValue([]);
  groupBy.mockResolvedValue([]);
});

describe("POST /api/novels/[id]/jobs/refresh-dirty", () => {
  it("returns 404 when the novel does not exist", async () => {
    findUniqueNovel.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/novels/missing/jobs/refresh-dirty", { method: "POST" }),
      { params: Promise.resolve({ id: "missing" }) },
    );

    expect(res.status).toBe(404);
    expect(findManyChapters).not.toHaveBeenCalled();
    expect(createJob).not.toHaveBeenCalled();
  });

  it("returns 401 when the caller is not authenticated", async () => {
    findUniqueNovel.mockResolvedValue({ id: "n-1", user_id: "u-1" });
    getRequiredUserId.mockRejectedValue(new Error("UNAUTHORIZED"));
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/novels/n-1/jobs/refresh-dirty", { method: "POST" }),
      { params: Promise.resolve({ id: "n-1" }) },
    );

    expect(res.status).toBe(401);
    expect(createJob).not.toHaveBeenCalled();
  });

  it("hides another user's novel as 404", async () => {
    findUniqueNovel.mockResolvedValue({ id: "n-1", user_id: "u-other" });
    getRequiredUserId.mockResolvedValue("u-1");
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/novels/n-1/jobs/refresh-dirty", { method: "POST" }),
      { params: Promise.resolve({ id: "n-1" }) },
    );
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe("NOVEL_NOT_FOUND");
    expect(createJob).not.toHaveBeenCalled();
  });

  it("enqueues nothing when no chapter is dirty", async () => {
    findUniqueNovel.mockResolvedValue({ id: "n-1", user_id: "u-1" });
    getRequiredUserId.mockResolvedValue("u-1");
    findManyChapters.mockResolvedValue([]);
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/novels/n-1/jobs/refresh-dirty", { method: "POST" }),
      { params: Promise.resolve({ id: "n-1" }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({
      summarize_queued: 0,
      index_queued: 0,
      summaries_queued: 0,
      chapters_scanned: 0,
      enqueued: [],
    });
    expect(createJob).not.toHaveBeenCalled();
  });

  it("scans all chapters and enqueues work for chapters with dirty flags or missing summary/index", async () => {
    findUniqueNovel.mockResolvedValue({ id: "n-1", user_id: "u-1" });
    getRequiredUserId.mockResolvedValue("u-1");
    findManyChapters.mockResolvedValue([
      { id: "c-1", summary_dirty: true, index_dirty: false, content: "正文 1", summary: null },
    ]);
    createJob.mockImplementation(({ data }) => Promise.resolve({
      id: `j-${++jobIdCounter}`,
      type: data.type,
      status: "pending",
    }));

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/novels/n-1/jobs/refresh-dirty", { method: "POST" }),
      { params: Promise.resolve({ id: "n-1" }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(findManyChapters).toHaveBeenCalledWith({
      where: { novel_id: "n-1" },
      include: { summary: true },
      orderBy: { chapter_index: "asc" },
    });
    expect(json.data).toMatchObject({
      summarize_queued: 1,
      index_queued: 1,
      chapters_scanned: 1,
    });
    expect(json.data.enqueued).toEqual([
      { id: "j-1", type: "summarize_chapter", status: "pending" },
      { id: "j-2", type: "index_chapter", status: "pending" },
      { id: "j-3", type: "refresh_summaries", status: "pending" },
    ]);
  });

  it("enqueues only the dirty side per chapter and adds refresh_summaries when any summary fired", async () => {
    findUniqueNovel.mockResolvedValue({ id: "n-1", user_id: "u-1" });
    getRequiredUserId.mockResolvedValue("u-1");
    findManyChapters.mockResolvedValue([
      // both dirty → queues summarize + index
      { id: "c-1", summary_dirty: true, index_dirty: true, content: "正文 1" },
      // only index dirty → queues only index
      { id: "c-2", summary_dirty: false, index_dirty: true, content: "正文 2" },
      // only summary dirty → queues only summarize
      { id: "c-3", summary_dirty: true, index_dirty: false, content: "正文 3" },
    ]);
    createJob.mockImplementation(({ data }) => Promise.resolve({
      id: `j-${++jobIdCounter}`,
      type: data.type,
      status: "pending",
    }));

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/novels/n-1/jobs/refresh-dirty", { method: "POST" }),
      { params: Promise.resolve({ id: "n-1" }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({
      summarize_queued: 3,
      index_queued: 3,
      summaries_queued: 1,
      chapters_scanned: 3,
      enqueued: [
        { id: "j-1", type: "summarize_chapter", status: "pending" },
        { id: "j-2", type: "index_chapter", status: "pending" },
        { id: "j-3", type: "summarize_chapter", status: "pending" },
        { id: "j-4", type: "index_chapter", status: "pending" },
        { id: "j-5", type: "summarize_chapter", status: "pending" },
        { id: "j-6", type: "index_chapter", status: "pending" },
        { id: "j-7", type: "refresh_summaries", status: "pending" },
      ],
    });
    // c-1: sum+idx, c-2: sum+idx (mock returns null for include), c-3: sum+idx = 3+3 + 1 refresh = 7 enqueueJob calls
    expect(createJob).toHaveBeenCalledTimes(7);
    expect(findManyJobs).not.toHaveBeenCalled();
    const types = createJob.mock.calls.map(([args]) => (args as CreateJobCall).data.type);
    expect(types.filter((t: string) => t === "summarize_chapter")).toHaveLength(3);
    expect(types.filter((t: string) => t === "index_chapter")).toHaveLength(3);
    expect(types.filter((t: string) => t === "refresh_summaries")).toHaveLength(1);
  });

  it("skips chapters with empty content even when flagged dirty", async () => {
    findUniqueNovel.mockResolvedValue({ id: "n-1", user_id: "u-1" });
    getRequiredUserId.mockResolvedValue("u-1");
    findManyChapters.mockResolvedValue([
      { id: "c-1", summary_dirty: true, index_dirty: true, content: "   " },
      { id: "c-2", summary_dirty: true, index_dirty: false, content: "" },
    ]);

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/novels/n-1/jobs/refresh-dirty", { method: "POST" }),
      { params: Promise.resolve({ id: "n-1" }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({
      summarize_queued: 0,
      index_queued: 0,
      summaries_queued: 0,
      chapters_scanned: 2,
      enqueued: [],
    });
    expect(createJob).not.toHaveBeenCalled();
  });

  it("does NOT enqueue refresh_summaries when only index work fires", async () => {
    findUniqueNovel.mockResolvedValue({ id: "n-1", user_id: "u-1" });
    getRequiredUserId.mockResolvedValue("u-1");
    findManyChapters.mockResolvedValue([
      { id: "c-1", summary_dirty: false, index_dirty: true, content: "正文", summary: { summary: "x" } },
    ]);
    createJob.mockResolvedValue({ id: "j-x" });

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/novels/n-1/jobs/refresh-dirty", { method: "POST" }),
      { params: Promise.resolve({ id: "n-1" }) },
    );
    const json = await res.json();

    expect(json.data.summarize_queued).toBe(0);
    expect(json.data.index_queued).toBe(1);
    // No chapter summary churn → volume / novel summaries can't go stale.
    expect(json.data.summaries_queued).toBe(0);
    const types = createJob.mock.calls.map((args) => args[0].data.type);
    expect(types).not.toContain("refresh_summaries");
  });
});
