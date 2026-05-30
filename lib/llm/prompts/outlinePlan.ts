import type { ChatMessage } from "@/lib/llm/client";
import { getAllChapters, type BibleDraft, type NovelProfile } from "@/lib/validation/schemas";
import { PROMPT_SAFETY_PREAMBLE, wrap, wrapOr } from "@/lib/llm/promptSafety";

export interface OutlinePlanPromptInput {
  profile: NovelProfile;
  bible: BibleDraft;
  /** First chapter index to plan (inclusive). */
  fromIndex: number;
  /** Last chapter index to plan (inclusive). */
  toIndex: number;
}

/**
 * Prompt for the outline planner: given the profile + existing Bible and the
 * chapters already outlined, generate title + one-line summary for every
 * chapter in [fromIndex, toIndex]. The spike showed chapters past the seed
 * outline lose their title (fall back to「第 N 章」) and continuity degrades, so
 * this front-loads real titles/summaries before the per-chapter loop starts.
 */
export function buildOutlinePlanPrompt(input: OutlinePlanPromptInput): ChatMessage[] {
  const { profile, bible, fromIndex, toIndex } = input;
  const count = toIndex - fromIndex + 1;

  const characters = bible.characters
    .map(
      (c) =>
        `- ${wrap(c.name, "character_name")}（${c.role}）：${wrapOr(c.personality, "character_personality", "待定")}；目标：${wrapOr(c.goals, "character_motivation", "待定")}`,
    )
    .join("\n");

  const factions = bible.world.factions
    .map((f) => `- ${wrap(f.name, "faction")}（${f.alignment}）：${f.role}`)
    .join("\n");

  const existing = getAllChapters(bible)
    .filter((c) => c.index < fromIndex)
    .sort((a, b) => a.index - b.index);
  const existingList = existing.length
    ? existing
        .map((c) => `- 第 ${c.index} 章《${wrap(c.title, "chapter_title")}》：${wrap(c.summary, "outline_summary")}`)
        .join("\n")
    : "（暂无已规划章节）";

  return [
    {
      role: "system",
      content: `你是资深网文大纲规划师。任务：在与已有设定、已规划章节保持连贯的前提下，为指定区间补全每一章的标题与一句话梗概，使整本书具备清晰的起承转合与节奏。

${PROMPT_SAFETY_PREAMBLE}

输出必须且只能是 JSON，格式如下：
{
  "chapters": [
    { "index": ${fromIndex}, "title": "本章标题", "summary": "本章梗概" }
  ]
}

规则：
- 必须覆盖第 ${fromIndex} 到第 ${toIndex} 章，共 ${count} 章；index 连续、不缺不重。
- title：4-16 字，体现该章看点；不要带“第N章”之类的字样。
- summary：30-80 字，写清本章核心冲突、推进方向与悬念落点，便于后续逐章写作承接。
- 与“已规划章节”自然衔接，不重复已发生情节；线索要逐步铺垫与回收，避免烂尾。
- 依据题材/基调/节奏安排爽点与转折的节奏，避免流水账。
- 不要输出任何 JSON 之外的文本或解释。`,
    },
    {
      role: "user",
      content: `## 作品信息
标题：${wrap(bible.meta.suggested_title, "outline_title")}
题材：${profile.genre_main} / ${wrap(profile.genre_sub, "world_setting")}
基调：${profile.tone}；节奏：${profile.pace}；受众：${profile.audience}；视角：${profile.pov}${profile.description ? `\n一句话简介：${wrap(profile.description, "outline_summary")}` : ""}

## 世界观
${wrap(bible.world.setting_summary, "world_setting")}
阵营：
${factions}

## 主要角色
${characters}

## 已规划章节（请承接，不要重复）
${existingList}

## 本次任务
请补全第 ${fromIndex} 到第 ${toIndex} 章（共 ${count} 章）的标题与梗概，输出 JSON。`,
    },
  ];
}
