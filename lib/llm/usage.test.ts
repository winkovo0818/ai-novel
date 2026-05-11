import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const aggregate = vi.fn();
const create = vi.fn();
const findMany = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    llmUsage: { aggregate, create, findMany },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getQuotaFailureMode", () => {
  it("returns 'block' in production by default", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("QUOTA_FAILURE_MODE", "");
    const { getQuotaFailureMode } = await import("./usage");
    expect(getQuotaFailureMode()).toBe("block");
  });

  it("returns 'allow' in non-production by default", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("QUOTA_FAILURE_MODE", "");
    const { getQuotaFailureMode } = await import("./usage");
    expect(getQuotaFailureMode()).toBe("allow");
  });

  it("respects explicit QUOTA_FAILURE_MODE override", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("QUOTA_FAILURE_MODE", "allow");
    const { getQuotaFailureMode } = await import("./usage");
    expect(getQuotaFailureMode()).toBe("allow");
  });
});

describe("checkQuota", () => {
  it("allows the request when usage is below limits", async () => {
    aggregate.mockResolvedValue({ _sum: { cost_cny: 0 }, _count: 0 });
    const { checkQuota } = await import("./usage");

    const result = await checkQuota("user-1");
    expect(result.allowed).toBe(true);
    expect(result.code).toBeUndefined();
  });

  it("returns the actual daily and monthly cost in the success path", async () => {
    aggregate
      .mockResolvedValueOnce({ _sum: { cost_cny: 3.5 }, _count: 7 })
      .mockResolvedValueOnce({ _sum: { cost_cny: 42.1 }, _count: 88 });
    const { checkQuota } = await import("./usage");

    const result = await checkQuota("user-1");
    expect(result.allowed).toBe(true);
    expect(result.dailyCostCny).toBe(3.5);
    expect(result.monthlyCostCny).toBe(42.1);
    expect(result.dailyLimitCny).toBe(50);
    expect(result.monthlyLimitCny).toBe(500);
  });

  it("treats a null _sum.cost_cny aggregate as zero cost", async () => {
    aggregate.mockResolvedValue({ _sum: { cost_cny: null }, _count: 0 });
    const { checkQuota } = await import("./usage");

    const result = await checkQuota("user-1");
    expect(result.allowed).toBe(true);
    expect(result.dailyCostCny).toBe(0);
    expect(result.monthlyCostCny).toBe(0);
  });

  it("blocks when daily cost limit is reached", async () => {
    aggregate
      .mockResolvedValueOnce({ _sum: { cost_cny: 50 }, _count: 5 })
      .mockResolvedValueOnce({ _sum: { cost_cny: 50 }, _count: 5 });
    const { checkQuota } = await import("./usage");

    const result = await checkQuota("user-1");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Daily cost limit");
  });

  it("blocks when monthly cost limit is reached but daily is fine", async () => {
    aggregate
      .mockResolvedValueOnce({ _sum: { cost_cny: 5 }, _count: 5 })
      .mockResolvedValueOnce({ _sum: { cost_cny: 500 }, _count: 100 });
    const { checkQuota } = await import("./usage");

    const result = await checkQuota("user-1");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Monthly cost limit");
    expect(result.monthlyCostCny).toBe(500);
  });

  it("blocks when daily call limit is reached even with no cost", async () => {
    aggregate
      .mockResolvedValueOnce({ _sum: { cost_cny: 0 }, _count: 200 })
      .mockResolvedValueOnce({ _sum: { cost_cny: 0 }, _count: 200 });
    const { checkQuota } = await import("./usage");

    const result = await checkQuota("user-1");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Daily call limit");
  });

  it("blocks when monthly call limit is reached but daily call/cost are fine", async () => {
    aggregate
      .mockResolvedValueOnce({ _sum: { cost_cny: 5 }, _count: 10 })
      .mockResolvedValueOnce({ _sum: { cost_cny: 100 }, _count: 5000 });
    const { checkQuota } = await import("./usage");

    const result = await checkQuota("user-1");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Monthly call limit");
  });

  it("blocks when DB lookup fails and QUOTA_FAILURE_MODE=block", async () => {
    vi.stubEnv("QUOTA_FAILURE_MODE", "block");
    aggregate.mockRejectedValue(new Error("relation does not exist"));
    const { checkQuota } = await import("./usage");

    const result = await checkQuota("user-1");
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("QUOTA_CHECK_FAILED");
    expect(result.reason).toContain("temporarily unavailable");
  });

  it("allows when DB lookup fails and QUOTA_FAILURE_MODE=allow", async () => {
    vi.stubEnv("QUOTA_FAILURE_MODE", "allow");
    aggregate.mockRejectedValue(new Error("relation does not exist"));
    const { checkQuota } = await import("./usage");

    const result = await checkQuota("user-1");
    expect(result.allowed).toBe(true);
    expect(result.code).toBeUndefined();
  });

  it("blocks when DB lookup fails in production by default", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("QUOTA_FAILURE_MODE", "");
    aggregate.mockRejectedValue(new Error("connection refused"));
    const { checkQuota } = await import("./usage");

    const result = await checkQuota("user-1");
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("QUOTA_CHECK_FAILED");
  });

  it("treats non-Error rejections as a generic failure", async () => {
    vi.stubEnv("QUOTA_FAILURE_MODE", "block");
    aggregate.mockRejectedValue("string error not Error instance");
    const { checkQuota } = await import("./usage");

    const result = await checkQuota("user-1");
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("QUOTA_CHECK_FAILED");
  });
});

