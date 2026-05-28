import { describe, expect, it } from "vitest";
import {
  applyStateDiff,
  createStateDiffSelection,
  detectStateDiffConflicts,
  filterStateDiff,
} from "./stateDiffMerge";
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

  it("accepts array-valued character changes such as known secrets", () => {
    const diff: StateDiff = {
      character_updates: [
        {
          name: "主角",
          changes: { known_secrets: ["体内封着上古剑魂", "几认识父亲"] },
          confidence: "high",
        },
      ],
      timeline_events: [],
      plot_thread_updates: [],
      new_entities: [],
    };

    const next = applyStateDiff(baseBible, diff, 2);

    expect(next.story_state?.characters?.[0].known_secrets).toEqual([
      "体内封着上古剑魂",
      "几认识父亲",
    ]);
  });

  it("normalizes string-valued known secrets from real StateDiff output", () => {
    const diff: StateDiff = {
      character_updates: [
        {
          name: "主角",
          changes: { known_secrets: "体内封着上古剑魂、几认识父亲" },
          confidence: "high",
        },
      ],
      timeline_events: [],
      plot_thread_updates: [],
      new_entities: [],
    };

    const next = applyStateDiff(baseBible, diff, 2);

    expect(next.story_state?.characters?.[0].known_secrets).toEqual([
      "体内封着上古剑魂",
      "几认识父亲",
    ]);
  });

  it("ignores unknown character change fields so story_state stays schema-compatible", () => {
    const diff = {
      character_updates: [
        {
          name: "主角",
          changes: { current_location: "城镇", invalid_field: "不应写入" },
          confidence: "high",
        },
      ],
      timeline_events: [],
      plot_thread_updates: [],
      new_entities: [],
    } satisfies StateDiff;

    const next = applyStateDiff(baseBible, diff, 2);

    expect(next.story_state?.characters?.[0]).toEqual({
      name: "主角",
      current_location: "城镇",
    });
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

  it("adds new characters from new_entities", () => {
    const diff: StateDiff = {
      character_updates: [],
      timeline_events: [],
      plot_thread_updates: [],
      new_entities: [
        { type: "character", name: "神秘少女", description: "在暗处观察主角的神秘角色" },
      ],
    };

    const next = applyStateDiff(baseBible, diff, 1);
    expect(next.characters).toHaveLength(4);
    expect(next.characters.some((c) => c.name === "神秘少女")).toBe(true);
    const newChar = next.characters.find((c) => c.name === "神秘少女");
    expect(newChar!.role).toBe("hidden");
    expect(newChar!.motivation).toBe("在暗处观察主角的神秘角色");
  });

  it("adds new locations from new_entities", () => {
    const diff: StateDiff = {
      character_updates: [],
      timeline_events: [],
      plot_thread_updates: [],
      new_entities: [
        { type: "location", name: "迷雾森林", description: "充满迷雾的神秘森林" },
      ],
    };

    const next = applyStateDiff(baseBible, diff, 1);
    expect(next.world.geography).toContain("迷雾森林");
    expect(next.story_state?.locations).toContainEqual({
      name: "迷雾森林",
      current_state: "充满迷雾的神秘森林",
      last_seen_chapter: 1,
    });
  });

  it("adds new rules from new_entities", () => {
    const diff: StateDiff = {
      character_updates: [],
      timeline_events: [],
      plot_thread_updates: [],
      new_entities: [
        { type: "rule", name: "禁魔法则", description: "在城镇内禁止施展魔法" },
      ],
    };

    const next = applyStateDiff(baseBible, diff, 1);
    expect(next.world.rules).toContain("在城镇内禁止施展魔法");
  });

  it("adds items as geography entries with prefix", () => {
    const diff: StateDiff = {
      character_updates: [],
      timeline_events: [],
      plot_thread_updates: [],
      new_entities: [
        { type: "item", name: "星辰剑", description: "传说中的神剑" },
      ],
    };

    const next = applyStateDiff(baseBible, diff, 1);
    expect(next.world.geography).toContain("[物品] 星辰剑");
    expect(next.story_state?.items).toContainEqual({
      name: "星辰剑",
      status: "传说中的神剑",
      notes: "首次出现于第 1 章",
    });
  });

  it("preserves expanded story_state relationships and tracks foreshadowing", () => {
    const bible: BibleDraft = {
      ...baseBible,
      story_state: {
        relationships: [{ from: "主角", to: "导师", status: "信任", updated_in: 1 }],
      },
    };
    const diff: StateDiff = {
      character_updates: [{ name: "主角", changes: { current_goal: "追查旧案" }, confidence: "high" }],
      timeline_events: [],
      plot_thread_updates: [],
      new_entities: [
        { type: "item", name: "残破玉佩", description: "伏笔：玉佩与父母旧案有关" },
      ],
    };

    const next = applyStateDiff(bible, diff, 2);

    expect(next.story_state?.relationships).toEqual([
      { from: "主角", to: "导师", status: "信任", updated_in: 1 },
    ]);
    expect(next.story_state?.characters?.[0].current_goal).toBe("追查旧案");
    expect(next.story_state?.foreshadowing?.[0]).toMatchObject({
      clue: "残破玉佩",
      status: "planted",
      introduced_in: 2,
      notes: "伏笔：玉佩与父母旧案有关",
    });
  });

  it("skips duplicate new_entities", () => {
    const diff: StateDiff = {
      character_updates: [],
      timeline_events: [],
      plot_thread_updates: [],
      new_entities: [
        { type: "character", name: "主角", description: "已经是主角了" },
      ],
    };

    const next = applyStateDiff(baseBible, diff, 1);
    expect(next.characters).toHaveLength(3);
  });
});

