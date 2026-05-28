import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sourceFiles = [
  "../models/page.tsx",
  "../models/embeddings/page.tsx",
  "../admin/ai-calls/page.tsx",
];

function readAdminCopy() {
  return sourceFiles
    .map((file) => readFileSync(join(__dirname, file), "utf8"))
    .join("\n");
}

describe("admin and model configuration copy", () => {
  it("uses configuration and monitoring language", () => {
    const copy = readAdminCopy();

    expect(copy).toContain("Chat 模型配置");
    expect(copy).toContain("新增模型配置");
    expect(copy).toContain("保存新配置");
    expect(copy).toContain("查看系统级模型调用、Token 用量、耗时和成本。");

    for (const phrase of [
      "AI 创作节点",
      "初始化新节点协议",
      "配置协议异常",
      "智能协同创作",
      "修改协议",
      "确认部署新节点",
    ]) {
      expect(copy).not.toContain(phrase);
    }
  });
});
