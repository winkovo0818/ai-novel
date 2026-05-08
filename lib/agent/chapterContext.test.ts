import { describe, expect, it } from "vitest";
import { buildChapterContext } from "./chapterContext";
import type { ChapterDraftView } from "./chapterContext";
import type { BibleDraft } from "@/lib/validation/schemas";

const bible: BibleDraft = {
  meta: { suggested_title: "测试", alternative_titles: ["A", "B", "C"] },
  characters: [
    { role: "protagonist", name: "主角", age: 20, appearance: "英俊", personality: "勇敢", catchphrase: "冲", abilities: ["剑"], goals: "复仇", motivation: "正义", secrets: ["S1"], relations: [] },
    { role: "mentor", name: "导师", age: 60, appearance: "白发", personality: "睿智", catchphrase: "嗯", abilities: ["法"], goals: "传承", motivation: "守护", secrets: ["S2"], relations: [] },
    { role: "antagonist", name: "反派", age: 30, appearance: "阴冷", personality: "狡猾", catchphrase: "哈", abilities: ["谋"], goals: "统治", motivation: "野心", secrets: ["S3"], relations: [] },
  ],
  world: { setting_summary: "一个世界".repeat(5), factions: [{ name: "A", alignment: "正", role: "守" }, { name: "B", alignment: "邪", role: "攻" }], rules: ["规则1", "规则2"], geography: ["山", "河"] },
  outline: { volume_1: { name: "第一卷", theme: "启程", chapter_count_estimate: 10, chapters: Array.from({ length: 8 }, (_, i) => ({ index: i + 1, title: `第${i + 1}章`, summary: `摘要${i + 1}`.repeat(5) })) } },
  first_chapter_beats: Array.from({ length: 5 }, (_, i) => ({ beat: i + 1, scene: `场景${i + 1}`, purpose: `目的${i + 1}` })),
};

function makeChapter(index: number, overrides: Partial<ChapterDraftView & { summary?: { summary: string } | null }> = {}) {
  return {
    id: `ch-${index}`,
    chapter_index: index,
    title: `第${index}章`,
    content: `第${index}章正文内容。`.repeat(20),
    status: "done",
    ...overrides,
  };
}

describe("buildChapterContext", () => {
  it("builds context with no previous chapters", () => {
    const context = buildChapterContext(bible, [], 1);
    expect(context.outline.chapterIndex).toBe(1);
    expect(context.previousSummaries).toHaveLength(0);
    expect(context.retrievedMemories).toHaveLength(0);
  });

  it("uses summary when available", () => {
    const chapters = [
      makeChapter(1, { summary: { summary: "第一章摘要" } }),
    ];
    const context = buildChapterContext(bible, chapters, 2);
    expect(context.previousSummaries).toHaveLength(1);
    expect(context.previousSummaries[0].summary).toContain("第一章摘要");
  });

  it("falls back to excerpt when no summary", () => {
    const chapters = [
      makeChapter(1, { summary: null }),
    ];
    const context = buildChapterContext(bible, chapters, 2);
    expect(context.previousSummaries).toHaveLength(1);
    expect(context.previousSummaries[0].summary).toContain("第1章正文内容");
  });

  it("only includes chapters before target index", () => {
    const chapters = [
      makeChapter(1),
      makeChapter(2),
      makeChapter(3),
    ];
    const context = buildChapterContext(bible, chapters, 3);
    expect(context.previousSummaries).toHaveLength(2);
    expect(context.previousSummaries[0].chapterIndex).toBe(1);
    expect(context.previousSummaries[1].chapterIndex).toBe(2);
  });

  it("skips empty chapters", () => {
    const chapters = [
      makeChapter(1, { content: "   " }),
      makeChapter(2, { content: "有内容" }),
    ];
    const context = buildChapterContext(bible, chapters, 3);
    expect(context.previousSummaries).toHaveLength(1);
    expect(context.previousSummaries[0].chapterIndex).toBe(2);
  });

  it("passes through story_state from bible", () => {
    const bibleWithState = {
      ...bible,
      story_state: {
        characters: [{ name: "主角", current_location: "城镇" }],
      },
    };
    const context = buildChapterContext(bibleWithState, [], 1);
    expect(context.storyState).toBeDefined();
    expect(context.storyState!.characters).toHaveLength(1);
  });

  it("caps previous summaries to 5 most recent", () => {
    const chapters = Array.from({ length: 10 }, (_, i) =>
      makeChapter(i + 1, { summary: { summary: `摘要${i + 1}` } }),
    );
    const context = buildChapterContext(bible, chapters, 11);
    expect(context.previousSummaries).toHaveLength(5);
    expect(context.previousSummaries[0].chapterIndex).toBe(6);
    expect(context.previousSummaries[4].chapterIndex).toBe(10);
  });

  it("passes novel and volume summaries when provided", () => {
    const context = buildChapterContext(bible, [], 1, {
      novelSummary: "全书梗概",
      volumeSummary: "卷摘要",
    });
    expect(context.novelSummary).toBe("全书梗概");
    expect(context.volumeSummary).toBe("卷摘要");
  });
});
