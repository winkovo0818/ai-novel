import type { NovelQualityReport } from "@/lib/evals/novelQuality";

export interface NovelQualityMatrixCase {
  fixtureId: string;
  title: string;
  genre: string;
  model: string;
  mode: "real_llm" | "fixture_fallback";
  chapterCount: number;
  revisionRounds: number;
  changedChapters: number;
  criticIssues: number;
  draftReport: NovelQualityReport;
  revisedReport: NovelQualityReport;
}

export interface NovelQualityMatrixSummary {
  caseCount: number;
  averageDraftScore: number;
  averageRevisedScore: number;
  averageDelta: number;
  bestCase: string;
  weakestCase: string;
  improvedCases: number;
}

export interface NovelQualityMatrixReport {
  generatedAt: string;
  fixtureIds: string[];
  models: string[];
  chapterCount: number;
  revisionRounds: number;
  mode: "real_llm" | "fixture_fallback";
  summary: NovelQualityMatrixSummary;
  cases: NovelQualityMatrixCase[];
}

export function buildNovelQualityMatrixReport(input: {
  generatedAt?: string;
  fixtureIds: string[];
  models: string[];
  chapterCount: number;
  revisionRounds: number;
  mode: NovelQualityMatrixReport["mode"];
  cases: NovelQualityMatrixCase[];
}): NovelQualityMatrixReport {
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    fixtureIds: input.fixtureIds,
    models: input.models,
    chapterCount: input.chapterCount,
    revisionRounds: input.revisionRounds,
    mode: input.mode,
    summary: summarizeMatrixCases(input.cases),
    cases: input.cases,
  };
}

export function summarizeMatrixCases(cases: NovelQualityMatrixCase[]): NovelQualityMatrixSummary {
  if (cases.length === 0) {
    return {
      caseCount: 0,
      averageDraftScore: 0,
      averageRevisedScore: 0,
      averageDelta: 0,
      bestCase: "无",
      weakestCase: "无",
      improvedCases: 0,
    };
  }

  const scored = cases.map((item) => ({
    item,
    draft: scorePercent(item.draftReport),
    revised: scorePercent(item.revisedReport),
  }));
  const best = [...scored].sort((a, b) => b.revised - a.revised)[0];
  const weakest = [...scored].sort((a, b) => a.revised - b.revised)[0];

  return {
    caseCount: cases.length,
    averageDraftScore: round1(average(scored.map((item) => item.draft))),
    averageRevisedScore: round1(average(scored.map((item) => item.revised))),
    averageDelta: round1(average(scored.map((item) => item.revised - item.draft))),
    bestCase: caseLabel(best.item),
    weakestCase: caseLabel(weakest.item),
    improvedCases: scored.filter((item) => item.revised > item.draft).length,
  };
}

export function renderNovelQualityMatrixMarkdown(report: NovelQualityMatrixReport): string {
  const lines = [
    "# 小说质量矩阵测评报告",
    "",
    `- 生成时间：${report.generatedAt}`,
    `- 模式：${modeLabel(report.mode)}`,
    `- 题材样例：${report.fixtureIds.join("、")}`,
    `- 模型：${report.models.join("、")}`,
    `- 每个样例章节数：${report.chapterCount}`,
    `- 修订轮数：${report.revisionRounds}`,
    "",
    "## 总览",
    "",
    `- 样例组合：${report.summary.caseCount}`,
    `- 草稿平均分：${report.summary.averageDraftScore}/100`,
    `- 修订后平均分：${report.summary.averageRevisedScore}/100`,
    `- 平均变化：${formatSigned(report.summary.averageDelta)} 分`,
    `- 有提升的组合：${report.summary.improvedCases}/${report.summary.caseCount}`,
    `- 最好组合：${report.summary.bestCase}`,
    `- 最弱组合：${report.summary.weakestCase}`,
    "",
    "## 对比表",
    "",
    "| 题材 | 模型 | 草稿 | 修订后 | 变化 | 逻辑 | AI 味 | 修订变更 | 主要风险 |",
    "|---|---|---:|---:|---:|---:|---:|---:|---|",
    ...report.cases.map((item) => {
      const draft = scorePercent(item.draftReport);
      const revised = scorePercent(item.revisedReport);
      const logic = metricScore(item.revisedReport, "logic");
      const aiVoice = metricScore(item.revisedReport, "ai_voice");
      const risks = item.revisedReport.riskFlags.slice(0, 2).join("<br>") || "无";
      return `| ${item.genre} | ${item.model} | ${round1(draft)} | ${round1(revised)} | ${formatSigned(round1(revised - draft))} | ${logic} | ${aiVoice} | ${item.changedChapters}/${item.chapterCount} | ${risks} |`;
    }),
    "",
    "## AI 痕迹 Top",
    "",
    "| 题材 | 模型 | 草稿 Top | 修订后 Top |",
    "|---|---|---|---|",
    ...report.cases.map((item) =>
      `| ${item.genre} | ${item.model} | ${topTrace(item.draftReport)} | ${topTrace(item.revisedReport)} |`,
    ),
    "",
    "## 清洗前 AI 签名命中（原始输出 Top）",
    "",
    "> Writer 原始输出在 `cleanupWriterOutput` 清洗**前**触发的 AI 签名规则。命中越多 = 提示侧 AI 味越重；仅真实生成有数据，fixture fallback 为空。",
    "",
    "| 题材 | 模型 | 草稿原始命中 Top |",
    "|---|---|---|",
    ...report.cases.map((item) =>
      `| ${item.genre} | ${item.model} | ${topCleanup(item.draftReport)} |`,
    ),
    "",
    "## 说明",
    "",
    "- 草稿分表示 Writer 直接生成后的质量；修订后分表示经过配置轮数 Critic/Reviser 或本地清洗后的质量。",
    "- 默认命令不调用真实模型，只跑 fixture fallback，用于验证矩阵管线。真实多模型评估需显式设置 `EVAL_NOVEL_MATRIX_REAL=1`。",
    "",
  ];

  return lines.join("\n");
}

function caseLabel(item: NovelQualityMatrixCase): string {
  return `${item.genre}/${item.model}`;
}

function scorePercent(report: NovelQualityReport): number {
  return (report.overallScore / report.maxScore) * 100;
}

function metricScore(report: NovelQualityReport, key: NovelQualityReport["metrics"][number]["key"]): string {
  const metric = report.metrics.find((item) => item.key === key);
  return metric ? `${metric.score}/${metric.max}` : "n/a";
}

function topTrace(report: NovelQualityReport): string {
  return report.aiTraceHits
    .slice(0, 3)
    .map((hit) => `${hit.label} ${hit.count}`)
    .join("；") || "无";
}

function topCleanup(report: NovelQualityReport): string {
  const total = report.rawCleanupHits.reduce((sum, hit) => sum + hit.count, 0);
  if (total === 0) return "无";
  const top = report.rawCleanupHits.slice(0, 3).map((hit) => `${hit.label} ${hit.count}`).join("；");
  return `${top}（合计 ${total}）`;
}

function modeLabel(mode: NovelQualityMatrixReport["mode"]): string {
  return mode === "real_llm" ? "真实 LLM" : "fixture fallback";
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}
