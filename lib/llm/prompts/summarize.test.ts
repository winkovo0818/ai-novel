import { describe, expect, it } from "vitest";

import { buildSummarizePrompt, buildContextRetrievalPrompt } from "./summarize";

describe("buildSummarizePrompt", () => {
  it("emits a system + user message pair", () => {
    const prompt = buildSummarizePrompt(3, "剑魂初醒", "正文内容");
    expect(prompt).toHaveLength(2);
    expect(prompt[0].role).toBe("system");
    expect(prompt[1].role).toBe("user");
  });

  it("anchors the summary length to 300 characters", () => {
    const [system] = buildSummarizePrompt(1, "t", "c");
    expect(system.content).toMatch(/300\s*字/);
  });

  it("preserves chapter index, title, and content in the user message", () => {
    const [, user] = buildSummarizePrompt(7, "剑魂出鞘", "夜雨敲门，沈言执剑");
    expect(user.content).toContain("第7章");
    expect(user.content).toContain("剑魂出鞘");
    expect(user.content).toContain("夜雨敲门，沈言执剑");
  });

  it("instructs the model to emit summary text only", () => {
    const [system] = buildSummarizePrompt(1, "t", "c");
    expect(system.content).toMatch(/只输出摘要文本/);
  });
});

describe("buildContextRetrievalPrompt", () => {
  const summaries = [
    { index: 1, title: "村庄被毁", summary: "主角失去家人" },
    { index: 5, title: "拜师", summary: "主角拜剑魂为师" },
  ];

  it("uses the query as the user message and lists summaries in the system message", () => {
    const prompt = buildContextRetrievalPrompt("主角的师承", summaries);
    expect(prompt).toHaveLength(2);
    expect(prompt[1].content).toBe("<user_query>主角的师承</user_query>");
    expect(prompt[0].content).toContain("第1章《<chapter_title>村庄被毁</chapter_title>》");
    expect(prompt[0].content).toContain("第5章《<chapter_title>拜师</chapter_title>》");
  });

  it("preserves the relative order of provided summaries", () => {
    const [system] = buildContextRetrievalPrompt("q", summaries);
    const idxOne = system.content.indexOf("第1章");
    const idxFive = system.content.indexOf("第5章");
    expect(idxOne).toBeGreaterThanOrEqual(0);
    expect(idxFive).toBeGreaterThan(idxOne);
  });
});
