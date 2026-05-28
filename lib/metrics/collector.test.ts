import { beforeEach, describe, expect, it, vi } from "vitest";

const llmGroupBy = vi.fn();
const llmAggregate = vi.fn();
const queryRaw = vi.fn();
const jobGroupBy = vi.fn();
const jobCount = vi.fn();
const novelCount = vi.fn();
const chapterGroupBy = vi.fn();
const moderationGroupBy = vi.fn();
const exportGroupBy = vi.fn();
const draftSessionGroupBy = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    llmUsage: { groupBy: llmGroupBy, aggregate: llmAggregate },
    $queryRaw: queryRaw,
    moderationAudit: { groupBy: moderationGroupBy },
    exportEvent: { groupBy: exportGroupBy },
    backgroundJob: { groupBy: jobGroupBy, count: jobCount },
    draftSession: { groupBy: draftSessionGroupBy },
    novel: { count: novelCount },
    chapterDraft: { groupBy: chapterGroupBy },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("collectMetrics", () => {
  it("maps prisma aggregates into a stable family / label structure", async () => {
    llmGroupBy
      // by: ["status"]
      .mockResolvedValueOnce([
        { status: "ok", _count: { _all: 100 } },
        { status: "err", _count: { _all: 4 } },
      ])
      // by: ["agent"]
      .mockResolvedValueOnce([
        {
          agent: "writer",
          _count: { _all: 70 },
          _sum: { token_in: 12345, token_out: 23456, cost_cny: 1.23 },
        },
        {
          agent: null,
          _count: { _all: 5 },
          _sum: { token_in: 100, token_out: 50, cost_cny: 0.01 },
        },
      ])
      // by: ["status"] within 15m
      .mockResolvedValueOnce([
        { status: "ok", _count: { _all: 8 } },
        { status: "err", _count: { _all: 2 } },
      ]);

    jobGroupBy.mockResolvedValue([
      { status: "completed", _count: { _all: 30 } },
      { status: "failed", _count: { _all: 2 } },
    ]);
    llmAggregate
      .mockResolvedValueOnce({ _sum: { cost_cny: 9.5 } })
      .mockResolvedValueOnce({ _sum: { cost_cny: 120.25 } });
    queryRaw
      .mockResolvedValueOnce([
        { route: "/api/novels/[id]/chapters/draft", p95_ms: 8200 },
        { route: "/api/chapters/[id]/state-diff", p95_ms: 900n },
      ])
      .mockResolvedValueOnce([
        { status: "pending", oldest_age_seconds: 120 },
        { status: "running", oldest_age_seconds: 30n },
      ]);
    moderationGroupBy
      .mockResolvedValueOnce([
        {
          source: "local_keyword",
          action: "block",
          outcome: "blocked",
          _count: { _all: 6 },
        },
        {
          source: "failure_mode",
          action: "allow",
          outcome: "allowed",
          _count: { _all: 2 },
        },
      ])
      .mockResolvedValueOnce([
        { review_status: "pending", _count: { _all: 4 } },
        { review_status: "confirmed", _count: { _all: 1 } },
      ])
      .mockResolvedValueOnce([
        { outcome: "blocked", _count: { _all: 3 } },
        { outcome: "allowed", _count: { _all: 9 } },
      ]);
    exportGroupBy
      .mockResolvedValueOnce([
        { status: "ok", _count: { _all: 7 } },
        { status: "err", _count: { _all: 1 } },
      ])
      .mockResolvedValueOnce([
        { scope: "novel", status: "ok", _count: { _all: 6 } },
        { scope: "novel", status: "err", _count: { _all: 1 } },
        { scope: "profile", status: "ok", _count: { _all: 1 } },
      ]);
    jobCount
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(2);
    draftSessionGroupBy.mockResolvedValue([
      { status: "completed", _count: { _all: 8 } },
      { status: "failed", _count: { _all: 2 } },
      { status: "streaming", _count: { _all: 1 } },
    ]);
    novelCount.mockResolvedValue(7);
    chapterGroupBy.mockResolvedValue([
      { status: "draft", _count: { _all: 12 } },
      { status: "done", _count: { _all: 5 } },
    ]);

    const { collectMetrics } = await import("./collector");
    const families = await collectMetrics();

    const byName = Object.fromEntries(families.map((f) => [f.name, f]));

    expect(byName.ai_novel_llm_requests_total.samples).toEqual([
      { labels: { status: "ok" }, value: 100 },
      { labels: { status: "err" }, value: 4 },
    ]);

    // Null agent rows must bucket as "unknown" so the label set stays stable.
    expect(byName.ai_novel_llm_requests_by_agent_total.samples).toContainEqual({
      labels: { agent: "unknown" },
      value: 5,
    });

    const tokenSamples = byName.ai_novel_llm_tokens_total.samples;
    expect(tokenSamples).toContainEqual({
      labels: { direction: "in", agent: "writer" },
      value: 12345,
    });
    expect(tokenSamples).toContainEqual({
      labels: { direction: "out", agent: "writer" },
      value: 23456,
    });

    expect(byName.ai_novel_llm_cost_cny_total.samples).toContainEqual({
      labels: { agent: "writer" },
      value: 1.23,
    });
    expect(byName.ai_novel_llm_cost_cny_window.samples).toEqual([
      { labels: { window: "24h" }, value: 9.5 },
      { labels: { window: "30d" }, value: 120.25 },
    ]);
    expect(byName.ai_novel_llm_success_rate.samples).toEqual([
      { labels: { window: "15m" }, value: 0.8 },
    ]);
    expect(byName.ai_novel_llm_took_ms_p95.samples).toEqual([
      {
        labels: { route: "/api/novels/[id]/chapters/draft", window: "1h" },
        value: 8200,
      },
      {
        labels: { route: "/api/chapters/[id]/state-diff", window: "1h" },
        value: 900,
      },
    ]);
    expect(byName.ai_novel_moderation_decisions_total.samples).toEqual([
      {
        labels: {
          source: "local_keyword",
          action: "block",
          outcome: "blocked",
          window: "24h",
        },
        value: 6,
      },
      {
        labels: {
          source: "failure_mode",
          action: "allow",
          outcome: "allowed",
          window: "24h",
        },
        value: 2,
      },
    ]);
    expect(byName.ai_novel_moderation_review_queue.samples).toEqual([
      {
        labels: { review_status: "pending" },
        value: 4,
      },
      {
        labels: { review_status: "confirmed" },
        value: 1,
      },
    ]);
    expect(byName.ai_novel_moderation_block_rate.samples).toEqual([
      { labels: { window: "15m" }, value: 0.25 },
    ]);
    expect(byName.ai_novel_exports_total.samples).toEqual([
      { labels: { scope: "novel", status: "ok", window: "24h" }, value: 6 },
      { labels: { scope: "novel", status: "err", window: "24h" }, value: 1 },
      { labels: { scope: "profile", status: "ok", window: "24h" }, value: 1 },
    ]);
    expect(byName.ai_novel_exports_failure_rate.samples).toEqual([
      { labels: { window: "24h" }, value: 0.125 },
    ]);

    expect(byName.ai_novel_jobs_active.samples).toEqual([{ value: 3 }]);
    expect(byName.ai_novel_jobs_backlog.samples).toEqual([
      { labels: { status: "pending" }, value: 2 },
      { labels: { status: "running" }, value: 1 },
      { labels: { status: "failed" }, value: 4 },
    ]);
    expect(byName.ai_novel_jobs_oldest_age_seconds.samples).toEqual([
      { labels: { status: "pending" }, value: 120 },
      { labels: { status: "running" }, value: 30 },
      { labels: { status: "failed" }, value: 0 },
    ]);
    expect(byName.ai_novel_jobs_failure_rate.samples).toEqual([
      { labels: { window: "15m" }, value: 0.2 },
    ]);
    expect(byName.ai_novel_draft_sessions_active.samples).toEqual([
      { labels: { window: "15m" }, value: 1 },
    ]);
    expect(byName.ai_novel_draft_sessions_failure_rate.samples).toEqual([
      { labels: { window: "15m" }, value: 0.2 },
    ]);
    expect(byName.ai_novel_novels_total.samples).toEqual([{ value: 7 }]);
    expect(byName.ai_novel_chapters_total.samples).toEqual([
      { labels: { status: "draft" }, value: 12 },
      { labels: { status: "done" }, value: 5 },
    ]);
  });

  it("bounds the moderation review_queue groupBy with a 30d created_at window", async () => {
    llmGroupBy.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    llmAggregate
      .mockResolvedValueOnce({ _sum: { cost_cny: null } })
      .mockResolvedValueOnce({ _sum: { cost_cny: null } });
    queryRaw.mockResolvedValue([]);
    moderationGroupBy.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    exportGroupBy.mockResolvedValue([]);
    jobGroupBy.mockResolvedValue([]);
    jobCount.mockResolvedValue(0);
    draftSessionGroupBy.mockResolvedValue([]);
    novelCount.mockResolvedValue(0);
    chapterGroupBy.mockResolvedValue([]);

    const before = Date.now();
    const { collectMetrics } = await import("./collector");
    await collectMetrics();
    const after = Date.now();

    const reviewCall = moderationGroupBy.mock.calls.find(
      (call) => call[0]?.by?.[0] === "review_status",
    );
    expect(reviewCall).toBeDefined();
    const gte = reviewCall![0].where.created_at.gte as Date;
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    expect(gte.getTime()).toBeGreaterThanOrEqual(before - thirtyDaysMs);
    expect(gte.getTime()).toBeLessThanOrEqual(after - thirtyDaysMs);
  });

  it("treats null _sum aggregates as zero so empty tables don't emit NaN", async () => {
    llmGroupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          agent: "critic",
          _count: { _all: 0 },
          _sum: { token_in: null, token_out: null, cost_cny: null },
        },
      ])
      .mockResolvedValueOnce([]);
    llmAggregate
      .mockResolvedValueOnce({ _sum: { cost_cny: null } })
      .mockResolvedValueOnce({ _sum: { cost_cny: null } });
    queryRaw.mockResolvedValue([]);
    moderationGroupBy.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    exportGroupBy.mockResolvedValue([]);
    jobGroupBy.mockResolvedValue([]);
    jobCount.mockResolvedValue(0);
    draftSessionGroupBy.mockResolvedValue([]);
    novelCount.mockResolvedValue(0);
    chapterGroupBy.mockResolvedValue([]);

    const { collectMetrics } = await import("./collector");
    const families = await collectMetrics();
    const tokenFamily = families.find((f) => f.name === "ai_novel_llm_tokens_total")!;
    for (const sample of tokenFamily.samples) {
      expect(sample.value).toBe(0);
    }
  });
});
