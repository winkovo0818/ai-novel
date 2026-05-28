import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const roleFindUnique = vi.fn();
const usageFindMany = vi.fn();
const usageCount = vi.fn();
const usageAggregate = vi.fn();
const usageGroupBy = vi.fn();
const userFindMany = vi.fn();
const novelFindMany = vi.fn();
const getCurrentUser = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    userRole: { findUnique: roleFindUnique },
    llmUsage: {
      findMany: usageFindMany,
      count: usageCount,
      aggregate: usageAggregate,
      groupBy: usageGroupBy,
    },
    user: { findMany: userFindMany },
    novel: { findMany: novelFindMany },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser,
}));

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  roleFindUnique.mockResolvedValue(null);
  delete process.env.ADMIN_USER_IDS;
  delete process.env.ADMIN_EMAILS;
});

function asAdminViaEnv(userId = "admin-1") {
  getCurrentUser.mockResolvedValue({ id: userId, email: null });
  process.env.ADMIN_USER_IDS = userId;
}

describe("GET /api/admin/ai-calls", () => {
  it("returns 401 when unauthenticated", async () => {
    getCurrentUser.mockResolvedValue(null);
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/admin/ai-calls"));

    expect(response.status).toBe(401);
    expect(usageFindMany).not.toHaveBeenCalled();
  });

  it("returns cost aggregates by user, novel, agent, and model", async () => {
    asAdminViaEnv();
    usageFindMany.mockResolvedValue([
      {
        id: "usage-1",
        user_id: "user-1",
        novel_id: "novel-1",
        route: "/api/novels/:id/chapters/draft",
        agent: "writer",
        model: "deepseek-chat",
        token_in: 100,
        token_out: 200,
        cost_cny: 0.2,
        status: "ok",
        error_code: null,
        took_ms: 1000,
        created_at: new Date("2026-05-28T08:00:00.000Z"),
      },
    ]);
    usageCount.mockResolvedValue(1);
    usageAggregate.mockResolvedValue({
      _count: 3,
      _sum: { token_in: 300, token_out: 600, cost_cny: 1.2 },
    });
    usageGroupBy
      .mockResolvedValueOnce([
        { user_id: "user-1", _count: 2, _sum: { token_in: 200, token_out: 300, cost_cny: 0.8 } },
      ])
      .mockResolvedValueOnce([
        { novel_id: "novel-1", _count: 2, _sum: { token_in: 200, token_out: 300, cost_cny: 0.8 } },
      ])
      .mockResolvedValueOnce([
        { agent: "writer", status: "ok", _count: 2, _sum: { token_in: 200, token_out: 300, cost_cny: 0.7 } },
        { agent: "writer", status: "err", _count: 1, _sum: { token_in: 50, token_out: 0, cost_cny: 0.1 } },
      ])
      .mockResolvedValueOnce([
        { model: "deepseek-chat", _count: 3, _sum: { token_in: 250, token_out: 300, cost_cny: 0.8 } },
      ]);
    userFindMany.mockResolvedValue([{ id: "user-1", email: "writer@example.com", name: "Writer" }]);
    novelFindMany.mockResolvedValue([{ id: "novel-1", title: "星河纪", user_id: "user-1" }]);

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/admin/ai-calls?page=1&perPage=50"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.summary.totalCostCny).toBe(1.2);
    expect(json.data.aggregates.byUser[0]).toEqual({
      userId: "user-1",
      email: "writer@example.com",
      name: "Writer",
      calls: 2,
      tokenIn: 200,
      tokenOut: 300,
      costCny: 0.8,
    });
    expect(json.data.aggregates.byNovel[0]).toEqual({
      novelId: "novel-1",
      title: "星河纪",
      userId: "user-1",
      calls: 2,
      tokenIn: 200,
      tokenOut: 300,
      costCny: 0.8,
    });
    expect(json.data.aggregates.byAgent[0]).toEqual(expect.objectContaining({
      agent: "writer",
      calls: 3,
      failures: 1,
      failureRate: 1 / 3,
    }));
    expect(json.data.aggregates.byAgent[0].costCny).toBeCloseTo(0.8);
    expect(json.data.aggregates.byModel[0]).toEqual({
      model: "deepseek-chat",
      calls: 3,
      tokenIn: 250,
      tokenOut: 300,
      costCny: 0.8,
    });
  });
});
