import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MetricResult, NovelQualityReport, QualityChapterInput } from "@/lib/evals/novelQuality";
import type { CriticIssue } from "@/lib/agent/contracts";
import type { BibleDraft } from "@/lib/validation/schemas";

const evaluateNovelQuality = vi.fn();

vi.mock("@/lib/evals/novelQuality", () => ({ evaluateNovelQuality }));

const DIMENSION_KEYS: MetricResult["key"][] = [
  "continuity",
  "logic",
  "character_consistency",
  "plot_progress",
  "world_rules",
  "ai_voice",
  "prose_readability",
];

/** Build a minimal NovelQualityReport with per-dimension scores (default 10). */
function makeReport(scores: Partial<Record<MetricResult["key"], number>> = {}, fill = 10): NovelQualityReport {
  const metrics = DIMENSION_KEYS.map((key) => ({
    key,
    label: key,
    score: scores[key] ?? fill,
    max: 10,
    findings: [],
    warnings: [],
  }));
  const overallScore = metrics.reduce((sum, m) => sum + m.score, 0);
  return { metrics, overallScore, maxScore: 70 } as unknown as NovelQualityReport;
}

const window = (n: number): QualityChapterInput[] =>
  Array.from({ length: n }, (_, i) => ({ chapterIndex: i + 1, title: `第${i + 1}章`, content: "正文片段。" }));

const bible = {} as BibleDraft;

const criticIssue = (severity: CriticIssue["severity"], type: CriticIssue["type"] = "logic_chain"): CriticIssue => ({
  type,
  severity,
  description: `${severity} ${type} 问题`,
  suggestion: "修一下",
});

describe("evaluateChapterGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes when total clears the floor and no dimension is below its hard floor", async () => {
    evaluateNovelQuality.mockReturnValue(makeReport({}, 10));
    const { evaluateChapterGate } = await import("./qualityGate");

    const result = evaluateChapterGate(window(3), bible);

    expect(result.pass).toBe(true);
    expect(result.scorePct).toBe(100);
    expect(result.failedDims).toEqual([]);
  });

  it("fails when the total is below the floor", async () => {
    evaluateNovelQuality.mockReturnValue(makeReport({}, 8)); // 56/70 = 80%
    const { evaluateChapterGate } = await import("./qualityGate");

    const result = evaluateChapterGate(window(3), bible);

    expect(result.pass).toBe(false);
    expect(result.scorePct).toBe(80);
    expect(result.reason).toContain("总分 80% < 阈值 85%");
  });

  it("fails on the ai_voice hard floor even when the total passes", async () => {
    evaluateNovelQuality.mockReturnValue(makeReport({ ai_voice: 5 }, 10)); // 65/70 = 92.9%
    const { evaluateChapterGate } = await import("./qualityGate");

    const result = evaluateChapterGate(window(3), bible);

    expect(result.pass).toBe(false);
    expect(result.scorePct).toBeGreaterThan(85);
    expect(result.failedDims.map((d) => d.key)).toContain("ai_voice");
    expect(result.reason).toContain("ai_voice");
  });

  it("fails on the logic hard floor", async () => {
    evaluateNovelQuality.mockReturnValue(makeReport({ logic: 6 }, 10)); // 66/70 = 94.3%
    const { evaluateChapterGate } = await import("./qualityGate");

    const result = evaluateChapterGate(window(3), bible);

    expect(result.pass).toBe(false);
    expect(result.failedDims.map((d) => d.key)).toContain("logic");
  });

  it("skips the gate (passes) on a cold-start window smaller than 3 chapters", async () => {
    evaluateNovelQuality.mockReturnValue(makeReport({}, 5)); // 50% — would fail if scored
    const { evaluateChapterGate } = await import("./qualityGate");

    const result = evaluateChapterGate(window(2), bible);

    expect(result.pass).toBe(true);
    expect(result.reason).toContain("冷启动");
  });

  it("honors a custom qualityFloor", async () => {
    evaluateNovelQuality.mockReturnValue(makeReport({}, 9)); // 63/70 = 90%
    const { evaluateChapterGate } = await import("./qualityGate");

    const result = evaluateChapterGate(window(3), bible, { qualityFloor: 95 });

    expect(result.pass).toBe(false);
    expect(result.reason).toContain("90% < 阈值 95%");
  });

  it("fails when the critic flagged a critical issue even though heuristics pass", async () => {
    evaluateNovelQuality.mockReturnValue(makeReport({}, 10)); // 100% — heuristics clean
    const { evaluateChapterGate } = await import("./qualityGate");

    const result = evaluateChapterGate(window(3), bible, {
      criticIssues: [criticIssue("critical", "world_rule")],
    });

    expect(result.pass).toBe(false);
    expect(result.scorePct).toBe(100);
    expect(result.failedDims).toEqual([]);
    expect(result.criticBlocked).toHaveLength(1);
    expect(result.reason).toContain("critic(critical/world_rule)");
  });

  it("does not fail on minor or (by default) major critic issues", async () => {
    evaluateNovelQuality.mockReturnValue(makeReport({}, 10));
    const { evaluateChapterGate } = await import("./qualityGate");

    const result = evaluateChapterGate(window(3), bible, {
      criticIssues: [criticIssue("minor"), criticIssue("major"), criticIssue("major")],
    });

    expect(result.pass).toBe(true);
    expect(result.criticBlocked).toEqual([]);
  });

  it("fails on too many major critic issues when maxMajor is set", async () => {
    evaluateNovelQuality.mockReturnValue(makeReport({}, 10));
    const { evaluateChapterGate } = await import("./qualityGate");

    const result = evaluateChapterGate(window(3), bible, {
      criticIssues: [criticIssue("major"), criticIssue("major")],
      criticFloor: { maxMajor: 1 },
    });

    expect(result.pass).toBe(false);
    expect(result.criticBlocked).toHaveLength(2);
  });

  it("ignores critical critic issues when failOnCritical is disabled", async () => {
    evaluateNovelQuality.mockReturnValue(makeReport({}, 10));
    const { evaluateChapterGate } = await import("./qualityGate");

    const result = evaluateChapterGate(window(3), bible, {
      criticIssues: [criticIssue("critical")],
      criticFloor: { failOnCritical: false },
    });

    expect(result.pass).toBe(true);
    expect(result.criticBlocked).toEqual([]);
  });

  it("skips the critic floor on a cold-start window", async () => {
    evaluateNovelQuality.mockReturnValue(makeReport({}, 10));
    const { evaluateChapterGate } = await import("./qualityGate");

    const result = evaluateChapterGate(window(2), bible, {
      criticIssues: [criticIssue("critical")],
    });

    expect(result.pass).toBe(true);
    expect(result.criticBlocked).toEqual([]);
    expect(result.reason).toContain("冷启动");
  });

  it("keeps criticBlocked empty when no criticIssues are supplied (back-compat)", async () => {
    evaluateNovelQuality.mockReturnValue(makeReport({}, 10));
    const { evaluateChapterGate } = await import("./qualityGate");

    const result = evaluateChapterGate(window(3), bible);

    expect(result.pass).toBe(true);
    expect(result.criticBlocked).toEqual([]);
  });
});
