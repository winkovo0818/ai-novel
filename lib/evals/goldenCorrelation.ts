/**
 * Golden-set correlation core (pure, no file IO) — verifies the heuristic
 * quality evaluator against human labels.
 *
 * `eval:check` only guards against drift vs. a historical baseline; it cannot
 * tell whether a 91-point chapter is one a human actually rates highly. This
 * module computes, per dimension, the Spearman rank correlation (does the
 * evaluator rank chapters in the same order a human does?) and the mean
 * absolute error between auto and human scores. Kept pure so it is unit-tested
 * without touching the filesystem; the script layer (eval-golden-correlation.ts)
 * does the IO and rendering.
 */

/** Dimensions compared. Mirrors MetricResult["key"] plus the human-only "overall". */
export type GoldenDimension =
  | "continuity"
  | "logic"
  | "character_consistency"
  | "plot_progress"
  | "world_rules"
  | "ai_voice"
  | "prose_readability"
  | "overall";

/** One sample's paired scores: auto (from evaluateNovelQuality) vs. human (labels). */
export interface GoldenScorePair {
  sampleId: string;
  /** Auto scores per dimension (0-10). `overall` is the auto total folded to 0-10. */
  auto: Partial<Record<GoldenDimension, number>>;
  /** Human scores per dimension (0-10). */
  human: Partial<Record<GoldenDimension, number>>;
}

export interface DimensionCorrelation {
  dimension: GoldenDimension;
  /** Sample count with both auto and human scores present. */
  n: number;
  /** Spearman rank correlation in [-1, 1]; null when n < 2 or no variance. */
  spearman: number | null;
  /** Mean absolute error between auto and human scores (same 0-10 scale). */
  mae: number;
  /** True when spearman is non-null and below `threshold` — flags a weak dimension. */
  belowThreshold: boolean;
}

export interface GoldenCorrelationReport {
  sampleCount: number;
  threshold: number;
  dimensions: DimensionCorrelation[];
  /** Samples whose overall auto/human gap is largest, worst first (for review). */
  outliers: Array<{ sampleId: string; dimension: GoldenDimension; auto: number; human: number; gap: number }>;
}

const ALL_DIMENSIONS: GoldenDimension[] = [
  "continuity",
  "logic",
  "character_consistency",
  "plot_progress",
  "world_rules",
  "ai_voice",
  "prose_readability",
  "overall",
];

const DEFAULT_THRESHOLD = 0.5;

/**
 * Fractional (tie-aware) ranks: equal values share the average of the ranks
 * they would otherwise occupy. Required for a correct Spearman with ties.
 */
export function rank(values: number[]): number[] {
  const indexed = values.map((value, index) => ({ value, index }));
  indexed.sort((a, b) => a.value - b.value);
  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].value === indexed[i].value) j += 1;
    // Ranks are 1-based; average rank for the tie group [i, j].
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) ranks[indexed[k].index] = avgRank;
    i = j + 1;
  }
  return ranks;
}

/** Pearson correlation. Returns null when either side has zero variance. */
export function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const n = xs.length;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  if (varX === 0 || varY === 0) return null;
  return cov / Math.sqrt(varX * varY);
}

/** Spearman rank correlation = Pearson over fractional ranks (tie-safe). */
export function spearman(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null;
  return pearson(rank(xs), rank(ys));
}

export function meanAbsoluteError(xs: number[], ys: number[]): number {
  if (xs.length === 0 || xs.length !== ys.length) return 0;
  const total = xs.reduce((sum, x, i) => sum + Math.abs(x - ys[i]), 0);
  return total / xs.length;
}

export interface CorrelationOptions {
  /** Spearman below this flags a dimension as weak. Default 0.5. */
  threshold?: number;
  /** Max outliers to surface. Default 5. */
  maxOutliers?: number;
}

/**
 * Compute per-dimension Spearman + MAE across all paired samples, plus the
 * largest auto-vs-human gaps for manual review.
 */
export function computeGoldenCorrelation(
  pairs: GoldenScorePair[],
  options: CorrelationOptions = {},
): GoldenCorrelationReport {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const maxOutliers = options.maxOutliers ?? 5;

  const dimensions: DimensionCorrelation[] = ALL_DIMENSIONS.map((dimension) => {
    const autoVals: number[] = [];
    const humanVals: number[] = [];
    for (const pair of pairs) {
      const a = pair.auto[dimension];
      const h = pair.human[dimension];
      if (typeof a === "number" && typeof h === "number") {
        autoVals.push(a);
        humanVals.push(h);
      }
    }
    const sp = spearman(autoVals, humanVals);
    return {
      dimension,
      n: autoVals.length,
      spearman: sp,
      mae: meanAbsoluteError(autoVals, humanVals),
      belowThreshold: sp !== null && sp < threshold,
    };
  });

  const outliers = pairs
    .flatMap((pair) =>
      ALL_DIMENSIONS.flatMap((dimension) => {
        const a = pair.auto[dimension];
        const h = pair.human[dimension];
        if (typeof a !== "number" || typeof h !== "number") return [];
        return [{ sampleId: pair.sampleId, dimension, auto: a, human: h, gap: Math.abs(a - h) }];
      }),
    )
    .sort((x, y) => y.gap - x.gap)
    .slice(0, maxOutliers);

  return { sampleCount: pairs.length, threshold, dimensions, outliers };
}
