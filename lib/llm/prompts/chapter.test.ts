import { describe, expect, it } from "vitest";

import { buildChapterPrompt } from "./chapter";
import type { BibleDraft, NovelProfile } from "../../validation/schemas";

const profile: NovelProfile = {
  genre_main: "web",
  genre_sub: "玄幻",
  audience: "general",
  length: "long",
  tone: "cool",
  pace: "fast",
  pov: "third_limited",
  chapter_word_count: 3000,
  ai_freedom: "mid",
};

const bible: BibleDraft = {
  meta: {
    suggested_title: "逆魂纪",
    alternative_titles: ["剑魂歌", "裁逆者", "柴门主"],
  },
  characters: [
    {
      role: "protagonist",
      name: "沈言",
      age: 16,
      appearance: "平头讷讨，手腕上有同门留下的疤",
      personality: "表面懦弱实则冷静记仇",
      catchphrase: "我没有，你别乱说。",
      abilities: ["琉璃体质"],
      goals: "短期活下去，长期查清父母之死",
      motivation: "三岁时亲眼看到父母被同门灭口",
      secrets: ["体内封印上古剑魂"],
      relations: [],
    },
    {
      role: "mentor",
      name: "几",
      age: "上古",
      appearance: "残魂如青烟",
      personality: "毒舌谨慎",
      catchphrase: "你再装就真死了。",
      abilities: ["剑魂共鸣"],
      goals: "恢复残魂",
      motivation: "寻找合适宿主",
      secrets: ["知道灭门旧案"],
      relations: [],
    },
    {
      role: "antagonist",
      name: "蒋阶",
      age: 49,
      appearance: "白袍温和",
      personality: "隐忍狠辣",
      catchphrase: "本门同心。",
      abilities: ["控魂术"],
      goals: "夺取剑魂",
      motivation: "突破寿元限制",
      secrets: ["参与旧案"],
      relations: [],
    },
  ],
  world: {
    setting_summary:
      "九州碎裂，十二仙脉争夺资源；修仙体系十境，剑魂为上古遗产，可越阶辅助体质；柴饦门为废柴宗门，主角被扣押在此。",
    factions: [
      { name: "柴饦门", alignment: "中立", role: "废柴宗门" },
      { name: "天代宗", alignment: "正道", role: "宿敌宗门" },
    ],
    rules: ["剑魂认主不可逆", "弟子三年不出师即逐出"],
    geography: ["雨宗", "柴饦峰"],
  },
  outline: {
    volume_1: {
      name: "柴饦起",
      theme: "从被扣押到逆袭宗门",
      chapter_count_estimate: 10,
      chapters: Array.from({ length: 8 }, (_, index) => ({
        index: index + 1,
        title: `第${index + 1}章`,
        summary: "这是一段长度足够通过校验的章节梗概，覆盖本章冲突与推进方向。",
      })),
    },
  },
  first_chapter_beats: [
    { beat: 1, scene: "雨夜火房", purpose: "建立反差" },
    { beat: 2, scene: "执事逼迫", purpose: "制造冲突" },
    { beat: 3, scene: "剑魂初鸣", purpose: "悬念钩子" },
    { beat: 4, scene: "后山裂井", purpose: "引出秘密" },
    { beat: 5, scene: "考核木牌", purpose: "给出目标" },
  ],
};

describe("buildChapterPrompt", () => {
  it("uses first chapter beats for chapter one", () => {
    const messages = buildChapterPrompt({ bible, profile, chapterIndex: 1, title: "第1章" });
    const userContent = messages[1]?.content ?? "";

    expect(userContent).toContain("第一章节拍");
    expect(userContent).toContain("雨夜火房");
  });

  it("uses previous context instead of first chapter beats for later chapters", () => {
    const messages = buildChapterPrompt({
      bible,
      profile,
      chapterIndex: 2,
      title: "第2章",
      previousContext: "第 1 章《第1章》：沈言在雨夜听见剑魂。",
    });
    const userContent = messages[1]?.content ?? "";

    expect(userContent).toContain("前文上下文");
    expect(userContent).toContain("沈言在雨夜听见剑魂");
    expect(userContent).toContain("不套用第一章节拍");
    expect(userContent).not.toContain("雨夜火房");
  });
});
