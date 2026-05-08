import type { ChatMessage } from "../client";
import type { BibleDraft, StoryStateV1 } from "../../validation/schemas";

export interface StateDiffPromptInput {
  bible: BibleDraft;
  storyState?: StoryStateV1;
  chapterIndex: number;
  chapterTitle: string;
  chapterContent: string;
}

export function buildStateDiffPrompt(input: StateDiffPromptInput): ChatMessage[] {
  const stateJson = input.storyState
    ? JSON.stringify(input.storyState, null, 2)
    : "（尚无运行时状态记录）";

  const characters = input.bible.characters
    .map((c) => `- ${c.name}（${c.role}）：${c.personality}；动机：${c.motivation}`)
    .join("\n");

  return [
    {
      role: "system",
      content: `你是小说状态追踪器。你的任务是阅读一章正文，对比当前 Story Bible 和运行时状态，输出本章带来的结构化状态变更（state diff）。

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
第 ${input.chapterIndex} 章《${input.chapterTitle}》

## 本章正文
${input.chapterContent.slice(0, 6000)}

请分析本章带来的状态变更，输出 JSON。`,
    },
  ];
}
