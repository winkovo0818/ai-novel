import { beforeEach, describe, expect, it, vi } from "vitest";

const findUniqueNovel = vi.fn();
const upsertVolumeSummary = vi.fn();
const findManyVolumeSummary = vi.fn();
const upsertNovelSummary = vi.fn();
const chatCompletionWithRetry = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    novel: { findUnique: findUniqueNovel },
    volumeSummary: { upsert: upsertVolumeSummary, findMany: findManyVolumeSummary },
    novelSummary: { upsert: upsertNovelSummary },
  },
}));

vi.mock("@/lib/llm/client", () => ({
  chatCompletionWithRetry,
}));

import type { BibleDraft } from "@/lib/validation/schemas";

const bible: BibleDraft = {
  meta: { suggested_title: "测试", alternative_titles: ["标题甲", "标题乙", "标题丙"] },
  characters: [
    { role: "protagonist", name: "主角", age: 20, appearance: "英俊", personality: "勇敢", catchphrase: "冲", abilities: ["剑"], goals: "复仇", motivation: "正义", secrets: ["S1"], relations: [] },
    { role: "mentor", name: "导师", age: 60, appearance: "白发", personality: "睿智", catchphrase: "嗯", abilities: ["法"], goals: "传承", motivation: "守护", secrets: ["S2"], relations: [] },
    { role: "antagonist", name: "反派", age: 30, appearance: "阴冷", personality: "狡猾", catchphrase: "哈", abilities: ["谋"], goals: "统治", motivation: "野心", secrets: ["S3"], relations: [] },
  ],
  world: {
    setting_summary: "这是一个长篇玄幻世界的设定描述文本内容用于满足 schema 校验的最小长度要求",
    factions: [
      { name: "A", alignment: "正", role: "守" },
      { name: "B", alignment: "邪", role: "攻" },
    ],
    rules: ["规则1", "规则2"],
    geography: ["山", "河"],
  },
  outline: {
    volume_1: {
      name: "第一卷",
      theme: "启程",
      chapter_count_estimate: 10,
      chapters: Array.from({ length: 8 }, (_, i) => ({
        index: i + 1,
        title: `第${i + 1}章`,
        // ChapterSchema requires summary length 20-120; pad to satisfy.
        summary: `第${i + 1}章 — 此章节用于测试时通过 schema 校验的占位摘要描述。`,
      })),
    },
  },
  first_chapter_beats: Array.from({ length: 5 }, (_, i) => ({
    beat: i + 1,
    scene: `场景${i + 1}`,
    purpose: `目的${i + 1}`,
  })),
};

function novel(overrides: Partial<{
  chapters: Array<{ chapter_index: number; summary: { summary: string } | null }>;
  volume_summaries: Array<{ volume_index: number; covered_chapters: string[]; summary: string }>;
  novel_summary: { summary: string } | null;
}> = {}) {
  return {
    id: "n-1",
    bible: { content: bible },
    chapters: [],
    volume_summaries: [],
    novel_summary: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  chatCompletionWithRetry.mockResolvedValue({ content: "  生成的摘要正文  " });
});

describe("refreshSummaries — guards", () => {
  it("throws when the novel does not exist", async () => {
    findUniqueNovel.mockResolvedValue(null);
    const { refreshSummaries } = await import("./summaries");
    await expect(refreshSummaries("missing")).rejects.toThrow(/Novel or Bible not found/);
    expect(chatCompletionWithRetry).not.toHaveBeenCalled();
  });

  it("throws when the novel has no Bible attached", async () => {
    findUniqueNovel.mockResolvedValue({ ...novel(), bible: null });
    const { refreshSummaries } = await import("./summaries");
    await expect(refreshSummaries("n-1")).rejects.toThrow(/Novel or Bible not found/);
  });

  it("throws when the persisted Bible fails schema validation", async () => {
    findUniqueNovel.mockResolvedValue({
      ...novel(),
      bible: { content: { not: "a real bible" } },
    });
    const { refreshSummaries } = await import("./summaries");
    await expect(refreshSummaries("n-1")).rejects.toThrow(/Invalid Bible/);
  });
});

