import { beforeEach, describe, expect, it, vi } from "vitest";

/* ---- mocks ---- */

const novelFindUnique = vi.fn();
const runFindFirst = vi.fn();
const runCreate = vi.fn();
const bibleUpdate = vi.fn();
const jobFindFirst = vi.fn();
const jobCreate = vi.fn();
const jobUpdateMany = vi.fn();
const chapterCount = vi.fn(), chapterFindMany = vi.fn(), runUpdateMany = vi.fn(), runLatest = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
      $queryRaw: vi.fn().mockResolvedValue([]), chapterDraft: { findMany: chapterFindMany },
      novelGenerationRun: { findFirst: runFindFirst, create: runCreate, updateMany: runUpdateMany, findUniqueOrThrow: runLatest },
      bibleDraft: { update: bibleUpdate }, backgroundJob: { create: jobCreate },
    }),
    novel: { findUnique: novelFindUnique },
    novelGenerationRun: {
      findFirst: runFindFirst,
      create: runCreate,
      update: vi.fn(), updateMany: runUpdateMany,
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
    vi.resetAllMocks(); mockAuth(); mockNovel();
    safeParse.mockReturnValue({ success: true, data: {} });
    runFindFirst.mockResolvedValue(null); chapterFindMany.mockResolvedValue([]);
    runCreate.mockImplementation(async ({ data }) => ({ id: "run-1", ...data }));
    runUpdateMany.mockResolvedValue({ count: 1 });
    runLatest.mockResolvedValue({ id: "run-1", status: "planning", cost_cny_spent: 0, cost_cap_cny: null });
    getRun.mockResolvedValue({ id: "run-1", status: "running" });
    planOutline.mockResolvedValue({ addedChapters: 1, bible: {}, cost: { cny: 0.005 } });
  });
  const start = async (body = {}) => (await import("./route")).POST(new Request("http://localhost/auto-generate", {
    method: "POST", body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: "novel-1" }) });
  it("requires authentication", async () => {
    getRequiredUserId.mockRejectedValue(new Error("unauthorized")); expect((await start()).status).toBe(401);
  });
  it("requires a Bible", async () => { mockNovel({ bible: null }); expect((await start()).status).toBe(400); });
  it("rejects a second active run", async () => {
    runFindFirst.mockResolvedValue({ status: "running" }); expect((await start()).status).toBe(409);
    expect(runCreate).not.toHaveBeenCalled();
  });
  it("starts with validated defaults and enqueues atomically", async () => {
    expect((await start()).status).toBe(200);
    expect(runCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ checkpoint_mode: "on_fail", revision_rounds: 2, quality_floor: 85 }) });
    expect(jobCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ type: "plan_outline", payload: { novel_id: "novel-1", target_chapters: 40, run_id: "run-1" } }) });
  });
  it("persists per_volume to the actual checkpoint field", async () => {
    await start({ checkpoint_mode: "per_volume", revision_rounds: 0 });
    expect(runCreate.mock.calls[0][0].data.checkpoint_mode).toBe("per_volume");
    expect(runCreate.mock.calls[0][0].data.revision_rounds).toBe(0);
  });
  it("persists max_state_changes into the run config, defaulting to 30", async () => {
    await start({ max_state_changes: 25 });
    expect(runCreate.mock.calls[0][0].data.config.max_state_changes).toBe(25);
    runCreate.mockClear();
    await start();
    expect(runCreate.mock.calls[0][0].data.config.max_state_changes).toBe(30);
  });
  it.each([{ total_chapters: 81 }, { revision_rounds: -1 }, { revision_rounds: 1.5 }, { quality_floor: 101 }, { cost_cap_cny: -1 }, { checkpoint_mode: "other" }, { max_state_changes: 4 }, { max_state_changes: 41 }])("rejects invalid config %j", async body => {
    expect((await start(body)).status).toBe(400); expect(runCreate).not.toHaveBeenCalled();
  });
  it("returns planning without calling the model inside HTTP", async () => {
    const response = await start(); expect((await response.json()).data.status).toBe("planning");
    expect(planOutline).not.toHaveBeenCalled(); expect(bibleUpdate).not.toHaveBeenCalled();
  });
  it("starts a rolling horizon after 80 existing chapters", async () => {
    chapterFindMany.mockResolvedValue(Array.from({ length: 80 }, (_, i) => ({ chapter_index: i + 1, content: "已完成", status: "done" })));
    await start({ continuous: true, planning_window: 10, cost_cap_cny: 5 });
    expect(runCreate.mock.calls[0][0].data).toMatchObject({ current_chapter: 80, total_chapters: 90, config: { continuous: true, planning_window: 10 } });
    expect(jobCreate.mock.calls[0][0].data.payload.target_chapters).toBe(90);
  });
  it.each([{ continuous: true }, { continuous: true, cost_cap_cny: 5, checkpoint_mode: "none" }, { planning_window: 21 }, { continuous: "yes" }])("rejects unsafe continuous config %j", async body => {
    expect((await start(body)).status).toBe(400); expect(runCreate).not.toHaveBeenCalled();
  });
  it("starts after existing completed chapters", async () => {
    chapterFindMany.mockResolvedValue([{ chapter_index: 1, content: "old", status: "done" }]);
    await start();
    expect(runCreate.mock.calls[0][0].data.current_chapter).toBe(1);
    expect(jobCreate.mock.calls[0][0].data.type).toBe("plan_outline");
  });
  it("refuses to overwrite the next existing draft", async () => {
    chapterFindMany.mockResolvedValue([{ chapter_index: 1, content: "old", status: "draft" }]);
    expect((await start()).status).toBe(409); expect(runCreate).not.toHaveBeenCalled();
  });

});

