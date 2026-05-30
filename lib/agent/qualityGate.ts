import {
  evaluateNovelQuality,
  type MetricResult,
  type NovelQualityReport,
  type QualityChapterInput,
} from "@/lib/evals/novelQuality";
import type { BibleDraft } from "@/lib/validation/schemas";

export const DEFAULT_QUALITY_FLOOR = 85;
/** Per-dimension hard floors (absolute score out of 10). A chapter that tanks
 *  one critical axis fails even if the total passes — total alone is too coarse. */
export const DEFAULT_DIMENSION_FLOORS: Partial<Record<MetricResult["key"], number>> = {
  ai_voice: 6,
  logic: 7,
};
/**
 * Below this window size the heuristics (especially continuity, which needs ≥3
 * chapters) are unreliable and would unfairly fail the opening chapters. The
 * spike saw quality peak mid-run and the cold start is inherently noisy, so we
 * let the first couple of chapters through rather than halt the whole book.
 */
const MIN_WINDOW_FOR_GATE = 3;

export interface QualityGateOptions {
  /** Percent floor (0-100); total below it fails the gate. Default 85. */
  qualityFloor?: number;
  /** Override/extend the per-dimension floors. Merged onto the defaults. */
  dimensionFloors?: Partial<Record<MetricResult["key"], number>>;
  fixtureId?: string;
}

export interface FailedDimension {
  key: MetricResult["key"];
  label: string;
  score: number;
  max: number;
  floor: number;
}

export interface QualityGateResult {
  pass: boolean;
  /** Total folded to a 0-100 percent. */
  scorePct: number;
  failedDims: FailedDimension[];
  reason: string;
  report: NovelQualityReport;
}

/**
 * The auto-pilot quality gate: score a sliding window (the last few chapters)
 * with the existing heuristic evaluator, then pass only if the total clears the
 * floor AND no critical dimension is below its hard floor. Pure (no DB/LLM) so
 * the handler and tests share one decision. The handler maps a failure to
 * needs_review (on_fail / per_volume) or logs + continues (none).
 */
export function evaluateChapterGate(
  window: QualityChapterInput[],
  bible: BibleDraft,
  options: QualityGateOptions = {},
): QualityGateResult {
  const qualityFloor = options.qualityFloor ?? DEFAULT_QUALITY_FLOOR;
  const dimensionFloors = { ...DEFAULT_DIMENSION_FLOORS, ...options.dimensionFloors };

  const report = evaluateNovelQuality({
    fixtureId: options.fixtureId ?? "auto-pilot-gate",
    bible,
    chapters: window,
  });

  const scorePct =
    report.maxScore > 0 ? Math.round((report.overallScore / report.maxScore) * 1000) / 10 : 0;

  const failedDims: FailedDimension[] = [];
  for (const m of report.metrics) {
    const floor = dimensionFloors[m.key];
    if (floor != null && m.score < floor) {
      failedDims.push({ key: m.key, label: m.label, score: m.score, max: m.max, floor });
    }
  }

  if (window.length < MIN_WINDOW_FOR_GATE) {
    return {
      pass: true,
      scorePct,
      failedDims: [],
      reason: `冷启动窗口（${window.length} < ${MIN_WINDOW_FOR_GATE} 章），跳过质量门`,
      report,
    };
  }

  const floorPass = scorePct >= qualityFloor;
  const pass = floorPass && failedDims.length === 0;

  const reasons: string[] = [];
  if (!floorPass) reasons.push(`总分 ${scorePct}% < 阈值 ${qualityFloor}%`);
  for (const d of failedDims) reasons.push(`${d.label}(${d.key}) ${d.score} < ${d.floor}`);
  const reason = pass ? `通过：总分 ${scorePct}%` : `未达标：${reasons.join("；")}`;

  return { pass, scorePct, failedDims, reason, report };
}
