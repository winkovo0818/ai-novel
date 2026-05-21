import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findManyChapter: vi.fn(),
  findManyChapterSummary: vi.fn(),
  groupByMemoryChunk: vi.fn(),
  findManyJob: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    chapterDraft: { findMany: mocks.findManyChapter },
    chapterSummary: { findMany: mocks.findManyChapterSummary },
    memoryChunk: { groupBy: mocks.groupByMemoryChunk },
    backgroundJob: { findMany: mocks.findManyJob },
  },
}));

const { findManyChapter, findManyChapterSummary, groupByMemoryChunk, findManyJob } = mocks;

import { buildChapterStatus, getChapterStatusesForNovel } from "./chapterStatus";

function chapter(overrides: Partial<{
  id: string;
  chapter_index: number;
  summary_dirty: boolean;
  index_dirty: boolean;
  updated_at: Date;
}>) {
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

function summary(updatedAt: Date, chapterId = "c-1") {
  return {
    id: `s-${chapterId}`,
    chapter_id: chapterId,
    summary: "x",
    created_at: updatedAt,
    updated_at: updatedAt,
  };
}

function job(overrides: Partial<NonNullable<Parameters<typeof buildChapterStatus>[0]["latestJob"]>>) {
  return {
    id: "j-1",
    novel_id: "n-1",
    type: "summarize_chapter",
    payload: { chapter_id: "c-1" },
    status: "running",
    attempts: 0,
    last_error: null,
    created_at: new Date("2026-01-06"),
    updated_at: new Date("2026-01-06"),
    started_at: new Date("2026-01-06"),
    finished_at: null,
    ...overrides,
  } as NonNullable<Parameters<typeof buildChapterStatus>[0]["latestJob"]>;
}

describe("buildChapterStatus — M3.1 dirty bits", () => {
  it("treats summary_dirty=true as stale even when timestamps look fresh", async () => {
    const view = buildChapterStatus({
      chapter: chapter({ summary_dirty: true, updated_at: new Date("2026-01-01") }),
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

  it("ignores stale timestamps when summary_dirty is false (dirty bit is authoritative)", async () => {
    // After M3.1 the dirty bit is the source of truth. ChapterDraft.update bumps
    // updated_at on every PATCH (title, autosave, status flip), so comparing
    // timestamps would falsely re-stale every chapter after any non-content edit.
    const view = buildChapterStatus({
      chapter: chapter({
        summary_dirty: false,
        updated_at: new Date("2026-02-01"),
      }),
      summary: summary(new Date("2026-01-01")),
      hasMemoryChunks: true,
    });
    expect(view.summary).toBe("fresh");
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

  it("dirty bits win over missing: a chapter with no summary/index rows but dirty flags set returns stale", async () => {
    const view = buildChapterStatus({
      chapter: chapter({ summary_dirty: true, index_dirty: true }),
      summary: null,
      hasMemoryChunks: false,
    });
    expect(view.summary).toBe("stale");
    expect(view.index).toBe("stale");
  });

  it("snapshots dirty-bit, missing-data, and job-priority combinations", () => {
    const staleChapter = chapter({
      updated_at: new Date("2026-01-05"),
      summary_dirty: false,
      index_dirty: false,
    });
    const freshSummary = summary(new Date("2026-01-06"));
    const oldSummary = summary(new Date("2026-01-01"));
    const cases = [
      {
        name: "clean rows are fresh",
        args: { chapter: staleChapter, summary: freshSummary, hasMemoryChunks: true },
      },
      {
        name: "older summary timestamp does NOT stale when dirty bit is clear",
        args: { chapter: staleChapter, summary: oldSummary, hasMemoryChunks: true },
      },
      {
        name: "summary dirty bit makes summary stale",
        args: {
          chapter: chapter({ summary_dirty: true }),
          summary: freshSummary,
          hasMemoryChunks: true,
        },
      },
      {
        name: "index dirty bit makes index stale",
        args: {
          chapter: chapter({ index_dirty: true }),
          summary: freshSummary,
          hasMemoryChunks: true,
        },
      },
      {
        name: "both dirty bits can be stale together",
        args: {
          chapter: chapter({ summary_dirty: true, index_dirty: true }),
          summary: freshSummary,
          hasMemoryChunks: true,
        },
      },
      {
        name: "dirty trumps missing when no rows exist yet",
        args: { chapter: chapter({ summary_dirty: true, index_dirty: true }), summary: null, hasMemoryChunks: false },
      },
      {
        name: "pending summarize job outranks dirty summary",
        args: {
          chapter: chapter({ summary_dirty: true, index_dirty: true }),
          summary: freshSummary,
          hasMemoryChunks: true,
          latestJob: job({ type: "summarize_chapter", status: "pending" }),
        },
      },
      {
        name: "failed summarize job outranks dirty summary",
        args: {
          chapter: chapter({ summary_dirty: true, index_dirty: true }),
          summary: freshSummary,
          hasMemoryChunks: true,
          latestJob: job({ type: "summarize_chapter", status: "failed", last_error: "summary failed" }),
        },
      },
      {
        name: "running index job outranks dirty index",
        args: {
          chapter: chapter({ summary_dirty: true, index_dirty: true }),
          summary: freshSummary,
          hasMemoryChunks: true,
          latestJob: job({ type: "index_chapter", status: "running" }),
        },
      },
      {
        name: "failed index job outranks dirty index",
        args: {
          chapter: chapter({ summary_dirty: true, index_dirty: true }),
          summary: freshSummary,
          hasMemoryChunks: true,
          latestJob: job({ type: "index_chapter", status: "failed", last_error: "index failed" }),
        },
      },
    ] satisfies Array<{
      name: string;
      args: Parameters<typeof buildChapterStatus>[0];
    }>;

    const matrix = cases.map(({ name, args }) => {
      const view = buildChapterStatus(args);
      return {
        name,
        summary: view.summary,
        index: view.index,
        lastJobStatus: view.lastJobStatus ?? null,
        lastJobType: view.lastJobType ?? null,
        lastJobError: view.lastJobError ?? null,
      };
    });

    expect(matrix).toMatchInlineSnapshot(`
      [
        {
          "index": "fresh",
          "lastJobError": null,
          "lastJobStatus": null,
          "lastJobType": null,
          "name": "clean rows are fresh",
          "summary": "fresh",
        },
        {
          "index": "fresh",
          "lastJobError": null,
          "lastJobStatus": null,
          "lastJobType": null,
          "name": "older summary timestamp does NOT stale when dirty bit is clear",
          "summary": "fresh",
        },
        {
          "index": "fresh",
          "lastJobError": null,
          "lastJobStatus": null,
          "lastJobType": null,
          "name": "summary dirty bit makes summary stale",
          "summary": "stale",
        },
        {
          "index": "stale",
          "lastJobError": null,
          "lastJobStatus": null,
          "lastJobType": null,
          "name": "index dirty bit makes index stale",
          "summary": "fresh",
        },
        {
          "index": "stale",
          "lastJobError": null,
          "lastJobStatus": null,
          "lastJobType": null,
          "name": "both dirty bits can be stale together",
          "summary": "stale",
        },
        {
          "index": "stale",
          "lastJobError": null,
          "lastJobStatus": null,
          "lastJobType": null,
          "name": "dirty trumps missing when no rows exist yet",
          "summary": "stale",
        },
        {
          "index": "stale",
          "lastJobError": null,
          "lastJobStatus": "pending",
          "lastJobType": "summarize_chapter",
          "name": "pending summarize job outranks dirty summary",
          "summary": "running",
        },
        {
          "index": "stale",
          "lastJobError": "summary failed",
          "lastJobStatus": "failed",
          "lastJobType": "summarize_chapter",
          "name": "failed summarize job outranks dirty summary",
          "summary": "failed",
        },
        {
          "index": "running",
          "lastJobError": null,
          "lastJobStatus": "running",
          "lastJobType": "index_chapter",
          "name": "running index job outranks dirty index",
          "summary": "stale",
        },
        {
          "index": "failed",
          "lastJobError": "index failed",
          "lastJobStatus": "failed",
          "lastJobType": "index_chapter",
          "name": "failed index job outranks dirty index",
          "summary": "stale",
        },
      ]
    `);
  });
});

describe("getChapterStatusesForNovel — bulk aggregation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findManyChapter.mockResolvedValue([]);
    findManyChapterSummary.mockResolvedValue([]);
    groupByMemoryChunk.mockResolvedValue([]);
    findManyJob.mockResolvedValue([]);
  });

  it("returns an empty list for a novel with no chapters", async () => {
    const result = await getChapterStatusesForNovel("n-empty");
    expect(result).toEqual([]);
    expect(findManyChapter).toHaveBeenCalledWith(
      expect.objectContaining({ where: { novel_id: "n-empty" } }),
    );
  });

  it("joins summary, chunk presence, and latest job per chapter", async () => {
    findManyChapter.mockResolvedValue([
      chapter({ id: "c-1", chapter_index: 1 }),
      chapter({ id: "c-2", chapter_index: 2, summary_dirty: true }),
      chapter({ id: "c-3", chapter_index: 3, index_dirty: true }),
    ]);
    findManyChapterSummary.mockResolvedValue([
      summary(new Date("2026-01-05"), "c-1"),
      summary(new Date("2026-01-05"), "c-2"),
      // No summary for c-3 → missing
    ]);
    groupByMemoryChunk.mockResolvedValue([
      { chapter_id: "c-1", _count: { _all: 4 } },
      { chapter_id: "c-2", _count: { _all: 2 } },
      // c-3 has no chunks → missing
    ]);
    findManyJob.mockResolvedValue([]);

    const result = await getChapterStatusesForNovel("n-1");

    // Per-chapter views are returned in the chapter_index order from the
    // chapterDraft.findMany query.
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ chapterId: "c-1", summary: "fresh", index: "fresh" });
    expect(result[1]).toMatchObject({ chapterId: "c-2", summary: "stale", index: "fresh" });
    expect(result[2]).toMatchObject({ chapterId: "c-3", summary: "stale", index: "stale" });
  });

  it("only counts chunks when _count._all > 0 (groupBy can return zero rows)", async () => {
    findManyChapter.mockResolvedValue([chapter({ id: "c-1" })]);
    findManyChapterSummary.mockResolvedValue([summary(new Date("2026-01-05"))]);
    // The groupBy may produce a row with 0 chunks if a chapter_id was
    // present-then-deleted; treat it as missing.
    groupByMemoryChunk.mockResolvedValue([{ chapter_id: "c-1", _count: { _all: 0 } }]);
    findManyJob.mockResolvedValue([]);

    const result = await getChapterStatusesForNovel("n-1");
    expect(result[0].index).toBe("stale");
  });

  it("attaches the LATEST job per chapter (jobs ordered desc by created_at)", async () => {
    findManyChapter.mockResolvedValue([chapter({ id: "c-1" })]);
    findManyChapterSummary.mockResolvedValue([summary(new Date("2026-01-05"))]);
    groupByMemoryChunk.mockResolvedValue([{ chapter_id: "c-1", _count: { _all: 1 } }]);
    // Simulate the desc-by-created_at order the production query uses:
    // first row = newest. Two summarize jobs for the same chapter — only
    // the first one should win in the per-chapter map.
    findManyJob.mockResolvedValue([
      {
        id: "j-new",
        type: "summarize_chapter",
        payload: { chapter_id: "c-1" },
        status: "failed",
        last_error: "oops",
      },
      {
        id: "j-old",
        type: "summarize_chapter",
        payload: { chapter_id: "c-1" },
        status: "done",
        last_error: null,
      },
    ]);

    const result = await getChapterStatusesForNovel("n-1");
    // The newest job is "failed" — that should bubble up.
    expect(result[0].lastJobStatus).toBe("failed");
    expect(result[0].lastJobError).toBe("oops");
    expect(result[0].summary).toBe("failed");
  });

  it("ignores job rows whose payload is missing chapter_id", async () => {
    findManyChapter.mockResolvedValue([chapter({ id: "c-1" })]);
    findManyChapterSummary.mockResolvedValue([summary(new Date("2026-01-05"))]);
    groupByMemoryChunk.mockResolvedValue([{ chapter_id: "c-1", _count: { _all: 1 } }]);
    findManyJob.mockResolvedValue([
      // refresh_summaries jobs are novel-scoped and have no chapter_id;
      // they must not pollute per-chapter status.
      { id: "j-1", type: "refresh_summaries", payload: { novel_id: "n-1" }, status: "running" },
      { id: "j-2", type: "summarize_chapter", payload: null, status: "done" },
    ]);

    const result = await getChapterStatusesForNovel("n-1");
    expect(result[0].lastJobStatus).toBeUndefined();
    expect(result[0].summary).toBe("fresh");
  });
});
