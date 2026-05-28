import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readActivitySource() {
  return readFileSync(join(__dirname, "page.tsx"), "utf8");
}

describe("activity page copy", () => {
  it("presents user-owned usage instead of admin-only logs", () => {
    const source = readActivitySource();

    expect(source).toContain("我的 AI 用量");
    expect(source).toContain("查看本月调用、token、费用趋势和失败情况。");
    expect(source).toContain("仅显示当前账号的最近 120 条记录。");
    expect(source).toContain("/api/usage?limit=120");
    expect(source).not.toContain("该模块仅对管理员开放");
    expect(source).not.toContain("/api/llm-usage");
  });
});
