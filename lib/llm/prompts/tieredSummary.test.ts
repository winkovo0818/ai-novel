import { describe, expect, it } from "vitest";

import { buildVolumeSummaryPrompt, buildNovelSummaryPrompt } from "./tieredSummary";

describe("buildVolumeSummaryPrompt", () => {
  it("emits a system + user message pair", () => {
    const prompt = buildVolumeSummaryPrompt({
      volumeIndex: 1,
      volumeName: "启程",
      chapterSummaries: ["a", "b"],
    });
    expect(prompt).toHaveLength(2);
    expect(prompt[0].role).toBe("system");
    expect(prompt[1].role).toBe("user");
  });

  it("anchors the volume summary to 200-400 字", () => {
    const [system] = buildVolumeSummaryPrompt({
      volumeIndex: 1,
      volumeName: "x",
      chapterSummaries: [],
    });
    expect(system.content).toMatch(/200-400/);
  });

  it("interpolates volume name, index, and per-chapter count", () => {
    const [, user] = buildVolumeSummaryPrompt({
      volumeIndex: 3,
      volumeName: "断魂",
      chapterSummaries: ["x", "y", "z"],
    });
    expect(user.content).toContain("第 3 卷《<volume_name>断魂</volume_name>》共 3 章");
    expect(user.content).toContain("第1章摘要：<chapter_summary>x</chapter_summary>");
    expect(user.content).toContain("第3章摘要：<chapter_summary>z</chapter_summary>");
  });
});

describe("buildNovelSummaryPrompt", () => {
  it("emits a system + user message pair", () => {
    const prompt = buildNovelSummaryPrompt({ volumeSummaries: [] });
    expect(prompt).toHaveLength(2);
    expect(prompt[0].role).toBe("system");
    expect(prompt[1].role).toBe("user");
  });

  it("anchors the novel summary to 150-300 字 and asks for foreshadowing", () => {
    const [system] = buildNovelSummaryPrompt({ volumeSummaries: [] });
    expect(system.content).toMatch(/150-300/);
    expect(system.content).toMatch(/伏笔/);
  });

  it("renders each volume summary with its index and name", () => {
    const [, user] = buildNovelSummaryPrompt({
      volumeSummaries: [
        { volumeIndex: 1, volumeName: "启程", summary: "主角崛起" },
        { volumeIndex: 2, volumeName: "归乡", summary: "回到故里" },
      ],
    });
    expect(user.content).toContain("第 1 卷《<volume_name>启程</volume_name>》：<chapter_summary>主角崛起</chapter_summary>");
    expect(user.content).toContain("第 2 卷《<volume_name>归乡</volume_name>》：<chapter_summary>回到故里</chapter_summary>");
  });
});
