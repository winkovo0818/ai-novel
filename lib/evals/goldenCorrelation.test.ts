import { describe, expect, it } from "vitest";

import {
  computeGoldenCorrelation,
  meanAbsoluteError,
  pearson,
  rank,
  spearman,
  type GoldenScorePair,
} from "./goldenCorrelation";

describe("rank", () => {
  it("assigns 1-based ranks for distinct values", () => {
    expect(rank([10, 30, 20])).toEqual([1, 3, 2]);
  });

  it("averages ranks for ties (fractional ranking)", () => {
    // two 5s occupy ranks 1 and 2 → both get 1.5; 9 gets rank 3.
    expect(rank([5, 5, 9])).toEqual([1.5, 1.5, 3]);
  });
});

describe("pearson / spearman", () => {
  it("returns 1 for a perfectly increasing relationship", () => {
    expect(spearman([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 6);
  });

  it("returns -1 for a perfectly inverse relationship", () => {
    expect(spearman([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 6);
  });

  it("captures monotonic-but-nonlinear agreement better than Pearson", () => {
    const xs = [1, 2, 3, 4];
    const ys = [1, 2, 4, 100]; // monotonic, very nonlinear
    expect(spearman(xs, ys)).toBeCloseTo(1, 6); // ranks agree perfectly
    expect(pearson(xs, ys)!).toBeLessThan(1); // linear correlation is dragged down
  });

  it("returns null when there is no variance or too few points", () => {
    expect(spearman([5, 5, 5], [1, 2, 3])).toBeNull();
    expect(spearman([1], [1])).toBeNull();
  });
});

describe("meanAbsoluteError", () => {
  it("averages the absolute differences", () => {
    expect(meanAbsoluteError([8, 6, 10], [7, 8, 10])).toBeCloseTo((1 + 2 + 0) / 3, 6);
  });
});

describe("computeGoldenCorrelation", () => {
  const pairs: GoldenScorePair[] = [
    { sampleId: "a", auto: { logic: 9, ai_voice: 8, overall: 9 }, human: { logic: 8, ai_voice: 9, overall: 9 } },
    { sampleId: "b", auto: { logic: 7, ai_voice: 6, overall: 7 }, human: { logic: 6, ai_voice: 7, overall: 7 } },
    { sampleId: "c", auto: { logic: 5, ai_voice: 4, overall: 5 }, human: { logic: 4, ai_voice: 5, overall: 5 } },
  ];

  it("computes per-dimension correlation and counts paired samples", () => {
    const report = computeGoldenCorrelation(pairs);
    const logic = report.dimensions.find((d) => d.dimension === "logic")!;
    expect(logic.n).toBe(3);
    // auto logic and human logic both increase together → spearman 1.
    expect(logic.spearman).toBeCloseTo(1, 6);
    expect(report.sampleCount).toBe(3);
  });

  it("flags dimensions below the threshold", () => {
    // ai_voice auto is inversely related to nothing here; force a weak dim via custom threshold.
    const report = computeGoldenCorrelation(pairs, { threshold: 1.01 });
    // With an impossible threshold, every non-null dimension is flagged weak.
    const flagged = report.dimensions.filter((d) => d.belowThreshold).map((d) => d.dimension);
    expect(flagged).toContain("logic");
  });

  it("surfaces the largest auto-vs-human gaps as outliers", () => {
    const skewed: GoldenScorePair[] = [
      { sampleId: "x", auto: { logic: 10 }, human: { logic: 2 } }, // gap 8
      { sampleId: "y", auto: { logic: 6 }, human: { logic: 5 } }, // gap 1
    ];
    const report = computeGoldenCorrelation(skewed, { maxOutliers: 1 });
    expect(report.outliers).toHaveLength(1);
    expect(report.outliers[0]).toMatchObject({ sampleId: "x", dimension: "logic", gap: 8 });
  });

  it("only pairs dimensions present in both auto and human", () => {
    const partial: GoldenScorePair[] = [
      { sampleId: "p", auto: { logic: 8 }, human: { ai_voice: 7 } }, // no shared dim
    ];
    const report = computeGoldenCorrelation(partial);
    expect(report.dimensions.find((d) => d.dimension === "logic")!.n).toBe(0);
    expect(report.dimensions.find((d) => d.dimension === "ai_voice")!.n).toBe(0);
  });
});
