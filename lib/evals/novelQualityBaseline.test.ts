import { describe, expect, it } from "vitest";

import { compareAgainstBaseline, renderComparisonReport } from "@/lib/evals/novelQualityBaseline";
import type { NovelQualityMatrixCase, NovelQualityMatrixReport } from "@/lib/evals/novelQualityMatrix";
import type { MetricResult, NovelQualityReport } from "@/lib/evals/novelQuality";

function metric(key: MetricResult["key"], score: number, max = 10): MetricResult {
  return { key, label: key, score, max, findings: [], warnings: [] };
}

function report(overallScore: number, metrics: MetricResult[]): NovelQualityReport {
  return {
    generatedAt: "2026-05-29T00:00:00.000Z",
    fixtureId: "fixture",
    title: "fixture",
    chapterCount: 3,
    totalChars: 1000,
    overallScore,
    maxScore: metrics.reduce((sum, m) => sum + m.max, 0),
    level: "excellent",
    metrics,
    chapterSummaries: [],
    riskFlags: [],
    recommendations: [],
    aiTraceHits: [],
    rawCleanupHits: [],
  };
}

function matrixCase(fixtureId: string, model: string, draftScore: number, revisedScore: number, metrics: MetricResult[]): NovelQualityMatrixCase {
  return {
    fixtureId,
    title: fixtureId,
    genre: "test",
    model,
    mode: "fixture_fallback",
    chapterCount: 3,
    revisionRounds: 1,
    changedChapters: 0,
    criticIssues: 0,
    draftReport: report(draftScore, metrics),
    revisedReport: report(revisedScore, metrics),
  };
}

function matrixReport(cases: NovelQualityMatrixCase[], averageRevisedScore: number): NovelQualityMatrixReport {
  return {
    generatedAt: "2026-05-29T00:00:00.000Z",
    fixtureIds: cases.map((c) => c.fixtureId),
    models: [...new Set(cases.map((c) => c.model))],
    chapterCount: 3,
    revisionRounds: 1,
    mode: "fixture_fallback",
    summary: {
      caseCount: cases.length,
      averageDraftScore: averageRevisedScore,
      averageRevisedScore,
      averageDelta: 0,
      bestCase: cases[0]?.fixtureId ?? "",
      weakestCase: cases[cases.length - 1]?.fixtureId ?? "",
      improvedCases: 0,
    },
    cases,
  };
}

describe("compareAgainstBaseline", () => {
  const baselineCase = matrixCase("xuanhuan", "fixture-baseline", 68, 70, [
    metric("continuity", 10),
    metric("logic", 9),
    metric("ai_voice", 10),
  ]);
  const baseline = matrixReport([baselineCase], 100);

  it("passes when current matches baseline", () => {
    const current = matrixReport([baselineCase], 100);
    const result = compareAgainstBaseline(current, baseline, 5);
    expect(result.passed).toBe(true);
    expect(result.regressions).toEqual([]);
  });

  it("flags case revised score regression beyond tolerance", () => {
    const droppedCase = matrixCase("xuanhuan", "fixture-baseline", 68, 50, [
      metric("continuity", 10),
      metric("logic", 9),
      metric("ai_voice", 10),
    ]);
    const current = matrixReport([droppedCase], 71.4);
    const result = compareAgainstBaseline(current, baseline, 5);
    expect(result.passed).toBe(false);
    expect(result.regressions.some((r) => r.scope === "case_revised")).toBe(true);
  });

  it("flags per-metric regression beyond tolerance", () => {
    const droppedMetricCase = matrixCase("xuanhuan", "fixture-baseline", 68, 70, [
      metric("continuity", 10),
      metric("logic", 9),
      metric("ai_voice", 3),
    ]);
    const current = matrixReport([droppedMetricCase], 100);
    const result = compareAgainstBaseline(current, baseline, 5);
    expect(result.passed).toBe(false);
    const aiVoiceReg = result.regressions.find((r) => r.metric === "ai_voice");
    expect(aiVoiceReg).toBeDefined();
    expect(aiVoiceReg?.scope).toBe("case_metric");
  });

  it("tolerates small regressions within tolerance", () => {
    const wobbledCase = matrixCase("xuanhuan", "fixture-baseline", 68, 67, [
      metric("continuity", 10),
      metric("logic", 9),
      metric("ai_voice", 9),
    ]);
    const current = matrixReport([wobbledCase], 95.7);
    const result = compareAgainstBaseline(current, baseline, 10);
    expect(result.passed).toBe(true);
  });

  it("flags missing baseline case", () => {
    const otherCase = matrixCase("urban", "fixture-baseline", 65, 65, [metric("continuity", 10)]);
    const current = matrixReport([otherCase], 92.8);
    const result = compareAgainstBaseline(current, baseline, 5);
    expect(result.passed).toBe(false);
    expect(result.regressions.some((r) => r.scope === "missing_case")).toBe(true);
  });

  it("flags summary regression beyond tolerance", () => {
    const droppedCase = matrixCase("xuanhuan", "fixture-baseline", 68, 50, [metric("continuity", 5)]);
    const current = matrixReport([droppedCase], 70);
    const result = compareAgainstBaseline(current, baseline, 5);
    expect(result.passed).toBe(false);
    expect(result.regressions.some((r) => r.scope === "summary")).toBe(true);
  });

  it("records improvements outside tolerance without failing", () => {
    const liftedCase = matrixCase("xuanhuan", "fixture-baseline", 68, 70, [
      metric("continuity", 10),
      metric("logic", 10),
      metric("ai_voice", 10),
    ]);
    const baselineWeak = matrixReport(
      [
        matrixCase("xuanhuan", "fixture-baseline", 68, 50, [
          metric("continuity", 10),
          metric("logic", 5),
          metric("ai_voice", 10),
        ]),
      ],
      71.4,
    );
    const current = matrixReport([liftedCase], 100);
    const result = compareAgainstBaseline(current, baselineWeak, 5);
    expect(result.passed).toBe(true);
    expect(result.improvements.length).toBeGreaterThan(0);
  });

  it("renders human readable report", () => {
    const droppedCase = matrixCase("xuanhuan", "fixture-baseline", 68, 50, [metric("continuity", 5)]);
    const current = matrixReport([droppedCase], 70);
    const result = compareAgainstBaseline(current, baseline, 5);
    const text = renderComparisonReport(result);
    expect(text).toContain("baseline check failed");
    expect(text).toContain("xuanhuan/fixture-baseline");
  });
});
