import { describe, expect, it } from "vitest";

import { buildCriticPrompt } from "./critic";
import type { BibleDraft, StoryStateV1 } from "../../validation/schemas";
import type { ChapterContext } from "../../agent/chapterContext";

const bible: BibleDraft = {
  meta: { suggested_title: "逆魂纪", alternative_titles: ["剑魂歌"] },
  characters: [
    {
      role: "protagonist",
      name: "沈言",
      age: 16,
      appearance: "平头讷讨",
      personality: "表面懦弱实则冷静",
      catchphrase: "我没有",
      abilities: ["琉璃体质"],
      goals: "活下去并查清旧案",
      motivation: "亲眼看到父母被灭口",
      secrets: [],
      relations: [],
    },
  ],
  world: {
    setting_summary: "九州碎裂",
    factions: [],
    rules: ["剑魂认主不可逆", "弟子三年不出师即逐出"],
    geography: [],
  },
  outline: { volume_1: { name: "n", theme: "t", chapter_count_estimate: 10, chapters: [] } },
  first_chapter_beats: [],
};

const baseContext: ChapterContext = {
  bible,
  outline: { chapterIndex: 3, title: "断魂" },
  previousSummaries: [
    { chapterIndex: 1, title: "起", summary: "主角被扣押" },
    { chapterIndex: 2, title: "怒", summary: "主角觉醒剑魂" },
  ],
  retrievedMemories: [],
  retrievalStatus: "empty",
};

describe("buildCriticPrompt", () => {
  it("emits a system + user message pair", () => {
    const prompt = buildCriticPrompt({ context: baseContext, chapterContent: "正文", chapterIndex: 3 });
    expect(prompt).toHaveLength(2);
    expect(prompt[0].role).toBe("system");
    expect(prompt[1].role).toBe("user");
  });

  it("declares the seven check dimensions and three severity levels", () => {
    const [system] = buildCriticPrompt({ context: baseContext, chapterContent: "x", chapterIndex: 1 });
    for (const dim of ["角色行为", "世界规则", "线索推进", "时间线", "基调", "逻辑链", "文笔质量"]) {
      expect(system.content).toContain(dim);
    }
    for (const sev of ["critical", "major", "minor"]) {
      expect(system.content).toContain(sev);
    }
    // The output schema must list the new type strings or revise route can't route them.
    expect(system.content).toContain("logic_chain");
    expect(system.content).toContain("prose_quality");
  });

  it("instructs the critic to always report countable prose_quality / logic_chain signals", () => {
    const [system] = buildCriticPrompt({ context: baseContext, chapterContent: "x", chapterIndex: 1 });
    // Day 9: critic recall on prose/logic was 33% because the conservative
    // "report less" rule applied to everything. These must now fire on hit.
    expect(system.content).toContain("可计数客观类");
    expect(system.content).toContain("数得出信号就必须报");
    expect(system.content).toContain("不依赖跨章上下文");
  });

  it("renders bible meta, protagonist, world rules, and prior summaries", () => {
    const [, user] = buildCriticPrompt({ context: baseContext, chapterContent: "本章", chapterIndex: 3 });
    expect(user.content).toContain("逆魂纪");
    expect(user.content).toContain("沈言");
    expect(user.content).toContain("剑魂认主不可逆");
    expect(user.content).toContain("主角被扣押");
    expect(user.content).toContain("第 3 章");
  });

  it("falls back to a placeholder when no prior summaries exist", () => {
    const [, user] = buildCriticPrompt({
      context: { ...baseContext, previousSummaries: [] },
      chapterContent: "x",
      chapterIndex: 1,
    });
    expect(user.content).toContain("（无）");
  });

  it("injects active_constraints and marks violations as critical", () => {
    const [system, user] = buildCriticPrompt({
      context: { ...baseContext, storyState: { active_constraints: [
        { fact: "沈言已知道木牌是追踪符", established_in: 2, validity: "permanent" },
      ] } },
      chapterContent: "正文",
      chapterIndex: 3,
    });
    const userContent = user?.content ?? "";
    const systemContent = system?.content ?? "";

    // 约束清单注入 critic 的 user message
    expect(userContent).toContain("既定事实");
    expect(userContent).toContain("本章不得违反");
    expect(userContent).toContain("沈言已知道木牌是追踪符");
    // system 的严重度定义强调违反既定事实 = critical
    expect(systemContent).toContain("违反任一既定事实即为 critical");
  });

  it("truncates chapter content to 12000 characters", () => {
    const long = "字".repeat(13000);
    const [, user] = buildCriticPrompt({ context: baseContext, chapterContent: long, chapterIndex: 1 });
    expect(user.content.match(/字/g)?.length).toBe(12000);
  });

  it("renders the runtime state section when storyState is present", () => {
    const storyState: StoryStateV1 = {
      characters: [
        { name: "沈言", current_location: "雨宗", current_goal: "逃出柴饦门", emotional_state: "戒备" },
      ],
      timeline: [],
      plot_threads: [
        { id: "t1", title: "灭门旧案", status: "open" },
      ],
    };
    const [, user] = buildCriticPrompt({
      context: { ...baseContext, storyState },
      chapterContent: "x",
      chapterIndex: 1,
    });
    expect(user.content).toContain("当前运行时状态");
    expect(user.content).toContain("<character_name>沈言</character_name>：位置：<story_state>雨宗</story_state>");
    expect(user.content).toContain("目标：<story_state>逃出柴饦门</story_state>");
    expect(user.content).toContain("情绪：<story_state>戒备</story_state>");
    expect(user.content).toContain("- <plot_thread>灭门旧案</plot_thread>（open）");
  });

  it("omits the runtime state section when storyState is absent", () => {
    const [, user] = buildCriticPrompt({ context: baseContext, chapterContent: "x", chapterIndex: 1 });
    expect(user.content).not.toContain("当前运行时状态");
  });

  it("does not emit the mystery-specific checklist by default", () => {
    const [system] = buildCriticPrompt({ context: baseContext, chapterContent: "x", chapterIndex: 1 });
    expect(system.content).not.toContain("悬疑 / 推理 / 侦探题材专属");
    expect(system.content).not.toContain("线索回收");
    expect(system.content).not.toContain("信息分类");
  });

  it("emits mystery-specific checklist when isMystery is true", () => {
    const [system] = buildCriticPrompt({ context: baseContext, chapterContent: "x", chapterIndex: 1, isMystery: true });
    expect(system.content).toContain("悬疑 / 推理 / 侦探题材专属");
    expect(system.content).toContain("线索回收");
    expect(system.content).toContain("误导节奏");
    expect(system.content).toContain("信息分类");
  });

  it("emits the revision-mode desensitization clause when isRevision is true", () => {
    const [system] = buildCriticPrompt({
      context: baseContext,
      chapterContent: "x",
      chapterIndex: 1,
      isRevision: true,
    });
    expect(system.content).toContain("本章节已经按审校意见修订过一次");
  });
});

