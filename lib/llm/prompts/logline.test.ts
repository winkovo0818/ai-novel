import { describe, expect, it } from "vitest";

import { buildLoglinePrompt } from "./logline";
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

describe("buildLoglinePrompt", () => {
  it("emits a system + user message pair", () => {
    const prompt = buildLoglinePrompt({ profile });
    expect(prompt).toHaveLength(2);
    expect(prompt[0].role).toBe("system");
    expect(prompt[1].role).toBe("user");
  });

  it("instructs the model to emit JSON only, no markdown", () => {
    const [system] = buildLoglinePrompt({ profile });
    expect(system.content).toMatch(/JSON/);
    expect(system.content).toMatch(/不要\s*Markdown|Markdown/);
  });

  it("interpolates every profile dimension into the user message", () => {
    const [, user] = buildLoglinePrompt({ profile });
    expect(user.content).toContain("web");
    expect(user.content).toContain("玄幻");
    expect(user.content).toContain("general");
    expect(user.content).toContain("long");
    expect(user.content).toContain("cool");
    expect(user.content).toContain("fast");
    expect(user.content).toContain("third_limited");
  });

  it("asks for exactly 5 loglines and shows the JSON shape", () => {
    const [, user] = buildLoglinePrompt({ profile });
    expect(user.content).toMatch(/5\s*条/);
    expect(user.content).toContain('"loglines"');
  });

  it("includes a no-NSFW guardrail", () => {
    const [, user] = buildLoglinePrompt({ profile });
    expect(user.content).toMatch(/色情|裸露|违法/);
  });

  it("anchors recommendations to the user's title and genre inputs", () => {
    const [system, user] = buildLoglinePrompt({
      profile,
      title: "青铜雨巷",
      genreMainLabel: "严肃文学",
      genreSub: "江南市井、代际创伤、现实主义",
    });

    expect(system.content).toContain("严格贴合");
    expect(user.content).toContain("青铜雨巷");
    expect(user.content).toContain("严肃文学");
    expect(user.content).toContain("江南市井、代际创伤、现实主义");
    expect(user.content).toContain("不要擅自改成其他题材");
  });
});
