import type { NovelQualityMatrixReport } from "@/lib/evals/novelQualityMatrix";

export interface BaselineRegression {
  fixtureId: string;
  model: string;
  scope: "summary" | "case_revised" | "case_metric" | "missing_case";
  metric?: string;
  baseline: number;
  current: number;
  delta: number;
  tolerance: number;
}

export interface BaselineImprovement {
  fixtureId: string;
  model: string;
  scope: "case_revised" | "case_metric";
  metric?: string;
  baseline: number;
  current: number;
  delta: number;
}

export interface BaselineComparison {
  passed: boolean;
  tolerance: number;
  regressions: BaselineRegression[];
  improvements: BaselineImprovement[];
  summary: {
    baselineAvgRevised: number;
    currentAvgRevised: number;
    delta: number;
  };
}

/**
 * Compare current matrix report against a frozen baseline.
 *
 * `tolerance` is in percentage points (0-100 scale). A case / metric is a
 * regression when current percent drops below baseline - tolerance.
 *
 * Per-case scores are normalized to 0-100 via `score / max * 100` so per-case
 * percentages and the summary's `averageRevisedScore` share the same scale.
 */
export function compareAgainstBaseline(
  current: NovelQualityMatrixReport,
  baseline: NovelQualityMatrixReport,
  tolerance: number,
): BaselineComparison {
  const regressions: BaselineRegression[] = [];
  const improvements: BaselineImprovement[] = [];

  const summaryDelta = roundTo1(current.summary.averageRevisedScore - baseline.summary.averageRevisedScore);
  if (summaryDelta < -tolerance) {
    regressions.push({
      fixtureId: "*",
      model: "*",
      scope: "summary",
      baseline: baseline.summary.averageRevisedScore,
      current: current.summary.averageRevisedScore,
      delta: summaryDelta,
      tolerance,
    });
  }

  for (const baseCase of baseline.cases) {
    const curCase = current.cases.find((c) => c.fixtureId === baseCase.fixtureId && c.model === baseCase.model);
    if (!curCase) {
      regressions.push({
        fixtureId: baseCase.fixtureId,
        model: baseCase.model,
        scope: "missing_case",
        baseline: percentage(baseCase.revisedReport.overallScore, baseCase.revisedReport.maxScore),
        current: 0,
        delta: -percentage(baseCase.revisedReport.overallScore, baseCase.revisedReport.maxScore),
        tolerance,
      });
      continue;
    }

    const basePct = percentage(baseCase.revisedReport.overallScore, baseCase.revisedReport.maxScore);
    const curPct = percentage(curCase.revisedReport.overallScore, curCase.revisedReport.maxScore);
    const caseDelta = roundTo1(curPct - basePct);
    if (caseDelta < -tolerance) {
      regressions.push({
        fixtureId: baseCase.fixtureId,
        model: baseCase.model,
        scope: "case_revised",
        baseline: basePct,
        current: curPct,
        delta: caseDelta,
        tolerance,
      });
    } else if (caseDelta > tolerance) {
      improvements.push({
        fixtureId: baseCase.fixtureId,
        model: baseCase.model,
        scope: "case_revised",
        baseline: basePct,
        current: curPct,
        delta: caseDelta,
      });
    }

    for (const baseMetric of baseCase.revisedReport.metrics) {
      const curMetric = curCase.revisedReport.metrics.find((m) => m.key === baseMetric.key);
      if (!curMetric) continue;
      const baseMetricPct = percentage(baseMetric.score, baseMetric.max);
      const curMetricPct = percentage(curMetric.score, curMetric.max);
      const metricDelta = roundTo1(curMetricPct - baseMetricPct);
      if (metricDelta < -tolerance) {
        regressions.push({
          fixtureId: baseCase.fixtureId,
          model: baseCase.model,
          scope: "case_metric",
          metric: baseMetric.key,
          baseline: baseMetricPct,
          current: curMetricPct,
          delta: metricDelta,
          tolerance,
        });
      } else if (metricDelta > tolerance) {
        improvements.push({
          fixtureId: baseCase.fixtureId,
          model: baseCase.model,
          scope: "case_metric",
          metric: baseMetric.key,
          baseline: baseMetricPct,
          current: curMetricPct,
          delta: metricDelta,
        });
      }
    }
  }

  return {
    passed: regressions.length === 0,
    tolerance,
    regressions,
    improvements,
    summary: {
      baselineAvgRevised: baseline.summary.averageRevisedScore,
      currentAvgRevised: current.summary.averageRevisedScore,
      delta: summaryDelta,
    },
  };
}

export function renderComparisonReport(comparison: BaselineComparison): string {
  const lines: string[] = [];
  lines.push(
    comparison.passed
      ? `✓ baseline check passed (tolerance ${comparison.tolerance} pts)`
      : `✗ baseline check failed: ${comparison.regressions.length} regression(s) (tolerance ${comparison.tolerance} pts)`,
  );
  lines.push(
    `  summary avg revised: ${comparison.summary.baselineAvgRevised} → ${comparison.summary.currentAvgRevised} (Δ ${formatDelta(comparison.summary.delta)})`,
  );

  if (comparison.regressions.length > 0) {
    lines.push("");
    lines.push("Regressions:");
    for (const r of comparison.regressions) {
      lines.push(`  - ${labelFor(r)}: ${r.baseline.toFixed(1)} → ${r.current.toFixed(1)} (Δ ${formatDelta(r.delta)})`);
    }
  }

  if (comparison.improvements.length > 0) {
    lines.push("");
    lines.push("Improvements (outside tolerance):");
    for (const i of comparison.improvements) {
      lines.push(`  + ${labelFor(i)}: ${i.baseline.toFixed(1)} → ${i.current.toFixed(1)} (Δ ${formatDelta(i.delta)})`);
    }
  }

  return lines.join("\n");
}

function percentage(score: number, max: number): number {
  if (max <= 0) return 0;
  return roundTo1((score / max) * 100);
}

function roundTo1(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatDelta(delta: number): string {
  return delta >= 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1);
}

function labelFor(entry: BaselineRegression | BaselineImprovement): string {
  if (entry.scope === "summary") return "summary";
  if (entry.scope === "missing_case") return `${entry.fixtureId}/${entry.model} (missing)`;
  if (entry.scope === "case_metric") return `${entry.fixtureId}/${entry.model} · ${entry.metric}`;
  return `${entry.fixtureId}/${entry.model}`;
}
