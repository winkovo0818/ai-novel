import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sourceFiles = [
  "page.tsx",
  "_components/ProgressDots.tsx",
  "_components/Step4Generating.tsx",
  "_components/Step5Review.tsx",
];

function readWizardCopy() {
  return sourceFiles
    .map((file) => readFileSync(join(__dirname, file), "utf8"))
    .join("\n");
}

describe("new wizard copy", () => {
  it("uses plain writing-tool language instead of protocol or engine copy", () => {
    const copy = readWizardCopy();

    expect(copy).toContain("确定作品方向");
    expect(copy).toContain("写下灵感");
    expect(copy).toContain("回答关键问题");
    expect(copy).toContain("生成设定和大纲");
    expect(copy).toContain("核对作品设定");

    for (const phrase of [
      "协议",
      "引擎",
      "矩阵",
      "审计",
      "神经连接",
      "数据包",
      "叙事向量",
      "STUDIO CORE",
      "ENGINE",
      "PROTOCOL",
      "MATRIX",
      "AUDIT",
      "CORE ENGINE",
    ]) {
      expect(copy).not.toContain(phrase);
    }
  });
});
