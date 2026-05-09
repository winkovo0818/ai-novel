import { describe, expect, it } from "vitest";

import { buildQuestionsPrompt } from "./questions";
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

describe("buildQuestionsPrompt", () => {
  it("emits a system + user message pair", () => {
    const prompt = buildQuestionsPrompt({ logline: "少年觉醒剑魂", profile });
    expect(prompt).toHaveLength(2);
    expect(prompt[0].role).toBe("system");
    expect(prompt[1].role).toBe("user");
  });

  it("includes the user-provided logline verbatim", () => {
    const [, user] = buildQuestionsPrompt({ logline: "少年觉醒剑魂", profile });
    expect(user.content).toContain("少年觉醒剑魂");
  });

  it("interpolates every profile dimension", () => {
    const [, user] = buildQuestionsPrompt({ logline: "x", profile });
    expect(user.content).toContain("web");
    expect(user.content).toContain("玄幻");
    expect(user.content).toContain("third_limited");
    expect(user.content).toContain("fast");
  });

  it("constrains options to exactly 4 and recommended_index range", () => {
    const [, user] = buildQuestionsPrompt({ logline: "x", profile });
    expect(user.content).toMatch(/options.*正好\s*4/);
    expect(user.content).toMatch(/recommended_index.*0-3/);
  });

  it("requires snake_case keys and limits type to single|multi", () => {
    const [, user] = buildQuestionsPrompt({ logline: "x", profile });
    expect(user.content).toMatch(/snake_case/);
    expect(user.content).toMatch(/single\s*或\s*multi/);
  });

  it("requests 3-5 questions and shows the JSON shape", () => {
    const [, user] = buildQuestionsPrompt({ logline: "x", profile });
    expect(user.content).toMatch(/3-5/);
    expect(user.content).toContain('"questions"');
  });
});
