import { describe, expect, it } from "vitest";

import { buildConsistencyPrompt } from "./consistency";
import type { BibleDraft, NovelProfile } from "../../validation/schemas";

const profile: NovelProfile = {
  genre_main: "web",
  genre_sub: "玄幻",
  audience: "general",
  length: "long",
  tone: "cool",
  pace: "fast",
  pov: "third_limited",
  chapter_word_count: 3000,
  ai_freedom: "mid",
};

const bible = {
  meta: { suggested_title: "x", alternative_titles: [] },
  characters: [
    { role: "protagonist", name: "沈言", age: 16, appearance: "a", personality: "表面懦弱实则冷静", catchphrase: "c", abilities: [], goals: "g", motivation: "m", secrets: [], relations: [] },
    { role: "antagonist", name: "陆衍", age: 30, appearance: "a", personality: "工于心计", catchphrase: "c", abilities: [], goals: "g", motivation: "m", secrets: [], relations: [] },
  ],
  world: {
    setting_summary: "设定",
    factions: [],
    rules: ["剑魂不可强夺", "灵脉每月只能开启一次"],
    geography: [],
  },
  outline: { volume_1: { name: "n", theme: "t", chapter_count_estimate: 10, chapters: [] } },
  first_chapter_beats: [],
} as unknown as BibleDraft;

describe("buildConsistencyPrompt", () => {
  it("emits a system + user message pair", () => {
    const prompt = buildConsistencyPrompt({ bible, profile, chapters: [] });
    expect(prompt).toHaveLength(2);
    expect(prompt[0].role).toBe("system");
    expect(prompt[1].role).toBe("user");
  });

  it("lists the dimensions the editor should check and pins the JSON envelope", () => {
    const [system] = buildConsistencyPrompt({ bible, profile, chapters: [] });
    expect(system.content).toMatch(/角色行为/);
    expect(system.content).toMatch(/世界规则/);
    expect(system.content).toMatch(/时间线/);
    expect(system.content).toContain('"consistent"');
    expect(system.content).toContain('"issues"');
  });

  it("renders character roster and world rules joined by Chinese semicolon", () => {
    const [, user] = buildConsistencyPrompt({ bible, profile, chapters: [] });
    expect(user.content).toContain("沈言（protagonist）");
    expect(user.content).toContain("陆衍（antagonist）");
    expect(user.content).toContain("剑魂不可强夺；灵脉每月只能开启一次");
  });

  it("truncates each chapter excerpt to 600 chars and preserves chapter heading", () => {
    const long = "正".repeat(800);
    const [, user] = buildConsistencyPrompt({
      bible,
      profile,
      chapters: [{ index: 4, title: "断魂", content: long }],
    });
    expect(user.content).toContain("第4章《断魂》：");
    // Expect 600 of "正" in the body, not 800.
    expect(user.content.match(/正/g)?.length).toBe(600);
  });

  it("collapses whitespace runs in chapter content", () => {
    const [, user] = buildConsistencyPrompt({
      bible,
      profile,
      chapters: [{ index: 1, title: "t", content: "夜\n\n\n雨\t\t敲门" }],
    });
    expect(user.content).toContain("夜 雨 敲门");
  });
});
