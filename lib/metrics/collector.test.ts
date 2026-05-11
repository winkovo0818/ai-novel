import { beforeEach, describe, expect, it, vi } from "vitest";

const llmGroupBy = vi.fn();
const jobGroupBy = vi.fn();
const jobCount = vi.fn();
const novelCount = vi.fn();
const chapterGroupBy = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    llmUsage: { groupBy: llmGroupBy },
    backgroundJob: { groupBy: jobGroupBy, count: jobCount },
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
      ]);

    jobGroupBy.mockResolvedValue([
      { status: "completed", _count: { _all: 30 } },
      { status: "failed", _count: { _all: 2 } },
    ]);
    jobCount.mockResolvedValue(3);
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

    expect(byName.ai_novel_jobs_active.samples).toEqual([{ value: 3 }]);
    expect(byName.ai_novel_novels_total.samples).toEqual([{ value: 7 }]);
    expect(byName.ai_novel_chapters_total.samples).toEqual([
      { labels: { status: "draft" }, value: 12 },
      { labels: { status: "done" }, value: 5 },
    ]);
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
      ]);
    jobGroupBy.mockResolvedValue([]);
    jobCount.mockResolvedValue(0);
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
