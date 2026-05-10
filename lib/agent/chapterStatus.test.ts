import { describe, expect, it } from "vitest";

import { buildChapterStatus } from "./chapterStatus";

function chapter(overrides: Partial<{ summary_dirty: boolean; index_dirty: boolean; updated_at: Date }>) {
  return {
    id: "c-1",
    novel_id: "n-1",
    chapter_index: 1,
    title: "t",
    content: "正文",
    status: "draft",
    target_words: null,
    version: 0,
    summary_dirty: false,
    index_dirty: false,
    created_at: new Date("2026-01-01"),
    updated_at: new Date("2026-01-02"),
    ...overrides,
  } as Parameters<typeof buildChapterStatus>[0]["chapter"];
}

function summary(updatedAt: Date) {
  return {
    id: "s-1",
    chapter_id: "c-1",
    summary: "x",
    created_at: updatedAt,
    updated_at: updatedAt,
  };
}

describe("buildChapterStatus — M3.1 dirty bits", () => {
  it("treats summary_dirty=true as stale even when timestamps look fresh", async () => {
    const view = buildChapterStatus({
      chapter: chapter({ summary_dirty: true, updated_at: new Date("2026-01-01") }),
      // Summary written AFTER the chapter — old logic would say "fresh".
      summary: summary(new Date("2026-01-05")),
      hasMemoryChunks: true,
    });
    expect(view.summary).toBe("stale");
    expect(view.index).toBe("fresh");
  });

  it("treats index_dirty=true as stale", async () => {
    const view = buildChapterStatus({
      chapter: chapter({ index_dirty: true }),
      summary: summary(new Date("2026-01-05")),
      hasMemoryChunks: true,
    });
    expect(view.index).toBe("stale");
  });

  it("falls back to timestamp comparison when both dirty bits are false", async () => {
    // Pre-M3.1 chapter: dirty bits stayed false because the migration
    // backfilled them only for chapters whose memory was actually missing.
    // Timestamps still serve as a backstop here.
    const view = buildChapterStatus({
      chapter: chapter({
        summary_dirty: false,
        updated_at: new Date("2026-02-01"),
      }),
      summary: summary(new Date("2026-01-01")),
      hasMemoryChunks: true,
    });
    expect(view.summary).toBe("stale");
  });

  it("returns fresh when bits are clear and summary is newer than the chapter", async () => {
    const view = buildChapterStatus({
      chapter: chapter({ updated_at: new Date("2026-01-01") }),
      summary: summary(new Date("2026-01-02")),
      hasMemoryChunks: true,
    });
    expect(view.summary).toBe("fresh");
    expect(view.index).toBe("fresh");
  });

  it("running job state outranks dirty bits", async () => {
    const view = buildChapterStatus({
      chapter: chapter({ summary_dirty: true, index_dirty: true }),
      summary: summary(new Date("2026-01-05")),
      hasMemoryChunks: true,
      latestJob: {
        id: "j-1",
        novel_id: "n-1",
        type: "summarize_chapter",
        payload: { chapter_id: "c-1" },
        status: "running",
        attempts: 0,
        last_error: null,
        created_at: new Date(),
        updated_at: new Date(),
        started_at: new Date(),
        finished_at: null,
      },
    });
    expect(view.summary).toBe("running");
  });

  it("missing summary trumps dirty bits", async () => {
    const view = buildChapterStatus({
      chapter: chapter({ summary_dirty: true }),
      summary: null,
      hasMemoryChunks: false,
    });
    expect(view.summary).toBe("missing");
    expect(view.index).toBe("missing");
  });
});
