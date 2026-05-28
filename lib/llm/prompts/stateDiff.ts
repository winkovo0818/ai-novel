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
  ]
}

规则：
- 只输出实际在本章中发生变化的内容，不要臆测。
- 优先抽取可验证状态变化：新线索、关系变化、位置变化、道具归属、敌人反应、伤势/能力变化、世界规则确认。
- timeline_events 至少记录本章最核心的“行动 -> 结果”，除非正文真的没有任何事件推进。
- plot_thread_updates 只记录被推进、强化、揭示或解决的线索；不要把纯氛围描写当线索。
- new_entities 中 item/location/rule 的归属、位置或限制要写在 description 里，方便下一章承接。
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
