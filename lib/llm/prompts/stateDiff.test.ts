import { describe, expect, it } from "vitest";

import { buildStateDiffPrompt } from "./stateDiff";
import type { BibleDraft, StoryStateV1 } from "../../validation/schemas";

const bible: BibleDraft = {
  meta: { suggested_title: "x", alternative_titles: [] },
  characters: [
    {
      role: "protagonist",
      name: "沈言",
      age: 16,
      appearance: "a",
      personality: "冷静",
      catchphrase: "c",
      abilities: [],
      goals: "g",
      motivation: "查清旧案",
      secrets: [],
      relations: [],
    },
    {
      role: "antagonist",
      name: "陆衍",
      age: 30,
      appearance: "a",
      personality: "工于心计",
      catchphrase: "c",
      abilities: [],
      goals: "g",
      motivation: "夺剑魂",
      secrets: [],
      relations: [],
    },
  ],
  world: { setting_summary: "s", factions: [], rules: [], geography: [] },
  outline: { volume_1: { name: "n", theme: "t", chapter_count_estimate: 10, chapters: [] } },
  first_chapter_beats: [],
};

describe("buildStateDiffPrompt", () => {
  it("emits a system + user message pair", () => {
    const prompt = buildStateDiffPrompt({
      bible,
      chapterIndex: 1,
      chapterTitle: "起",
      chapterContent: "正文",
    });
    expect(prompt).toHaveLength(2);
    expect(prompt[0].role).toBe("system");
    expect(prompt[1].role).toBe("user");
  });

  it("declares the four diff buckets and confidence levels in the schema", () => {
    const [system] = buildStateDiffPrompt({
      bible,
      chapterIndex: 1,
      chapterTitle: "x",
      chapterContent: "x",
    });
    for (const bucket of ["character_updates", "timeline_events", "plot_thread_updates", "new_entities"]) {
      expect(system.content).toContain(bucket);
    }
    expect(system.content).toMatch(/low\/medium\/high/);
  });

  it("prioritizes verifiable chapter state changes", () => {
    const [system] = buildStateDiffPrompt({
      bible,
      chapterIndex: 1,
      chapterTitle: "x",
      chapterContent: "x",
    });

    expect(system.content).toContain("可验证状态变化");
    expect(system.content).toContain("新线索、关系变化、位置变化、道具归属、敌人反应");
    expect(system.content).toContain("行动 -> 结果");
    expect(system.content).toContain("纯氛围描写");
  });

  it("renders every character with role, personality, and motivation", () => {
    const [, user] = buildStateDiffPrompt({
      bible,
      chapterIndex: 1,
      chapterTitle: "x",
      chapterContent: "x",
    });
    expect(user.content).toContain("<character_name>沈言</character_name>（protagonist）");
    expect(user.content).toContain("<character_motivation>查清旧案</character_motivation>");
    expect(user.content).toContain("<character_name>陆衍</character_name>（antagonist）");
    expect(user.content).toContain("<character_motivation>夺剑魂</character_motivation>");
  });

  it("falls back to a placeholder when storyState is absent", () => {
    const [, user] = buildStateDiffPrompt({
      bible,
      chapterIndex: 2,
      chapterTitle: "x",
      chapterContent: "x",
    });
    expect(user.content).toContain("（尚无运行时状态记录）");
  });

  it("serializes provided storyState as JSON", () => {
    const storyState: StoryStateV1 = {
      characters: [{ name: "沈言", current_location: "雨宗" }],
      timeline: [],
      plot_threads: [],
    };
    const [, user] = buildStateDiffPrompt({
      bible,
      storyState,
      chapterIndex: 1,
      chapterTitle: "x",
      chapterContent: "x",
    });
    expect(user.content).toContain('"name": "沈言"');
    expect(user.content).toContain('"current_location": "雨宗"');
  });

  it("interpolates chapter index and title and caps content at 6000 chars", () => {
    const long = "字".repeat(7000);
    const [, user] = buildStateDiffPrompt({
      bible,
      chapterIndex: 12,
      chapterTitle: "断魂",
      chapterContent: long,
    });
    expect(user.content).toContain("第 12 章《<chapter_title>断魂</chapter_title>》");
    expect(user.content.match(/字/g)?.length).toBe(6000);
  });
});
