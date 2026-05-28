import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readHomeAndReadme() {
  return [
    readFileSync(join(__dirname, "page.tsx"), "utf8"),
    readFileSync(join(__dirname, "../README.md"), "utf8"),
  ].join("\n");
}

describe("home page and README positioning", () => {
  it("positions the product as a writing workspace entry", () => {
    const copy = readHomeAndReadme();

    expect(copy).toContain("AI Novel 写作工作台");
    expect(copy).toContain("面向长篇小说写作的 AI 辅助工作台");
    expect(copy).toContain("作品设定");
    expect(copy).toContain("下一步建议");
    expect(copy).toContain("工作台预览");

    for (const phrase of [
      "下一代 AI 叙事引擎",
      "探索核心协议",
      "文学帝国",
      "AI 协同文学创作基础设施",
      "智能起草协议",
      "叙事向量",
      "叙事圣经",
      "圣经合成",
      "智能下一步",
    ]) {
      expect(copy).not.toContain(phrase);
    }
  });
});
