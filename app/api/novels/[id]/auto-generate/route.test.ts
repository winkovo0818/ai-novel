import { beforeEach, describe, expect, it, vi } from "vitest";

/* ---- mocks ---- */

const novelFindUnique = vi.fn();
const runFindFirst = vi.fn();
const runCreate = vi.fn();
const bibleUpdate = vi.fn();
const jobFindFirst = vi.fn();
const jobCreate = vi.fn();
const jobUpdateMany = vi.fn();
const chapterCount = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    novel: { findUnique: novelFindUnique },
    novelGenerationRun: {
      findFirst: runFindFirst,
      create: runCreate,
      update: vi.fn(),
    },
    bibleDraft: { update: bibleUpdate },
    backgroundJob: {
      findFirst: jobFindFirst,
      create: jobCreate,
      updateMany: jobUpdateMany,
    },
    chapterDraft: { count: chapterCount },
  },
}));

const getRequiredUserId = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  getRequiredUserId,
}));

const safeParse = vi.fn();

vi.mock("@/lib/validation/schemas", () => ({
  BibleDraftSchema: { safeParse },
  NovelProfileSchema: { safeParse },
}));

const createRun = vi.fn();
const markRunning = vi.fn();
const addCost = vi.fn();
const getRun = vi.fn();
const pause = vi.fn();
const cancel = vi.fn();

vi.mock("@/lib/agent/generationRun", () => ({
  createRun,
  markRunning,
  addCost,
  getRun,
  pause,
  cancel,
}));

const enqueueJob = vi.fn();

vi.mock("@/lib/jobs/queue", () => ({
  enqueueJob,
}));

const planOutline = vi.fn();

vi.mock("@/lib/agent/planOutline", () => ({
  planOutline,
}));

/* ---- helpers ---- */

function mockAuth() {
  getRequiredUserId.mockResolvedValue("user-1");
}

function mockNovel(overrides: Record<string, unknown> = {}) {
  novelFindUnique.mockResolvedValue({
    id: "novel-1",
    user_id: "user-1",
    bible: {
      content: {
        meta: { suggested_title: "逆魂纪" },
        characters: [],
        world: { rules: [] },
        outline: {},
      },
    },
    profile: {
      genre_main: "web",
      genre_sub: "玄幻",
      description: "测试",
    },
    ...overrides,
  });
}

const EMPTY_RESPONSE = { active: false };

/* ================================================================ */
/*  GET                                                              */
/* ================================================================ */

describe("GET /api/novels/[id]/auto-generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
  });

  it("returns 401 when unauthenticated", async () => {
    getRequiredUserId.mockRejectedValue(new Error("UNAUTHORIZED"));
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/novels/novel-1/auto-generate"), {
      params: Promise.resolve({ id: "novel-1" }),
    } as never);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 404 for non-existent novel", async () => {
    novelFindUnique.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/novels/nope/auto-generate"), {
      params: Promise.resolve({ id: "nope" }),
    } as never);
    expect(res.status).toBe(404);
  });

  it("returns 404 when novel belongs to another user", async () => {
    mockNovel({ user_id: "other-user" });
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/novels/novel-1/auto-generate"), {
      params: Promise.resolve({ id: "novel-1" }),
    } as never);
    expect(res.status).toBe(404);
  });

  it("returns active:false when no run exists", async () => {
    mockNovel();
    runFindFirst.mockResolvedValue(null);
    chapterCount.mockResolvedValue(0);
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/novels/novel-1/auto-generate"), {
      params: Promise.resolve({ id: "novel-1" }),
    } as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual(EMPTY_RESPONSE);
  });

  it("returns active run data", async () => {
    mockNovel();
    runFindFirst.mockResolvedValue({
      id: "run-1",
      status: "running",
      current_chapter: 5,
      total_chapters: 40,
      cost_cny_spent: 0.15,
      cost_cap_cny: 5,
      quality_floor: 85,
      revision_rounds: 2,
      checkpoint_mode: "on_fail",
      last_error: null,
      created_at: new Date("2026-05-30"),
      updated_at: new Date("2026-05-31"),
    });
    chapterCount.mockResolvedValue(5);
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/novels/novel-1/auto-generate"), {
      params: Promise.resolve({ id: "novel-1" }),
    } as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.active).toBe(true);
    expect(json.data.status).toBe("running");
    expect(json.data.current_chapter).toBe(5);
    expect(json.data.total_chapters).toBe(40);
    expect(json.data.done_chapters).toBe(5);
    expect(json.data.cost_cny_spent).toBe(0.15);
  });
});

/* ================================================================ */
/*  POST (start)                                                     */
/* ================================================================ */