describe("refreshSummaries — volume summaries", () => {
  it("creates a volume summary when none exists for chapters that have summaries", async () => {
    findUniqueNovel.mockResolvedValue(
      novel({
        chapters: [
          { chapter_index: 1, summary: { summary: "第一章摘要" } },
          { chapter_index: 2, summary: { summary: "第二章摘要" } },
        ],
        volume_summaries: [],
      }),
    );
    findManyVolumeSummary.mockResolvedValue([
      { volume_index: 0, summary: "卷摘要" },
    ]);

    const { refreshSummaries } = await import("./summaries");
    const result = await refreshSummaries("n-1");

    expect(upsertVolumeSummary).toHaveBeenCalledTimes(1);
    expect(upsertVolumeSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { novel_id_volume_index: { novel_id: "n-1", volume_index: 0 } },
        create: expect.objectContaining({
          summary: "生成的摘要正文",
          covered_chapters: ["1", "2"],
        }),
      }),
    );
    expect(result.refreshedVolumes).toEqual([0]);
    expect(result.novelSummaryUpdated).toBe(true);
  });

  it("skips a volume whose covered_chapters already match the current set", async () => {
    findUniqueNovel.mockResolvedValue(
      novel({
        chapters: [
          { chapter_index: 1, summary: { summary: "第一章摘要" } },
          { chapter_index: 2, summary: { summary: "第二章摘要" } },
        ],
        volume_summaries: [
          { volume_index: 0, covered_chapters: ["1", "2"], summary: "旧" },
        ],
        novel_summary: { summary: "已有全书摘要" },
      }),
    );

    const { refreshSummaries } = await import("./summaries");
    const result = await refreshSummaries("n-1");

    expect(upsertVolumeSummary).not.toHaveBeenCalled();
    expect(upsertNovelSummary).not.toHaveBeenCalled();
    expect(result.refreshedVolumes).toEqual([]);
    // novel_summary already exists and no volume changed → no rewrite signal.
    expect(result.novelSummaryUpdated).toBe(false);
  });

  it("re-runs a volume summary when chapter coverage has grown", async () => {
    findUniqueNovel.mockResolvedValue(
      novel({
        chapters: [
          { chapter_index: 1, summary: { summary: "1" } },
          { chapter_index: 2, summary: { summary: "2" } },
          { chapter_index: 3, summary: { summary: "3" } },
        ],
        volume_summaries: [
          // Old summary only covered chapter 1; chapter 2/3 are new.
          { volume_index: 0, covered_chapters: ["1"], summary: "旧" },
        ],
      }),
    );
    findManyVolumeSummary.mockResolvedValue([
      { volume_index: 0, summary: "新卷摘要" },
    ]);

    const { refreshSummaries } = await import("./summaries");
    const result = await refreshSummaries("n-1");

    expect(upsertVolumeSummary).toHaveBeenCalledTimes(1);
    const call = upsertVolumeSummary.mock.calls[0][0];
    expect(call.update.covered_chapters).toEqual(["1", "2", "3"]);
    expect(result.refreshedVolumes).toEqual([0]);
  });

  it("skips entirely when no chapter has a summary (nothing to summarize)", async () => {
    findUniqueNovel.mockResolvedValue(
      novel({
        chapters: [
          { chapter_index: 1, summary: null },
          { chapter_index: 2, summary: null },
        ],
      }),
    );
    findManyVolumeSummary.mockResolvedValue([]);

    const { refreshSummaries } = await import("./summaries");
    const result = await refreshSummaries("n-1");

    expect(upsertVolumeSummary).not.toHaveBeenCalled();
    expect(upsertNovelSummary).not.toHaveBeenCalled();
    expect(result.refreshedVolumes).toEqual([]);
  });
});

describe("refreshSummaries — novel summary", () => {
  it("regenerates the novel summary whenever a volume was refreshed", async () => {
    findUniqueNovel.mockResolvedValue(
      novel({
        chapters: [
          { chapter_index: 1, summary: { summary: "1" } },
        ],
      }),
    );
    findManyVolumeSummary.mockResolvedValue([
      { volume_index: 0, summary: "卷 1 摘要" },
    ]);

    const { refreshSummaries } = await import("./summaries");
    await refreshSummaries("n-1");

    expect(upsertNovelSummary).toHaveBeenCalledTimes(1);
    expect(upsertNovelSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { novel_id: "n-1" },
        create: expect.objectContaining({ novel_id: "n-1", summary: "生成的摘要正文" }),
      }),
    );
  });

  it("creates the novel summary the first time even if no volume changed this run", async () => {
    // Volume coverage matches existing row, so no volume work — but novel_summary
    // is missing, which is the case the second branch protects.
    findUniqueNovel.mockResolvedValue(
      novel({
        chapters: [{ chapter_index: 1, summary: { summary: "1" } }],
        volume_summaries: [
          { volume_index: 0, covered_chapters: ["1"], summary: "已有卷" },
        ],
        novel_summary: null,
      }),
    );
    findManyVolumeSummary.mockResolvedValue([
      { volume_index: 0, summary: "已有卷" },
    ]);

    const { refreshSummaries } = await import("./summaries");
    const result = await refreshSummaries("n-1");

    expect(upsertVolumeSummary).not.toHaveBeenCalled();
    expect(upsertNovelSummary).toHaveBeenCalledTimes(1);
    expect(result.novelSummaryUpdated).toBe(true);
  });

  it("does not call the novel-summary LLM when there are zero volume summaries to feed it", async () => {
    findUniqueNovel.mockResolvedValue(
      novel({
        // No chapter summary anywhere — nothing to roll up to volumes, nothing
        // for the novel summary either. Avoid wasting an LLM call on empty input.
        chapters: [],
        novel_summary: null,
      }),
    );
    findManyVolumeSummary.mockResolvedValue([]);

    const { refreshSummaries } = await import("./summaries");
    await refreshSummaries("n-1");

    expect(upsertNovelSummary).not.toHaveBeenCalled();
    // Only the volume LLM might have been called — but there's no chapter
    // summary, so it shouldn't fire either.
    expect(chatCompletionWithRetry).not.toHaveBeenCalled();
  });
});
