import { describe, expect, it } from "vitest";

import { buildCriticPrompt } from "./critic";
import type { BibleDraft, StoryStateV1 } from "../../validation/schemas";
import type { ChapterContext } from "../../agent/chapterContext";

const bible: BibleDraft = {
  meta: { suggested_title: "逆魂纪", alternative_titles: ["剑魂歌"] },
  characters: [
    {
      role: "protagonist",
      name: "沈言",
      age: 16,
      appearance: "平头讷讨",
      personality: "表面懦弱实则冷静",
      catchphrase: "我没有",
      abilities: ["琉璃体质"],
      goals: "活下去并查清旧案",
      motivation: "亲眼看到父母被灭口",
      secrets: [],
      relations: [],
    },
  ],
  world: {
    setting_summary: "九州碎裂",
    factions: [],
    rules: ["剑魂认主不可逆", "弟子三年不出师即逐出"],
    geography: [],
  },
  outline: { volume_1: { name: "n", theme: "t", chapter_count_estimate: 10, chapters: [] } },
  first_chapter_beats: [],
};

const baseContext: ChapterContext = {
  bible,
  outline: { chapterIndex: 3, title: "断魂" },
  previousSummaries: [
    { chapterIndex: 1, title: "起", summary: "主角被扣押" },
    { chapterIndex: 2, title: "怒", summary: "主角觉醒剑魂" },
  ],
  retrievedMemories: [],
  retrievalStatus: "empty",
};

describe("buildCriticPrompt", () => {
  it("emits a system + user message pair", () => {
    const prompt = buildCriticPrompt({ context: baseContext, chapterContent: "正文", chapterIndex: 3 });
    expect(prompt).toHaveLength(2);
    expect(prompt[0].role).toBe("system");
    expect(prompt[1].role).toBe("user");
  });

  it("declares the five check dimensions and three severity levels", () => {
    const [system] = buildCriticPrompt({ context: baseContext, chapterContent: "x", chapterIndex: 1 });
    for (const dim of ["角色行为", "世界规则", "线索推进", "时间线", "基调"]) {
      expect(system.content).toContain(dim);
    }
    for (const sev of ["critical", "major", "minor"]) {
      expect(system.content).toContain(sev);
    }
  });

  it("renders bible meta, protagonist, world rules, and prior summaries", () => {
    const [, user] = buildCriticPrompt({ context: baseContext, chapterContent: "本章", chapterIndex: 3 });
    expect(user.content).toContain("逆魂纪");
    expect(user.content).toContain("沈言");
    expect(user.content).toContain("剑魂认主不可逆");
    expect(user.content).toContain("主角被扣押");
    expect(user.content).toContain("第 3 章");
  });

  it("falls back to a placeholder when no prior summaries exist", () => {
    const [, user] = buildCriticPrompt({
      context: { ...baseContext, previousSummaries: [] },
      chapterContent: "x",
      chapterIndex: 1,
    });
    expect(user.content).toContain("（无）");
  });

  it("truncates chapter content to 4000 characters", () => {
    const long = "字".repeat(5000);
    const [, user] = buildCriticPrompt({ context: baseContext, chapterContent: long, chapterIndex: 1 });
    expect(user.content.match(/字/g)?.length).toBe(4000);
  });

  it("renders the runtime state section when storyState is present", () => {
    const storyState: StoryStateV1 = {
      characters: [
        { name: "沈言", current_location: "雨宗", current_goal: "逃出柴饦门", emotional_state: "戒备" },
      ],
      timeline: [],
      plot_threads: [
        { id: "t1", title: "灭门旧案", status: "open" },
      ],
    };
    const [, user] = buildCriticPrompt({
      context: { ...baseContext, storyState },
      chapterContent: "x",
      chapterIndex: 1,
    });
    expect(user.content).toContain("当前运行时状态");
    expect(user.content).toContain("<character_name>沈言</character_name>：位置：<story_state>雨宗</story_state>");
    expect(user.content).toContain("目标：<story_state>逃出柴饦门</story_state>");
    expect(user.content).toContain("情绪：<story_state>戒备</story_state>");
    expect(user.content).toContain("线索「<plot_thread>灭门旧案</plot_thread>」状态：open");
  });

  it("omits the runtime state section when storyState is absent", () => {
    const [, user] = buildCriticPrompt({ context: baseContext, chapterContent: "x", chapterIndex: 1 });
    expect(user.content).not.toContain("当前运行时状态");
  });
});