describe("buildCriticPrompt fact-consistency scanning (G3)", () => {
  it("instructs targeted scanning for number, identity and knowledge-boundary contradictions", () => {
    const messages = buildCriticPrompt({ context: baseContext, chapterContent: "正文。", chapterIndex: 3 });
    const system = messages[0].content;
    expect(system).toContain("年限/数字矛盾");
    expect(system).toContain("身份倒退");
    expect(system).toContain("知识边界违反");
    expect(system).toContain("逐类主动扫描");
  });
  it("groups tagged constraints under category headers and keeps untagged flat", () => {
    const context: ChapterContext = {
      ...baseContext,
      storyState: {
        active_constraints: [
          { fact: "沈言在火房当差三年零两个月", established_in: 1, validity: "permanent", category: "career" },
          { fact: "沈言自第6章起为外门弟子，住丙舍", established_in: 6, validity: "permanent", category: "identity" },
          { fact: "沈言自第11章知道天代宗住西院三间屋", established_in: 11, validity: "permanent", category: "knowledge" },
          { fact: "无标签旧约束", established_in: 2, validity: "permanent" },
        ],
      },
    };
    const user = buildCriticPrompt({ context, chapterContent: "正文。", chapterIndex: 12 })[1].content;
    expect(user).toContain("[履历关键数字（career）]");
    expect(user).toContain("[身份与存亡（identity）]");
    expect(user).toContain("[角色已知信息（knowledge）]");
    expect(user).toContain("无标签旧约束"); // 无标签不丢
  });
});
