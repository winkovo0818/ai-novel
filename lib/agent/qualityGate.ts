import {
  evaluateNovelQuality,
  type MetricResult,
  type NovelQualityReport,
  type QualityChapterInput,
} from "@/lib/evals/novelQuality";
import type { CriticIssue } from "@/lib/agent/contracts";
import type { BibleDraft } from "@/lib/validation/schemas";

export const DEFAULT_QUALITY_FLOOR = 85;
/** Per-dimension hard floors (absolute score out of 10). A chapter that tanks
 *  one critical axis fails even if the total passes — total alone is too coarse. */
export const DEFAULT_DIMENSION_FLOORS: Partial<Record<MetricResult["key"], number>> = {
  ai_voice: 6,
  logic: 7,
};
/**
 * Critic hard floor: the heuristic evaluator only sees surface signals, so a
 * chapter can clear the score floor while the LLM critic flagged a genuine
 * semantic contradiction. Folding the critic's final-pass issues into the gate
 * is a free cross-check — the critic already ran in the pipeline, we just stop
 * discarding its verdict. By default any `critical` issue fails the gate; `major`
 * is recorded but not auto-failed (keeps prior behavior — major already drives
 * the in-pipeline revise loop). Tunable per run via {@link QualityGateOptions}.
 */
export const DEFAULT_CRITIC_FLOOR: Required<CriticFloor> = {
  failOnCritical: true,
  maxMajor: Infinity,
};
/**
 * Below this window size the heuristics (especially continuity, which needs ≥3
 * chapters) are unreliable and would unfairly fail the opening chapters. The
 * spike saw quality peak mid-run and the cold start is inherently noisy, so we
 * let the first couple of chapters through rather than halt the whole book.
 */
const MIN_WINDOW_FOR_GATE = 3;

/** Critic-issue gating thresholds. Merged onto {@link DEFAULT_CRITIC_FLOOR}. */
export interface CriticFloor {
  /** Any `critical` critic issue fails the gate. Default true. */
  failOnCritical?: boolean;
  /** Fail when `major` issue count exceeds this. Default Infinity (never). */
  maxMajor?: number;
}

export interface QualityGateOptions {
  /** Percent floor (0-100); total below it fails the gate. Default 85. */
  qualityFloor?: number;
  /** Override/extend the per-dimension floors. Merged onto the defaults. */
  dimensionFloors?: Partial<Record<MetricResult["key"], number>>;
  /**
   * Final-pass critic issues for the newest chapter (from the pipeline). When
   * provided, they form a third hard floor alongside the score/dimension floors.
   * Omit to keep the pure heuristic gate (back-compat).
   */
  criticIssues?: CriticIssue[];
  /** Override the critic floor thresholds. Merged onto the defaults. */
  criticFloor?: CriticFloor;
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
  /** Critic issues that tripped the critic floor (empty unless criticIssues supplied). */
  criticBlocked: CriticIssue[];
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
    // Cold start skips every floor — including the critic floor. The opening
    // chapters are inherently noisy and the run shouldn't halt this early; the
    // critic still drove the in-pipeline revise loop, it just doesn't gate here.
    return {
      pass: true,
      scorePct,
      failedDims: [],
      criticBlocked: [],
      reason: `冷启动窗口（${window.length} < ${MIN_WINDOW_FOR_GATE} 章），跳过质量门`,
      report,
    };
  }

  // Critic hard floor: cross-check the heuristic score against the LLM critic's
  // final-pass verdict. Free — the critic already ran in the pipeline.
  const criticFloor = { ...DEFAULT_CRITIC_FLOOR, ...options.criticFloor };
  const criticIssues = options.criticIssues ?? [];
  const criticBlocked = collectCriticBlocked(criticIssues, criticFloor);

  const floorPass = scorePct >= qualityFloor;
  const pass = floorPass && failedDims.length === 0 && criticBlocked.length === 0;

  const reasons: string[] = [];
  if (!floorPass) reasons.push(`总分 ${scorePct}% < 阈值 ${qualityFloor}%`);
  for (const d of failedDims) reasons.push(`${d.label}(${d.key}) ${d.score} < ${d.floor}`);
  for (const issue of criticBlocked) reasons.push(`critic(${issue.severity}/${issue.type}) ${issue.description}`);
  const reason = pass ? `通过：总分 ${scorePct}%` : `未达标：${reasons.join("；")}`;

  return { pass, scorePct, failedDims, criticBlocked, reason, report };
}

/**
 * Pick the critic issues that trip the configured critic floor: all `critical`
 * issues when `failOnCritical`, plus the `major` issues once their count exceeds
 * `maxMajor`. `minor` never gates (mirrors the pipeline, where only major/critical
 * trigger a revise pass).
 */
function collectCriticBlocked(issues: CriticIssue[], floor: Required<CriticFloor>): CriticIssue[] {
  const blocked: CriticIssue[] = [];
  if (floor.failOnCritical) {
    blocked.push(...issues.filter((issue) => issue.severity === "critical"));
  }
  const majors = issues.filter((issue) => issue.severity === "major");
  if (majors.length > floor.maxMajor) {
    blocked.push(...majors);
  }
  return blocked;
}
