import { describe, expect, it } from "vitest";

import { buildChapterRevisionPrompt } from "./chapterRevision";
import type { ChapterContext } from "@/lib/agent/chapterContext";

const context = {
  bible: {
    meta: { suggested_title: "逆魂纪", alternative_titles: ["逆魂", "魂纪", "纪逆"] },
    characters: [
      {
        role: "protagonist",
        name: "林燃",
        age: 18,
        appearance: "清瘦",
        personality: "冷静",
        catchphrase: "再来一次",
        abilities: ["球场分析"],
        goals: "征服球场",
        motivation: "证明自己",
        secrets: [],
        relations: [],
      },
      { role: "mentor", name: "老王", age: 45, appearance: "严厉", personality: "务实", catchphrase: "跑起来", abilities: ["训练"], goals: "赢球", motivation: "带队", secrets: [], relations: [] },
      { role: "antagonist", name: "赵锐", age: 18, appearance: "高大", personality: "自信", catchphrase: "随便", abilities: ["突破"], goals: "保持王牌地位", motivation: "胜利", secrets: [], relations: [] },
    ],
    world: {
      setting_summary: "校园篮球重生故事，冲突必须可追溯。",
      factions: [{ name: "校队", alignment: "中立", role: "竞技舞台" }, { name: "对手校", alignment: "对立", role: "外部压力" }],
      rules: ["冲突必须可追溯", "系统任务触发需要铺垫"],
      geography: ["球场", "训练室"],
    },
    outline: {
      volume_1: {
        name: "重燃",
        theme: "回到球场",
        chapter_count_estimate: 8,
        chapters: Array.from({ length: 8 }, (_, i) => ({ index: i + 1, title: `第${i + 1}章`, summary: "章节摘要足够长，用于测试修订 prompt。" })),
      },
    },
    first_chapter_beats: Array.from({ length: 5 }, (_, i) => ({ beat: i + 1, scene: `场景${i + 1}`, purpose: `目的${i + 1}` })),
  },
  outline: { chapterIndex: 2, title: "训练室", summary: "林燃接近校队训练。" },
  previousSummaries: [{ chapterIndex: 1, title: "球场边", summary: "林燃在体育课旁观赵锐打球。" }],
  retrievedMemories: [],
  retrievalStatus: "empty",
} satisfies ChapterContext;

describe("buildChapterRevisionPrompt", () => {
  it("anchors revision to critic issues and asks for body only", () => {
    const [system, user] = buildChapterRevisionPrompt({
      context,
      chapterContent: "林燃路过训练室，被叫进去陪练。",
      issues: [
        {
          type: "timeline",
          severity: "major",
          description: "缺少从旁观到主动接近训练室的过渡。",
          suggestion: "增加林燃故意观察校队训练的内心动机。",
        },
      ],
    });

    expect(system.content).toContain("只输出修订后的章节正文");
    expect(system.content).toContain("保留原候选稿中可用的剧情");
    expect(user.content).toContain("缺少从旁观到主动接近训练室的过渡");
    expect(user.content).toContain("增加林燃故意观察校队训练");
    expect(user.content).toContain("林燃路过训练室");
    expect(user.content).toContain("冲突必须可追溯");
  });
});
