import { describe, expect, it, vi, beforeEach } from "vitest";

/* ---- mocks ---- */

const retrieveMemories = vi.fn();

vi.mock("@/lib/agent/retrieval", () => ({
  retrieveMemories,
}));

/* ---- helpers ---- */

function makeBible(chapterCount = 8) {
  return {
    meta: { suggested_title: "逆魂纪", alternative_titles: [] },
    characters: [],
    world: { setting_summary: "九州碎裂", factions: [], rules: [], geography: [] },
    outline: {
      volume_1: {
        name: "柴门起",
        theme: "被收留者反过来审判收留者",
        chapter_count_estimate: chapterCount,
        chapters: Array.from({ length: chapterCount }, (_, i) => ({
          index: i + 1,
          title: `第${i + 1}章`,
          summary: `章节${i + 1}摘要`.repeat(3),
        })),
      },
    },
    first_chapter_beats: [],
  } as import("@/lib/validation/schemas").BibleDraft;
}

function makeChapters(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `ch-${i + 1}`,
    chapter_index: i + 1,
    title: `第${i + 1}章`,
    content: `正文${i + 1}`.repeat(10),
    status: "done",
    summary: { summary: `章节${i + 1}回顾`.repeat(2) },
  }));
}

describe("assembleChapterContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    retrieveMemories.mockResolvedValue({
      status: "success",
      memories: [{ source: "ch1", score: 0.9, reason: "match", text: "相关记忆" }],
    });
  });

  it("assembles context with retrieval", async () => {
    const { assembleChapterContext } = await import("./chapterContextAssembly");
    const result = await assembleChapterContext({
      novelId: "novel-1",
      bible: makeBible(),
      chapters: makeChapters(3),
      chapterIndex: 4,
    });
    expect(result.context).toBeDefined();
    expect(result.context.outline.chapterIndex).toBe(4);
    expect(result.retrieval.status).toBe("success");
    expect(result.retrieval.memories).toHaveLength(1);
    expect(retrieveMemories).toHaveBeenCalledWith("novel-1", expect.anything(), 4, 5);
  });

  it("skips retrieval when skipRetrieval is true", async () => {
    const { assembleChapterContext } = await import("./chapterContextAssembly");
    const result = await assembleChapterContext({
      novelId: "novel-1",
      bible: makeBible(),
      chapters: makeChapters(1),
      chapterIndex: 2,
      skipRetrieval: true,
    });
    expect(result.retrieval.status).toBe("empty");
    expect(result.retrieval.memories).toEqual([]);
    expect(retrieveMemories).not.toHaveBeenCalled();
  });

  it("normalizes null retrieval result to empty", async () => {
    retrieveMemories.mockResolvedValue(null);
    const { assembleChapterContext } = await import("./chapterContextAssembly");
    const result = await assembleChapterContext({
      novelId: "novel-1",
      bible: makeBible(),
      chapters: makeChapters(1),
      chapterIndex: 1,
    });
    expect(result.retrieval.status).toBe("empty");
  });

  it("normalizes retrieval result with missing memories array", async () => {
    retrieveMemories.mockResolvedValue({ status: "error", errorMessage: "timeout" });
    const { assembleChapterContext } = await import("./chapterContextAssembly");
    const result = await assembleChapterContext({
      novelId: "novel-1",
      bible: makeBible(),
      chapters: makeChapters(1),
      chapterIndex: 1,
    });
    expect(result.retrieval.status).toBe("error");
    expect(result.retrieval.errorMessage).toBe("timeout");
    expect(result.retrieval.memories).toEqual([]);
  });

  it("passes custom retrievalTopK", async () => {
    const { assembleChapterContext } = await import("./chapterContextAssembly");
    await assembleChapterContext({
      novelId: "novel-1",
      bible: makeBible(),
      chapters: makeChapters(1),
      chapterIndex: 1,
      retrievalTopK: 10,
    });
    expect(retrieveMemories).toHaveBeenCalledWith("novel-1", expect.anything(), 1, 10);
  });

  it("includes volume summary when available", async () => {
    const { assembleChapterContext } = await import("./chapterContextAssembly");
    const result = await assembleChapterContext({
      novelId: "novel-1",
      bible: makeBible(5),
      chapters: makeChapters(2),
      chapterIndex: 3,
      volumeSummaries: [{ volume_index: 0, summary: "第一卷回顾：主角觉醒剑魂。" }],
    });
    expect(result.context).toBeDefined();
    expect(result.context.outline.chapterIndex).toBe(3);
  });

  it("excludes summaries from future volumes", async () => {
    const { assembleChapterContext } = await import("./chapterContextAssembly");
    const result = await assembleChapterContext({
      novelId: "novel-1",
      bible: makeBible(5),
      chapters: makeChapters(2),
      chapterIndex: 3,
      volumeSummaries: [
        { volume_index: 0, summary: "第一卷回顾：主角觉醒剑魂。" },
        { volume_index: 1, summary: "第二卷回顾：主角进入剑冢。" },
      ],
    });
    expect(result.context.volumeSummary).toBe("第一卷回顾：主角觉醒剑魂。");
    expect(result.context.priorVolumeSummaries).toBeUndefined();
  });
  it("omits aggregate summaries when rewriting before existing prose", async () => {
    const { assembleChapterContext } = await import("./chapterContextAssembly");
    const result = await assembleChapterContext({ novelId: "n", bible: makeBible(), chapters: makeChapters(5),
      chapterIndex: 3, novelSummary: "后续剧情", volumeSummaries: [{ volume_index: 0, summary: "后续剧情" }], skipRetrieval: true });
    expect(result.context.novelSummary).toBeUndefined();
    expect(result.context.volumeSummary).toBeUndefined();
    expect(result.context.previousSummaries.map(c => c.chapterIndex)).toEqual([1, 2]);
  });
});