describe("POST /api/novels/[id]/auto-generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    mockNovel();
    safeParse.mockReturnValue({ success: true, data: {} });
    createRun.mockResolvedValue({ id: "run-1" });
    planOutline.mockResolvedValue({
      addedChapters: 32,
      bible: { meta: { suggested_title: "逆魂纪" }, characters: [], world: { rules: [] }, outline: {} },
      cost: { cny: 0.005 },
      model: "mimo-v2.5-pro",
    });
    markRunning.mockResolvedValue({ id: "run-1", status: "running" });
    getRun.mockResolvedValue({ id: "run-1", status: "running" });
    enqueueJob.mockResolvedValue({ id: "job-1" });
    addCost.mockResolvedValue({});
    runFindFirst.mockResolvedValue(null); // 无活跃 run
  });

  it("returns 401 when unauthenticated", async () => {
    getRequiredUserId.mockRejectedValue(new Error("UNAUTHORIZED"));
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/novels/novel-1/auto-generate", {
        method: "POST",
        body: JSON.stringify({ total_chapters: 40 }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) } as never,
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when novel has no bible", async () => {
    safeParse.mockReturnValue({ success: false, error: { issues: [] } });
    mockNovel({ bible: null });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/novels/novel-1/auto-generate", {
        method: "POST",
        body: JSON.stringify({ total_chapters: 40 }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) } as never,
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("NO_BIBLE");
  });

  it("returns 409 when an active run already exists", async () => {
    runFindFirst.mockResolvedValue({ id: "old-run", status: "running" });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/novels/novel-1/auto-generate", {
        method: "POST",
        body: JSON.stringify({ total_chapters: 40 }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) } as never,
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe("RUN_ACTIVE");
  });

  it("starts a new run with defaults when body is empty", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/novels/novel-1/auto-generate", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "novel-1" }) } as never,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.id).toBe("run-1");
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({ totalChapters: 40, userId: "user-1" }),
    );
    expect(planOutline).toHaveBeenCalledWith(
      expect.objectContaining({ targetChapters: 40 }),
    );
    expect(markRunning).toHaveBeenCalledWith("run-1");
    expect(enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "generate_chapter",
        payload: expect.objectContaining({ chapter_index: 1 }),
      }),
    );
  });

  it("starts a run with custom config", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/novels/novel-1/auto-generate", {
        method: "POST",
        body: JSON.stringify({
          total_chapters: 20,
          quality_floor: 80,
          revision_rounds: 3,
          cost_cap_cny: 10,
          checkpoint_mode: "per_volume",
        }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) } as never,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.total_chapters).toBe(20);
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        totalChapters: 20,
        qualityFloor: 80,
        revisionRounds: 3,
        costCapCny: 10,
      }),
    );
  });

  it("continues even when planOutline fails", async () => {
    planOutline.mockRejectedValue(new Error("LLM timeout"));
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/novels/novel-1/auto-generate", {
        method: "POST",
        body: JSON.stringify({ total_chapters: 40 }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) } as never,
    );
    // 不应因大纲失败而中断，仍应标记 running 并入队
    expect(res.status).toBe(200);
    expect(markRunning).toHaveBeenCalled();
    expect(enqueueJob).toHaveBeenCalled();
  });

  it("rejects total_chapters > 80", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/novels/novel-1/auto-generate", {
        method: "POST",
        body: JSON.stringify({ total_chapters: 100 }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) } as never,
    );
    expect(res.status).toBe(400);
  });
});

/* ================================================================ */
/*  PATCH (pause / cancel)                                           */
/* ================================================================ */

describe("PATCH /api/novels/[id]/auto-generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    mockNovel();
  });

  it("pauses a running run", async () => {
    runFindFirst.mockResolvedValue({ id: "run-1", status: "running" });
    pause.mockResolvedValue({ id: "run-1", status: "paused" });
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("http://localhost/api/novels/novel-1/auto-generate", {
        method: "PATCH",
        body: JSON.stringify({ action: "pause" }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) } as never,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe("paused");
  });

  it("returns 404 when pausing with no running run", async () => {
    runFindFirst.mockResolvedValue(null);
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("http://localhost/api/novels/novel-1/auto-generate", {
        method: "PATCH",
        body: JSON.stringify({ action: "pause" }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) } as never,
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe("NO_ACTIVE_RUN");
  });

  it("cancels a paused run", async () => {
    runFindFirst.mockResolvedValue({ id: "run-1", status: "paused" });
    cancel.mockResolvedValue({ id: "run-1", status: "cancelled" });
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("http://localhost/api/novels/novel-1/auto-generate", {
        method: "PATCH",
        body: JSON.stringify({ action: "cancel" }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) } as never,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe("cancelled");
  });

  it("returns 400 for unknown action", async () => {
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("http://localhost/api/novels/novel-1/auto-generate", {
        method: "PATCH",
        body: JSON.stringify({ action: "restart" }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) } as never,
    );
    expect(res.status).toBe(400);
  });
});