describe("logUsage", () => {
  it("persists a usage row mapping camelCase fields to snake_case columns", async () => {
    create.mockResolvedValue({});
    const { logUsage } = await import("./usage");

    await logUsage({
      userId: "user-1",
      novelId: "novel-1",
      route: "/api/test",
      agent: "writer",
      model: "deepseek-chat",
      tokenIn: 120,
      tokenOut: 80,
      costCny: 0.0042,
      status: "ok",
      tookMs: 250,
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        user_id: "user-1",
        novel_id: "novel-1",
        route: "/api/test",
        agent: "writer",
        model: "deepseek-chat",
        token_in: 120,
        token_out: 80,
        cost_cny: 0.0042,
        status: "ok",
        error_code: undefined,
        took_ms: 250,
      },
    });
  });

  it("persists error-status rows with an error_code", async () => {
    create.mockResolvedValue({});
    const { logUsage } = await import("./usage");

    await logUsage({
      userId: "user-1",
      route: "/api/test",
      model: "deepseek-chat",
      tokenIn: 0,
      tokenOut: 0,
      costCny: 0,
      status: "err",
      errorCode: "LLM_TIMEOUT",
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "err", error_code: "LLM_TIMEOUT" }),
      }),
    );
  });

  it("swallows persistence failures so the calling route still responds", async () => {
    create.mockRejectedValue(new Error("db down"));
    const { logUsage } = await import("./usage");

    await expect(
      logUsage({
        userId: "user-1",
        route: "/api/test",
        model: "deepseek-chat",
        tokenIn: 0,
        tokenOut: 0,
        costCny: 0,
        status: "ok",
      }),
    ).resolves.toBeUndefined();
  });

  it("logs non-Error rejections without crashing", async () => {
    create.mockRejectedValue("non-Error rejection value");
    const { logUsage } = await import("./usage");

    await expect(
      logUsage({
        userId: "user-1",
        route: "/api/test",
        model: "deepseek-chat",
        tokenIn: 0,
        tokenOut: 0,
        costCny: 0,
        status: "ok",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("getUserUsage", () => {
  it("aggregates totals and groups by route + agent", async () => {
    findMany.mockResolvedValue([
      { route: "/api/draft", agent: "writer", token_in: 100, token_out: 200, cost_cny: 0.01 },
      { route: "/api/draft", agent: "writer", token_in: 50, token_out: 30, cost_cny: 0.005 },
      { route: "/api/critic", agent: "critic", token_in: 80, token_out: 40, cost_cny: 0.008 },
    ]);
    const { getUserUsage } = await import("./usage");

    const summary = await getUserUsage("user-1", new Date("2026-01-01"));

    expect(summary.totalCalls).toBe(3);
    expect(summary.totalTokenIn).toBe(230);
    expect(summary.totalTokenOut).toBe(270);
    expect(summary.totalCostCny).toBeCloseTo(0.023, 5);
    expect(summary.byRoute["/api/draft"]).toEqual({
      calls: 2,
      tokenIn: 150,
      tokenOut: 230,
      costCny: 0.015,
    });
    expect(summary.byRoute["/api/critic"].calls).toBe(1);
    expect(summary.byAgent.writer.calls).toBe(2);
    expect(summary.byAgent.critic.calls).toBe(1);
  });

  it("buckets rows with no agent under 'unknown'", async () => {
    findMany.mockResolvedValue([
      { route: "/api/x", agent: null, token_in: 10, token_out: 5, cost_cny: 0.001 },
    ]);
    const { getUserUsage } = await import("./usage");

    const summary = await getUserUsage("user-1", new Date("2026-01-01"));
    expect(summary.byAgent.unknown.calls).toBe(1);
    expect(summary.byAgent.unknown.tokenIn).toBe(10);
  });

  it("returns zero totals when there is no usage in the window", async () => {
    findMany.mockResolvedValue([]);
    const { getUserUsage } = await import("./usage");

    const summary = await getUserUsage("user-1", new Date("2026-01-01"));
    expect(summary).toEqual({
      totalCalls: 0,
      totalTokenIn: 0,
      totalTokenOut: 0,
      totalCostCny: 0,
      byRoute: {},
      byAgent: {},
    });
  });
});
