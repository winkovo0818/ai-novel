import { describe, expect, it } from "vitest";
import { buildStoryTimeline } from "./timeline";
import type { BibleDraft } from "@/lib/validation/schemas";

function bible(): BibleDraft {
  return {
    meta: {
      suggested_title: "星河纪",
      alternative_titles: ["星河录", "远航记", "归途书"],
    },
    characters: [
      character("protagonist", "林舟"),
      character("sidekick", "许岚"),
      character("antagonist", "黑塔"),
    ],
    world: {
      setting_summary: "人类在星际移民后重新发现旧地球遗迹，各方势力围绕失落航道展开竞争。",
      factions: [
        { name: "远航会", alignment: "秩序", role: "探索旧航道" },
        { name: "黑塔", alignment: "混乱", role: "封锁遗迹" },
      ],
      rules: ["跃迁需要灯塔校准", "遗迹会记录记忆"],
      geography: ["近地环带", "深空灯塔"],
    },
    outline: {
      volume_1: {
        name: "远航卷",
        theme: "离开故土之后重新理解故土",
        chapter_count_estimate: 8,
        chapters: Array.from({ length: 8 }, (_, index) => ({
          index: index + 1,
          title: `第${index + 1}章`,
          summary: `这是第${index + 1}章的剧情摘要，长度足够用于测试页面渲染和统计。`,
        })),
      },
    },
    first_chapter_beats: Array.from({ length: 5 }, (_, index) => ({
      beat: index + 1,
      scene: `场景${index + 1}`,
      purpose: `推动主角发现线索${index + 1}`,
    })),
    story_state: {
      timeline: [{ chapter_index: 2, event: "林舟离开灯塔港", impact: "主线旅程开启" }],
      plot_threads: [
        { id: "old-route", title: "旧航线", status: "progressing", introduced_in: 2, notes: "黑塔也在寻找" },
        { id: "lost-key", title: "失落钥匙", status: "open" },
      ],
      foreshadowing: [
        { id: "signal", clue: "反复出现的空白信号", status: "planted", introduced_in: 1, payoff_hint: "指向旧地球" },
        { id: "oath", clue: "远航誓言", status: "resolved", introduced_in: 1, resolved_in: 3 },
      ],
      relationships: [{ from: "林舟", to: "许岚", status: "开始信任", updated_in: 2 }],
    },
  };
}

function character(role: "protagonist" | "sidekick" | "antagonist", name: string) {
  return {
    role,
    name,
    age: 28,
    appearance: "黑发灰眼，穿旧式航行服",
    personality: "谨慎但愿意冒险",
    catchphrase: "灯塔还亮着",
    abilities: ["导航"],
    goals: "找到失落航道",
    motivation: "证明故乡仍有未来",
    secrets: ["曾经见过遗迹核心"],
    relations: [],
  };
}

describe("buildStoryTimeline", () => {
  it("combines outline, drafts, story events, plot threads, clues, and relationships by chapter", () => {
    const report = buildStoryTimeline(bible(), [
      {
        chapter_index: 2,
        title: "第二章 起航",
        content: "林舟推开舱门。\n许岚递来航图。",
        status: "done",
        updated_at: new Date("2026-05-28T10:00:00.000Z"),
      },
    ]);

    expect(report.summary).toEqual({
      plannedChapters: 8,
      draftedChapters: 1,
      storyEvents: 1,
      openThreads: 2,
      unresolvedForeshadowing: 1,
    });
    expect(report.chapters[1]).toMatchObject({
      chapterIndex: 2,
      draftTitle: "第二章 起航",
      draftStatus: "done",
      wordCount: 14,
      updatedAt: "2026-05-28T10:00:00.000Z",
    });
    expect(report.chapters[1].events.map((event) => event.label)).toEqual([
      "大纲",
      "正文完成",
      "事件",
      "线索开启",
      "关系变化",
    ]);
    expect(report.chapters[2].events).toContainEqual(
      expect.objectContaining({
        label: "伏笔回收",
        title: "远航誓言",
      }),
    );
    expect(report.unplaced).toContainEqual(
      expect.objectContaining({
        label: "未定位线索",
        title: "失落钥匙",
      }),
    );
  });
});
