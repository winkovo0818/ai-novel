import { describe, expect, it, vi } from "vitest";

import { buildMemoryLibraryPreview, normalizeMemoryLibraryQuery } from "./memoryLibrary";

describe("normalizeMemoryLibraryQuery", () => {
  it("normalizes pagination and supported filters", () => {
    expect(normalizeMemoryLibraryQuery({ page: -1, pageSize: 500, type: "plot_thread", chapterIndex: 2 })).toEqual({
      page: 1,
      pageSize: 100,
      type: "plot_thread",
      chapterIndex: 2,
    });
    expect(normalizeMemoryLibraryQuery({ type: "unknown" })).toMatchObject({ type: "all" });
  });
});

describe("buildMemoryLibraryPreview", () => {
  it("builds the shared memory library view model", async () => {
    const now = new Date("2026-05-27T00:00:00.000Z");
    const deps = {
      chapterDraft: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "chapter-1",
            chapter_index: 1,
            title: "第一章",
            content: "正文",
            status: "done",
            summary_dirty: true,
            index_dirty: false,
            updated_at: now,
            summary: { id: "summary-1", summary: "章节摘要", updated_at: now },
          },
        ]),
      },
      memoryChunk: {
        groupBy: vi.fn().mockResolvedValue([{ chapter_id: "chapter-1", _count: { _all: 1 } }]),
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([
          {
            id: "chunk-1",
            chapter_id: "chapter-1",
            chunk_type: "scene",
            source_kind: "chapter",
            importance: 1.25,
            last_used_at: now,
            text: "记忆片段",
            metadata: { chunk_index: 1 },
            created_at: now,
            updated_at: now,
          },
        ]),
      },
      volumeSummary: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      novelSummary: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };

    const preview = await buildMemoryLibraryPreview(deps, "novel-1", { pageSize: 10 });

    expect(preview.freshness.staleSummaryCount).toBe(1);
    expect(preview.freshness.staleIndexCount).toBe(0);
    expect(preview.chapterSummaries[0]).toMatchObject({ id: "summary-1", freshness: "stale" });
    expect(preview.memoryChunks.items[0]).toMatchObject({
      id: "chunk-1",
      chapterIndex: 1,
      chapterTitle: "第一章",
      type: "scene",
      sourceKind: "chapter",
      importance: 1.25,
      lastUsedAt: now.toISOString(),
    });
  });
});
