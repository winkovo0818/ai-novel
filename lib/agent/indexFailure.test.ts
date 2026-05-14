import { describe, expect, it } from "vitest";

import {
  formatMemoryIndexFailureLocation,
  parseMemoryIndexFailure,
} from "./indexFailure";

describe("parseMemoryIndexFailure", () => {
  it("extracts chunk, paragraph, stage, and preview from indexed failure messages (P1-10)", () => {
    const result = parseMemoryIndexFailure(
      'MEMORY_CHUNK_INDEX_FAILED chunk=2/5 paragraphs=3-4 stage=embedding preview="主角进入遗迹" cause="provider 503"',
    );

    expect(result).toEqual({
      chunkIndex: 2,
      chunkCount: 5,
      paragraphs: "3-4",
      stage: "embedding",
      preview: "主角进入遗迹",
    });
  });

  it("returns null for unrelated job errors", () => {
    expect(parseMemoryIndexFailure("No handler registered")).toBeNull();
    expect(parseMemoryIndexFailure(null)).toBeNull();
  });
});

describe("formatMemoryIndexFailureLocation", () => {
  it("returns a compact user-facing location string", () => {
    expect(
      formatMemoryIndexFailureLocation({
        chunkIndex: 1,
        chunkCount: 3,
        paragraphs: "7",
        stage: "insert",
        preview: "x",
      }),
    ).toBe("索引失败：第 7 段 · chunk 1/3 · 入库");
  });
});
