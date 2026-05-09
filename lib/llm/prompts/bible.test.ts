import { describe, expect, it } from "vitest";

import { buildBiblePrompt } from "./bible";
import type { NovelProfile } from "../../validation/schemas";

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

describe("buildBiblePrompt", () => {
  it("emits a system + user message pair", () => {
    const prompt = buildBiblePrompt({ logline: "x", profile });
    expect(prompt).toHaveLength(2);
    expect(prompt[0].role).toBe("system");
    expect(prompt[1].role).toBe("user");
  });

  it("encodes the schema, hard rules, and chapter-count constraint", () => {
    const [system] = buildBiblePrompt({ logline: "x", profile });
    expect(system.content).toContain("characters");
    expect(system.content).toContain("first_chapter_beats");
    expect(system.content).toMatch(/严格\s*8-12/);
    expect(system.content).toMatch(/硬规则/);
  });

  it("interpolates the chapter_word_count target into the system message", () => {
    const [system] = buildBiblePrompt({ logline: "x", profile });
    expect(system.content).toContain("3000 字");
  });

  it("includes the logline verbatim and lists every profile dimension", () => {
    const [, user] = buildBiblePrompt({ logline: "少年觉醒剑魂", profile });
    expect(user.content).toContain("少年觉醒剑魂");
    expect(user.content).toContain("web - 玄幻");
    expect(user.content).toContain("third_limited");
    expect(user.content).toMatch(/AI 自由度：mid/);
  });

  it("falls back to a placeholder when answers are absent", () => {
    const [, user] = buildBiblePrompt({ logline: "x", profile });
    expect(user.content).toContain("用户未提供反向追问答案");
  });

  it("renders provided answers, joining array values", () => {
    const [, user] = buildBiblePrompt({
      logline: "x",
      profile,
      answers: {
        protagonist_personality: "冷静隐忍",
        cool_points: ["反差萌", "扮猪吃老虎"],
      },
    });
    expect(user.content).toContain("protagonist_personality: 冷静隐忍");
    expect(user.content).toContain("cool_points: 反差萌 / 扮猪吃老虎");
  });

  it("forbids markdown fences and inline comments", () => {
    const [system] = buildBiblePrompt({ logline: "x", profile });
    expect(system.content).toMatch(/禁止.*Markdown|Markdown/);
    expect(system.content).toMatch(/\/\/ 注释/);
  });
});
