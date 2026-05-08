import { describe, expect, it } from "vitest";
import { applyStateDiff } from "./stateDiffMerge";
import type { BibleDraft, StateDiff } from "./schemas";

const baseBible: BibleDraft = {
  meta: { suggested_title: "测试", alternative_titles: ["A", "B", "C"] },
  characters: [
    { role: "protagonist", name: "主角", age: 20, appearance: "英俊", personality: "勇敢", catchphrase: "冲", abilities: ["剑"], goals: "复仇", motivation: "正义", secrets: ["S1"], relations: [] },
    { role: "mentor", name: "导师", age: 60, appearance: "白发", personality: "睿智", catchphrase: "嗯", abilities: ["法"], goals: "传承", motivation: "守护", secrets: ["S2"], relations: [] },
    { role: "antagonist", name: "反派", age: 30, appearance: "阴冷", personality: "狡猾", catchphrase: "哈", abilities: ["谋"], goals: "统治", motivation: "野心", secrets: ["S3"], relations: [] },
  ],
  world: { setting_summary: "一个世界".repeat(5), factions: [{ name: "A", alignment: "正", role: "守" }, { name: "B", alignment: "邪", role: "攻" }], rules: ["规则1", "规则2"], geography: ["山", "河"] },
  outline: { volume_1: { name: "第一卷", theme: "启程", chapter_count_estimate: 10, chapters: Array.from({ length: 8 }, (_, i) => ({ index: i + 1, title: `第${i + 1}章`, summary: `摘要${i + 1}`.repeat(5) })) } },
  first_chapter_beats: Array.from({ length: 5 }, (_, i) => ({ beat: i + 1, scene: `场景${i + 1}`, purpose: `目的${i + 1}` })),
};

describe("applyStateDiff", () => {
  it("creates story_state from scratch when none exists", () => {
    const diff: StateDiff = {
      character_updates: [{ name: "主角", changes: { current_location: "城镇" }, confidence: "high" }],
      timeline_events: [{ event: "到达城镇", impact: "遇到新角色" }],
      plot_thread_updates: [{ title: "复仇之路", status: "progressing", notes: "开始调查" }],
      new_entities: [],
    };

    const next = applyStateDiff(baseBible, diff, 3);

    expect(next.story_state).toBeDefined();
    expect(next.story_state!.characters).toHaveLength(1);
    expect(next.story_state!.characters![0].current_location).toBe("城镇");
    expect(next.story_state!.timeline).toHaveLength(1);
    expect(next.story_state!.timeline![0].chapter_index).toBe(3);
    expect(next.story_state!.plot_threads).toHaveLength(1);
    expect(next.story_state!.plot_threads![0].status).toBe("progressing");
  });

  it("merges into existing story_state without losing prior data", () => {
    const bible: BibleDraft = {
      ...baseBible,
      story_state: {
        characters: [{ name: "主角", current_location: "村庄", emotional_state: "愤怒" }],
        timeline: [{ chapter_index: 1, event: "村庄被毁" }],
        plot_threads: [{ id: "t1", title: "复仇之路", status: "open", introduced_in: 1 }],
      },
    };

    const diff: StateDiff = {
      character_updates: [
        { name: "主角", changes: { current_location: "城镇", current_goal: "寻找真相" }, confidence: "high" },
        { name: "导师", changes: { emotional_state: "担忧" }, confidence: "medium" },
      ],
      timeline_events: [{ event: "到达城镇" }],
      plot_thread_updates: [{ title: "复仇之路", status: "progressing" }],
      new_entities: [],
    };

    const next = applyStateDiff(bible, diff, 2);

    const protagonist = next.story_state!.characters!.find((c) => c.name === "主角");
    expect(protagonist!.current_location).toBe("城镇");
    expect(protagonist!.emotional_state).toBe("愤怒"); // preserved
    expect(protagonist!.current_goal).toBe("寻找真相"); // added

    expect(next.story_state!.timeline).toHaveLength(2);

    const thread = next.story_state!.plot_threads!.find((t) => t.title === "复仇之路");
    expect(thread!.status).toBe("progressing");
    expect(thread!.introduced_in).toBe(1); // preserved
  });

  it("leaves bible unchanged when diff is empty", () => {
    const diff: StateDiff = {
      character_updates: [],
      timeline_events: [],
      plot_thread_updates: [],
      new_entities: [],
    };

    const next = applyStateDiff(baseBible, diff, 1);
    expect(next.story_state).toBeUndefined();
  });
});