describe("filterStateDiff", () => {
  const diff: StateDiff = {
    character_updates: [
      { name: "主角", changes: { current_location: "城镇" }, confidence: "high" },
      { name: "导师", changes: { emotional_state: "担忧" }, confidence: "medium" },
    ],
    timeline_events: [
      { event: "到达城镇" },
      { event: "发现密室", impact: "开启新线索" },
    ],
    plot_thread_updates: [
      { title: "复仇之路", status: "progressing", notes: "开始调查" },
    ],
    new_entities: [
      { type: "location", name: "迷雾森林", description: "充满迷雾的神秘森林" },
      { type: "item", name: "星辰剑", description: "传说中的神剑" },
    ],
  };

  it("creates all-selected and empty selections from a diff", () => {
    expect(createStateDiffSelection(diff)).toEqual({
      character_updates: [0, 1],
      timeline_events: [0, 1],
      plot_thread_updates: [0],
      new_entities: [0, 1],
    });
    expect(createStateDiffSelection(diff, false)).toEqual({
      character_updates: [],
      timeline_events: [],
      plot_thread_updates: [],
      new_entities: [],
    });
  });

  it("keeps only selected diff items before merge", () => {
    const filtered = filterStateDiff(diff, {
      character_updates: [0],
      timeline_events: [],
      plot_thread_updates: [],
      new_entities: [],
    });

    expect(filtered).toEqual({
      character_updates: [{ name: "主角", changes: { current_location: "城镇" }, confidence: "high" }],
      timeline_events: [],
      plot_thread_updates: [],
      new_entities: [],
    });

    const next = applyStateDiff(baseBible, filtered, 3);
    expect(next.story_state?.characters).toEqual([{ name: "主角", current_location: "城镇" }]);
    expect(next.story_state?.timeline).toBeUndefined();
    expect(next.story_state?.plot_threads).toBeUndefined();
    expect(next.story_state?.locations).toBeUndefined();
    expect(next.characters).toHaveLength(3);
  });
});

describe("detectStateDiffConflicts", () => {
  it("warns when the same character has conflicting locations in a single diff", () => {
    const warnings = detectStateDiffConflicts(baseBible, {
      character_updates: [
        { name: "主角", changes: { current_location: "城镇" }, confidence: "high" },
        { name: "主角", changes: { current_location: "山谷" }, confidence: "high" },
      ],
      timeline_events: [],
      plot_thread_updates: [],
      new_entities: [],
    });

    expect(warnings).toEqual([
      {
        type: "character_location",
        section: "character_updates",
        index: 1,
        message: "主角 在同一次状态更新中同时出现「城镇」和「山谷」两个位置。",
      },
    ]);
  });

  it("warns when existing story state already contains conflicting character locations", () => {
    const warnings = detectStateDiffConflicts({
      ...baseBible,
      story_state: {
        characters: [
          { name: "主角", current_location: "城镇" },
          { name: "主角", current_location: "山谷" },
        ],
      },
    }, {
      character_updates: [],
      timeline_events: [],
      plot_thread_updates: [],
      new_entities: [],
    });

    expect(warnings[0]).toMatchObject({
      type: "character_location",
      message: "主角 在 Story State 中同时记录为「城镇」和「山谷」，请先确认当前位置。",
    });
  });

  it("warns when an already resolved foreshadowing or plot thread is resolved again", () => {
    const warnings = detectStateDiffConflicts({
      ...baseBible,
      story_state: {
        foreshadowing: [{ id: "f1", clue: "玉佩旧案", status: "resolved", introduced_in: 1 }],
        plot_threads: [{ id: "p1", title: "剑魂伏笔", status: "resolved", introduced_in: 1, resolved_in: 5 }],
      },
    }, {
      character_updates: [],
      timeline_events: [],
      plot_thread_updates: [
        { title: "玉佩旧案", status: "resolved" },
        { title: "剑魂伏笔", status: "resolved" },
      ],
      new_entities: [],
    });

    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatchObject({
      type: "foreshadowing_resolved",
      section: "plot_thread_updates",
      index: 0,
    });
    expect(warnings[1]).toMatchObject({
      type: "foreshadowing_resolved",
      section: "plot_thread_updates",
      index: 1,
    });
  });

  it("warns when relationship records contain mutually exclusive statuses", () => {
    const warnings = detectStateDiffConflicts({
      ...baseBible,
      story_state: {
        relationships: [
          { from: "主角", to: "导师", status: "信任", updated_in: 1 },
          { from: "导师", to: "主角", status: "敌对", updated_in: 2 },
        ],
      },
    }, {
      character_updates: [],
      timeline_events: [],
      plot_thread_updates: [],
      new_entities: [],
    });

    expect(warnings).toEqual([
      {
        type: "relationship_conflict",
        message: "导师 与 主角 的关系状态同时存在「信任」和「敌对」，请先确认关系记录。",
      },
    ]);
  });

  it("does not warn for normal location changes or compatible relationships", () => {
    const warnings = detectStateDiffConflicts({
      ...baseBible,
      story_state: {
        characters: [{ name: "主角", current_location: "村庄" }],
        relationships: [
          { from: "主角", to: "导师", status: "信任", updated_in: 1 },
          { from: "导师", to: "主角", status: "合作", updated_in: 2 },
        ],
      },
    }, {
      character_updates: [{ name: "主角", changes: { current_location: "城镇" }, confidence: "high" }],
      timeline_events: [],
      plot_thread_updates: [{ title: "复仇之路", status: "progressing" }],
      new_entities: [],
    });

    expect(warnings).toEqual([]);
  });
});
