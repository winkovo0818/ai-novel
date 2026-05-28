import { describe, expect, it } from "vitest";

import { buildSummaryDiffMetadata } from "./summaryDiff";

describe("buildSummaryDiffMetadata", () => {
  it("counts changed lines and characters for summary previews", () => {
    const diff = buildSummaryDiffMetadata("旧摘要\n第二行", "新摘要\n第二行\n第三行");

    expect(diff.changed).toBe(true);
    expect(diff.beforeCharacters).toBe(7);
    expect(diff.afterCharacters).toBe(11);
    expect(diff.addedLines).toBeGreaterThan(0);
    expect(diff.removedLines).toBeGreaterThan(0);
    expect(diff.addedCharacters).toBeGreaterThan(0);
    expect(diff.removedCharacters).toBeGreaterThan(0);
  });

  it("marks identical summaries unchanged", () => {
    expect(buildSummaryDiffMetadata("摘要", "摘要")).toEqual({
      changed: false,
      beforeCharacters: 2,
      afterCharacters: 2,
      addedCharacters: 0,
      removedCharacters: 0,
      addedLines: 0,
      removedLines: 0,
    });
  });
});