describe("PATCH /api/novels/[id]/auto-generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runUpdateMany.mockResolvedValue({ count: 1 });
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


describe("budget and state races", () => {
  beforeEach(() => { vi.resetAllMocks(); mockAuth(); mockNovel(); runUpdateMany.mockResolvedValue({ count: 1 }); });
  const patch = async (body: unknown) => (await import("./route")).PATCH(new Request("http://localhost/auto-generate", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "novel-1" }) });
  it("increases a paused run's cumulative budget without resuming it", async () => {
    runFindFirst.mockResolvedValue({ id: "run-1", status: "paused", cost_cap_cny: 5, cost_cny_spent: 5.1 });
    expect((await patch({ action: "budget", cost_cap_cny: 10 })).status).toBe(200);
    expect(runUpdateMany.mock.calls[0][0].data).toEqual({ cost_cap_cny: 10 });
  });
  it.each([0, -1, 5, 5.1, "10"])("refuses invalid or insufficient budget %j", async amount => {
    runFindFirst.mockResolvedValue({ id: "run-1", status: "paused", cost_cap_cny: 5, cost_cny_spent: 5.1 });
    expect((await patch({ action: "budget", cost_cap_cny: amount })).status).toBe(400);
    expect(runUpdateMany).not.toHaveBeenCalled();
  });
  it("changes a daily budget with a CAS and requires explicit resumption", async () => {
    const updated = new Date(0);
    runFindFirst.mockResolvedValue({id: "run-1", status: "paused", updated_at: updated, pause_reason: "daily_budget", config: {continuous: true, unlimited_budget: true, custom: "keep", daily_cost_cap_cny: 2}});
    expect((await patch({action: "daily_budget", daily_cost_cap_cny: 3})).status).toBe(200);
    expect(runUpdateMany.mock.calls[0][0]).toMatchObject({where: {updated_at: updated}, data: {config: {custom: "keep", daily_cost_cap_cny: 3, unlimited_budget: true}, pause_reason: "manual", resume_after: null}});
    runUpdateMany.mockClear();
    expect((await patch({action: "daily_budget", daily_cost_cap_cny: null})).status).toBe(200);
    expect(runUpdateMany.mock.calls[0][0].data.config).not.toHaveProperty("daily_cost_cap_cny");
  });
  it.each([0, -1, "2", undefined])("refuses invalid daily budgets %j", async amount => {
    expect((await patch({action: "daily_budget", daily_cost_cap_cny: amount})).status).toBe(400);
    expect(runUpdateMany).not.toHaveBeenCalled();
  });
  it("can manually stop a scheduled wakeup", async () => {
    runFindFirst.mockResolvedValue({id: "run-1", status: "paused", pause_reason: "quota"});
    expect((await patch({action: "pause"})).status).toBe(200);
    expect(runUpdateMany.mock.calls[0][0].data).toMatchObject({pause_reason: "manual", resume_after: null});
  });
  it("cannot pause a run that completed concurrently", async () => {
    runFindFirst.mockResolvedValue({ id: "run-1", status: "running" }); runUpdateMany.mockResolvedValue({ count: 0 });
    expect((await patch({ action: "pause" })).status).toBe(409);
  });
});
