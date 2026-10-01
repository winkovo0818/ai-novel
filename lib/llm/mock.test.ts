import { describe, expect, it } from "vitest";
import { mockChatCompletion } from "./mock";
const request = (content: string) => mockChatCompletion({ route: "/agent/plan_outline", agent: "outline_planner", messages: [{ role: "system", content }] });
describe("outline mock", () => {
  it("returns every requested chapter beyond the old cap", async () => {
    const result = await request("必须覆盖第 1001 到第 1020 章");
    const chapters = JSON.parse(result.content).chapters;
    expect(chapters).toHaveLength(20); expect(chapters[0].index).toBe(1001); expect(chapters.at(-1).index).toBe(1020);
  });
  it.each(["没有指定范围", "必须覆盖第 1 到第 30 章", "必须覆盖第 3 到第 1 章"])("rejects malformed planning range %s", async content => {
    await expect(request(content)).rejects.toThrow();
  });
});
