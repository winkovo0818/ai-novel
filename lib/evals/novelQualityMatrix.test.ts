import { describe, expect, it } from "vitest";

import { buildNovelQualityMatrixReport, renderNovelQualityMatrixMarkdown, summarizeMatrixCases, type NovelQualityMatrixCase } from "./novelQualityMatrix";
import type { NovelQualityReport } from "./novelQuality";

function makeReport(score: number, aiVoice = 8): NovelQualityReport {
  return {
    generatedAt: "2026-05-29T00:00:00.000Z",
    fixtureId: "fixture",
    title: "测试书",
    chapterCount: 3,
    totalChars: 3600,
    overallScore: score,
    maxScore: 70,
    level: "good",
    metrics: [
      { key: "continuity", label: "连续性", score: 10, max: 10, findings: [], warnings: [] },
      { key: "logic", label: "因果逻辑", score: 9, max: 10, findings: [], warnings: [] },
      { key: "character_consistency", label: "人物一致性", score: 10, max: 10, findings: [], warnings: [] },
      { key: "plot_progress", label: "剧情推进", score: 10, max: 10, findings: [], warnings: [] },
      { key: "world_rules", label: "世界规则", score: 9, max: 10, findings: [], warnings: [] },
      { key: "ai_voice", label: "AI 味控制", score: aiVoice, max: 10, findings: [], warnings: aiVoice < 7 ? ["AI 味偏重"] : [] },
      { key: "prose_readability", label: "正文可读性", score: 10, max: 10, findings: [], warnings: [] },
    ],
    chapterSummaries: [],
    riskFlags: aiVoice < 7 ? ["AI 味控制低于 70%"] : [],
    recommendations: [],
    aiTraceHits: aiVoice < 7
      ? [{ id: "dash_overuse", category: "style", label: "破折号痕迹", count: 5, examples: ["—"] }]
      : [],
  };
}

function makeCase(genre: string, model: string, draftScore: number, revisedScore: number): NovelQualityMatrixCase {
  return {
    fixtureId: `${genre}-${model}`,
    title: "测试书",
    genre,
    model,
    mode: "fixture_fallback",
    chapterCount: 3,
    revisionRounds: 1,
    changedChapters: revisedScore > draftScore ? 2 : 0,
    criticIssues: 1,
    draftReport: makeReport(draftScore, 5),
    revisedReport: makeReport(revisedScore, 8),
  };
}

describe("novelQualityMatrix", () => {
  it("summarizes draft vs revised scores across cases", () => {
    const cases = [
      makeCase("玄幻", "model-a", 56, 63),
      makeCase("都市悬疑", "model-b", 60, 58),
    ];
    const summary = summarizeMatrixCases(cases);

    expect(summary.caseCount).toBe(2);
    expect(summary.averageDraftScore).toBe(82.9);
    expect(summary.averageRevisedScore).toBe(86.4);
    expect(summary.averageDelta).toBe(3.6);
    expect(summary.improvedCases).toBe(1);
    expect(summary.bestCase).toBe("玄幻/model-a");
    expect(summary.weakestCase).toBe("都市悬疑/model-b");
  });

  it("renders a markdown matrix report with comparison tables", () => {
    const report = buildNovelQualityMatrixReport({
      generatedAt: "2026-05-29T00:00:00.000Z",
      fixtureIds: ["xuanhuan-seed", "urban-suspense"],
      models: ["model-a"],
      chapterCount: 3,
      revisionRounds: 1,
      mode: "fixture_fallback",
      cases: [makeCase("玄幻", "model-a", 56, 63)],
    });
    const markdown = renderNovelQualityMatrixMarkdown(report);

    expect(markdown).toContain("# 小说质量矩阵测评报告");
    expect(markdown).toContain("草稿平均分");
    expect(markdown).toContain("| 题材 | 模型 | 草稿 | 修订后 | 变化 |");
    expect(markdown).toContain("玄幻");
    expect(markdown).toContain("+10");
    expect(markdown).toContain("破折号痕迹 5");
  });
});
