import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const aggregate = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    llmUsage: { aggregate },
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

  it("blocks when daily cost limit is reached", async () => {
    aggregate
      .mockResolvedValueOnce({ _sum: { cost_cny: 50 }, _count: 5 })
      .mockResolvedValueOnce({ _sum: { cost_cny: 50 }, _count: 5 });
    const { checkQuota } = await import("./usage");

    const result = await checkQuota("user-1");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Daily cost limit");
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
});
