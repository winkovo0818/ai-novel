import {
  evaluateNovelQuality,
  type MetricResult,
  type NovelQualityReport,
  type QualityChapterInput,
} from "@/lib/evals/novelQuality";
import type { CriticIssue } from "@/lib/agent/contracts";
import type { BibleDraft } from "@/lib/validation/schemas";

export const DEFAULT_QUALITY_FLOOR = 85;
/**
 * Per-dimension hard floors (absolute score out of 10). A chapter that tanks
 * one critical axis fails even if the total passes — total alone is too coarse.
 *
 * ai_voice 是**软信号**（见 SOFT_SIGNAL_DIMENSIONS），不设硬门——实测其 std
 * 高达 23.6（满分 100），单次跑在 0-7 间剧烈摆动，用不可信维度止链长跑是
 * 机制错配。ai_voice 低分仍记入 failedDims 作 warning，但不阻断 pass。
 */
export const DEFAULT_DIMENSION_FLOORS: Partial<Record<MetricResult["key"], number>> = {
  logic: 7,
};
/**
 * 软信号维度：低于阈值时记录为 warning（进 failedDims 供观测），但不计入 pass
 * 判定。ai_voice 维度稳定性不足（multi 实测 std 23.6），设硬门会在长篇中反复
 * 误止链，故降为软信号。logic/continuity 等稳定维度仍走硬门。
 */
export const SOFT_SIGNAL_DIMENSIONS: ReadonlySet<MetricResult["key"]> = new Set(["ai_voice"]);
/** 软信号维度的阈值（仅用于记录 warning，不阻断 pass）。 */
export const SOFT_SIGNAL_THRESHOLDS: Partial<Record<MetricResult["key"], number>> = {
  ai_voice: 6,
};
/**
 * Critic hard floor: the heuristic evaluator only sees surface signals, so a
 * chapter can clear the score floor while the LLM critic flagged a genuine
 * semantic contradiction. Folding the critic's final-pass issues into the gate
 * is a free cross-check — the critic already ran in the pipeline, we just stop
 * discarding its verdict. By default any `critical` or `major` issue fails the gate.
 * Tunable per run via {@link QualityGateOptions}.
 */
export const DEFAULT_CRITIC_FLOOR: Required<CriticFloor> = {
  failOnCritical: true,
  maxMajor: 0,
};
/**
 * Below this window size the heuristics (especially continuity, which needs ≥3
 * chapters) are unreliable and would unfairly fail the opening chapters. The
 * spike saw quality peak mid-run and the cold start is inherently noisy, so we
 * skip only heuristic floors for the opening chapters; critic issues still block.
 */
const MIN_WINDOW_FOR_GATE = 3;

/** Critic-issue gating thresholds. Merged onto {@link DEFAULT_CRITIC_FLOOR}. */
export interface CriticFloor {
  /** Any `critical` critic issue fails the gate. Default true. */
  failOnCritical?: boolean;
  /** Fail when `major` issue count exceeds this. Default 0. */
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
  /**
   * 软信号维度低于阈值（仅记录，不阻断 pass）。含 ai_voice——实测稳定性不足
   * （std 23.6），降为软信号避免长篇反复误止链；此处供观测/告警，不进 pass 判定。
   */
  softWarnings: FailedDimension[];
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
  const softWarnings: FailedDimension[] = [];
  for (const m of report.metrics) {
    // 软信号维度（ai_voice）：低分记 warning 不阻断 pass，避免不可信维度止链长跑
    if (SOFT_SIGNAL_DIMENSIONS.has(m.key)) {
      const softFloor = SOFT_SIGNAL_THRESHOLDS[m.key];
      if (softFloor != null && m.score < softFloor) {
        softWarnings.push({ key: m.key, label: m.label, score: m.score, max: m.max, floor: softFloor });
      }
      continue;
    }
    const floor = dimensionFloors[m.key];
    if (floor != null && m.score < floor) {
      failedDims.push({ key: m.key, label: m.label, score: m.score, max: m.max, floor });
    }
  }

  // Critic hard floor: cross-check the heuristic score against the LLM critic's
  // final-pass verdict. Free — the critic already ran in the pipeline.
  const criticFloor = { ...DEFAULT_CRITIC_FLOOR, ...options.criticFloor };
  const criticIssues = options.criticIssues ?? [];
  const criticBlocked = collectCriticBlocked(criticIssues, criticFloor);

  const coldStart = window.length < MIN_WINDOW_FOR_GATE;
  if (coldStart) failedDims.length = 0;
  const floorPass = coldStart || scorePct >= qualityFloor;
  const pass = floorPass && failedDims.length === 0 && criticBlocked.length === 0;

  const reasons: string[] = [];
  if (!floorPass) reasons.push(`总分 ${scorePct}% < 阈值 ${qualityFloor}%`);
  for (const d of failedDims) reasons.push(`${d.label}(${d.key}) ${d.score} < ${d.floor}`);
  for (const issue of criticBlocked) reasons.push(`critic(${issue.severity}/${issue.type}) ${issue.description}`);
  // 软信号 warning 记入 reason 但不影响 pass
  for (const w of softWarnings) reasons.push(`软信号${w.label}(${w.key}) ${w.score} < ${w.floor}（已降为软信号，不止链）`);
  const reason = pass
    ? `通过：${coldStart ? "冷启动仅跳过启发式门；" : ""}总分 ${scorePct}%${softWarnings.length > 0 ? `（含 ${softWarnings.length} 个软信号 warning）` : ""}`
    : `未达标：${reasons.join("；")}`;

  return { pass, scorePct, failedDims, softWarnings, criticBlocked, reason, report };
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
