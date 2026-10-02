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
    { "fact": "本章确立的既定事实/硬约束", "validity": "permanent|until_revealed", "category": "identity|career|knowledge|item|scene|deal|other", "notes": "可选说明" }
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
- constraint_updates 抽取本章确立、后续章节必须遵守的既定事实/硬约束，**尤其角色身份与称谓、履历关键数字、关键物品的固定外观/属性、角色的已知信息**（防后续章节把不同角色混称同一头衔、把同一物品写成不同外观、或角色忘记自己已知的事）。必须抽取的类别：
  - **角色身份/称谓/存亡**（category=identity）：本章首次明确某角色的头衔、身份、职位或生死状态时，必须记为 permanent 约束。格式如「蒋阶是柴饦峰前任门主，已死于后山塌方」。
  - **身份变更事件**（category=identity）：身份发生转变必须记录转变后的状态与起始章，格式如「沈言第6章起为外门弟子，名次第五十八，住丙舍」。防后续章节把已完成的身份转变当作新发生。
  - **履历关键数字**（category=career）：角色在某地/某职位/某关系上的年限、时长、名次、数量等数字首次明确时记录，格式如「沈言在火房当差三年零两个月」。**后续章节不得口述或旁白出与之矛盾的数字**。
  - **关键物品的固定外观/属性**（category=item）：剧情关键物品（如断剑、木牌、信物）以及**反复出场场景中承担剧情功能的固定物**（如阵台立柱的材质）首次明确其外观/材质/颜色/刻字/位置时，记为 permanent 约束。
  - **角色已知信息**（category=knowledge）：谁、从本章起、知道了什么，三要素齐全。格式如「沈言自第11章知道天代宗住西院三间屋（赵平告知）」。防后续章节角色对已知信息表示不知道。
  - 物品归属、位置关系、不可违背的承诺/契约、确认的世界规则（category=deal 或 other）
  - validity：permanent=永久约束，until_revealed=直到被某章明确推翻/揭示。只记可验证的硬事实，不记主观情绪或氛围；没有就留空数组。
  - **会演变的事实**（物品当前位置、当前策略、时限性约定）category 必须标为 scene/deal，不要标 identity/career/knowledge/item——系统只保留易逝类最近的记录，旧的会被自动清掉；恒定类是永久生效的。
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
