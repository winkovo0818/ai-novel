import type { ChatMessage } from "@/lib/llm/client";
import type { BibleDraft, StoryStateV1 } from "@/lib/validation/schemas";
import { PROMPT_SAFETY_PREAMBLE, sanitizeForPrompt, wrap } from "@/lib/llm/promptSafety";

export interface StateDiffPromptInput {
  bible: BibleDraft;
  storyState?: StoryStateV1;
  chapterIndex: number;
  chapterTitle: string;
  chapterContent: string;
}

export function buildStateDiffPrompt(input: StateDiffPromptInput): ChatMessage[] {
  // storyState is serialized as JSON — wrap the entire blob as data so any
  // user-controlled strings inside (names, notes, etc) can't break out.
  const stateJson = input.storyState
    ? `<story_state>${sanitizeForPrompt(JSON.stringify(input.storyState, null, 2))}</story_state>`
    : "（尚无运行时状态记录）";

  const characters = input.bible.characters
    .map((c) => `- ${wrap(c.name, "character_name")}（${c.role}）：${wrap(c.personality, "character_personality")}；动机：${wrap(c.motivation, "character_motivation")}`)
    .join("\n");

  return [
    {
      role: "system",
      content: `你是小说状态追踪器。你的任务是阅读一章正文，对比当前 Story Bible 和运行时状态，输出本章带来的结构化状态变更（state diff）。

${PROMPT_SAFETY_PREAMBLE}

输出必须且只能是 JSON，格式如下：
{
  "character_updates": [
    { "name": "角色名", "changes": { "current_location": "新地点", "emotional_state": "新情绪" }, "confidence": "high" }
  ],
  "timeline_events": [
    { "event": "事件简述", "impact": "对全局的影响" }
  ],
  "plot_thread_updates": [
    { "title": "线索名", "status": "progressing", "notes": "本章推进情况" }
  ],
  "new_entities": [
    { "type": "character|location|item|rule", "name": "实体名", "description": "描述" }
  ],
  "constraint_updates": [
    { "fact": "本章确立的既定事实/硬约束", "validity": "permanent|until_revealed", "notes": "可选说明" }
  ],
  "foreshadowing_updates": [
    { "clue": "伏笔/线索名", "status": "planted|reinforced|revealed|resolved", "payoff_hint": "可选：何时何情境回收", "notes": "可选说明" }
  ]
}

规则：
- 只输出实际在本章中发生变化的内容，不要臆测。
- 优先抽取可验证状态变化：新线索、关系变化、位置变化、道具归属、敌人反应、伤势/能力变化、世界规则确认。
- timeline_events 至少记录本章最核心的“行动 -> 结果”，除非正文真的没有任何事件推进。
- plot_thread_updates 只记录被推进、强化、揭示或解决的线索；不要把纯氛围描写当线索。
- new_entities 中 item/location/rule 的归属、位置或限制要写在 description 里，方便下一章承接。
- constraint_updates 抽取本章确立、后续章节必须遵守的既定事实/硬约束，**尤其角色身份与称谓**（防后续章节把不同角色混称同一头衔）。必须抽取的类别：
  - **角色身份/称谓/存亡**：本章首次明确某角色的头衔、身份、职位或生死状态时，必须记为 permanent 约束。格式如「蒋阶是柴饦峰前任门主，已死于后山塌方」「当前掌门（无名）是柴饦峰现任掌权者」。这样后续章节不会把"门主"误用于活着的掌门，或把死了的角色写成活着。
  - 角色已知/未知的关键信息（如"沈言已知道木牌是追踪符"）
  - 物品归属、位置关系、不可违背的承诺/契约、确认的世界规则
  validity：permanent=永久约束，until_revealed=直到被某章明确推翻/揭示。只记可验证的硬事实，不记主观情绪或氛围；没有就留空数组。
- foreshadowing_updates 追踪伏笔状态机：本章首次埋下伏笔记 planted（如首次出现的追踪符、神秘符号、未解之谜）；后续章节该伏笔被强化/再次提及记 reinforced；伏笔真相被揭示记 revealed；伏笔彻底回收/解决记 resolved。status 必须反映本章对既有伏笔的处理——避免伏笔埋下后多章不跟进导致悬置。没有伏笔变化就留空数组。
- confidence 取 low/medium/high，基于文本中直接描写的取 high，需要推理的取 medium，有不确定性的取 low。
- 如果本章没有明显状态变更，所有数组为空即可。
- 不要输出任何 JSON 之外的文本或解释。`,
    },
    {
      role: "user",
      content: `## Story Bible 角色设定
${characters}

## 当前运行时状态
${stateJson}

## 本章信息
第 ${input.chapterIndex} 章《${wrap(input.chapterTitle, "chapter_title")}》

## 本章正文
${wrap(input.chapterContent.slice(0, 6000), "chapter_content")}

请分析本章带来的状态变更，输出 JSON。`,
    },
  ];
}
