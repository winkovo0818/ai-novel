import { describe, expect, it } from "vitest";
import { buildBeatSheetPrompt } from "./beatSheet";
import type { BibleDraft } from "../../validation/schemas";

const bible: BibleDraft = {
  meta: { suggested_title: "测试小说", alternative_titles: ["A", "B", "C"] },
  characters: [
    { role: "protagonist", name: "主角", age: 20, appearance: "英俊", personality: "勇敢", catchphrase: "冲", abilities: ["剑"], goals: "复仇", motivation: "正义", secrets: ["秘密"], relations: [] },
  ],
  world: { setting_summary: "一个世界".repeat(5), factions: [{ name: "门派", alignment: "正", role: "守" }], rules: ["规则1"], geography: ["山"] },
  outline: { volume_1: { name: "第一卷", theme: "启程", chapter_count_estimate: 10, chapters: Array.from({ length: 8 }, (_, i) => ({ index: i + 1, title: `第${i + 1}章`, summary: `摘要${i + 1}`.repeat(5) })) } },
  first_chapter_beats: [],
};

describe("buildBeatSheetPrompt", () => {
  it("includes chapter title and protagonist", () => {
    const messages = buildBeatSheetPrompt({
      bible,
      chapterIndex: 3,
      chapterTitle: "暗夜追踪",
    });

    const userContent = messages[1]?.content ?? "";
    expect(userContent).toContain("第 3 章");
    expect(userContent).toContain("暗夜追踪");
    expect(userContent).toContain("主角");
  });

  it("includes previous chapter summary when provided", () => {
    const messages = buildBeatSheetPrompt({
      bible,
      chapterIndex: 3,
      chapterTitle: "暗夜追踪",
      previousChapterSummary: "上一章主角遇到了敌人",
    });

    const userContent = messages[1]?.content ?? "";
    expect(userContent).toContain("上一章摘要");
    expect(userContent).toContain("主角遇到了敌人");
  });

  it("includes chapter goal when provided", () => {
    const messages = buildBeatSheetPrompt({
      bible,
      chapterIndex: 3,
      chapterTitle: "暗夜追踪",
      chapterGoal: "揭示真相",
    });

    const userContent = messages[1]?.content ?? "";
    expect(userContent).toContain("本章目标");
    expect(userContent).toContain("揭示真相");
  });

  it("includes story state when provided", () => {
    const messages = buildBeatSheetPrompt({
      bible,
      chapterIndex: 3,
      chapterTitle: "暗夜追踪",
      storyState: {
        characters: [{ name: "主角", current_location: "城镇", emotional_state: "愤怒" }],
        plot_threads: [{ id: "t1", title: "复仇", status: "open" }],
      },
    });

    const userContent = messages[1]?.content ?? "";
    expect(userContent).toContain("角色状态");
    expect(userContent).toContain("城镇");
  });
});