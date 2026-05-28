import { beforeEach, describe, expect, it, vi } from "vitest";

const getRequiredUserId = vi.fn();
const getUserUsage = vi.fn();
const checkQuota = vi.fn();
const usageFindMany = vi.fn();
const usageGroupBy = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  getRequiredUserId,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    llmUsage: {
      findMany: usageFindMany,
      groupBy: usageGroupBy,
    },
  },
}));

vi.mock("@/lib/llm/usage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm/usage")>("@/lib/llm/usage");
  return {
    ...actual,
    getUserUsage,
    checkQuota,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  getRequiredUserId.mockResolvedValue("user-1");
  getUserUsage.mockResolvedValue({
    totalCalls: 1,
    totalTokenIn: 100,
    totalTokenOut: 200,
    totalCostCny: 0.001,
    byRoute: {},
    byAgent: {},
  });
  checkQuota.mockResolvedValue({
    allowed: false,
    code: "QUOTA_EXCEEDED",
    reason: "Daily cost limit reached",
    limitType: "daily_cost",
    dailyCostCny: 50,
    monthlyCostCny: 120,
    dailyLimitCny: 50,
    monthlyLimitCny: 500,
    dailyCalls: 20,
    monthlyCalls: 300,
    dailyCallLimit: 200,
    monthlyCallLimit: 5000,
    singleRequestLimitCny: 10,
    nextDailyResetAt: "2026-05-29T00:00:00.000Z",
    nextMonthlyResetAt: "2026-06-01T00:00:00.000Z",
  });
  usageFindMany
    .mockResolvedValueOnce([
      {
        id: "usage-1",
        novel_id: "novel-1",
        agent: "writer",
        route: "/api/novels/:id/chapters/draft",
        model: "deepseek-chat",
        status: "ok",
        error_code: null,
        token_in: 100,
        token_out: 200,
        cost_cny: 0.001,
        took_ms: 1200,
        created_at: new Date("2026-05-28T08:00:00.000Z"),
      },
    ])
    .mockResolvedValueOnce([
      {
        status: "ok",
        token_in: 100,
        token_out: 200,
        cost_cny: 0.001,
        created_at: new Date("2026-05-28T08:00:00.000Z"),
      },
      {
        status: "err",
        token_in: 10,
        token_out: 0,
        cost_cny: 0,
        created_at: new Date("2026-05-27T08:00:00.000Z"),
      },
    ]);
  usageGroupBy.mockResolvedValue([
    { status: "ok", _count: 9 },
    { status: "err", _count: 1 },
  ]);
});

describe("GET /api/usage", () => {
  it("returns quota limits, calls, and reset timestamps", async () => {
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/usage?limit=50"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.quota).toEqual(expect.objectContaining({
      allowed: false,
      code: "QUOTA_EXCEEDED",
      limitType: "daily_cost",
      dailyCalls: 20,
      monthlyCalls: 300,
      dailyCallLimit: 200,
      monthlyCallLimit: 5000,
      singleRequestLimitCny: 10,
      nextDailyResetAt: "2026-05-29T00:00:00.000Z",
      nextMonthlyResetAt: "2026-06-01T00:00:00.000Z",
    }));
    expect(json.data.quota.details.limitType).toBe("daily_cost");
    expect(json.data.monthlyStatus.failureRate).toBe(0.1);
    expect(json.data.records[0]).toEqual(expect.objectContaining({
      id: "usage-1",
      agent: "writer",
      created_at: "2026-05-28T08:00:00.000Z",
    }));
    expect(json.data.trend).toHaveLength(14);
    expect(json.data.trend.some((item: { calls: number; failures: number }) => item.calls === 1 && item.failures === 1)).toBe(true);
  });

  it("returns 401 when the user is not authenticated", async () => {
    getRequiredUserId.mockRejectedValue(new Error("UNAUTHORIZED"));
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/usage"));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
    expect(getUserUsage).not.toHaveBeenCalled();
    expect(checkQuota).not.toHaveBeenCalled();
    expect(usageFindMany).not.toHaveBeenCalled();
  });
});
