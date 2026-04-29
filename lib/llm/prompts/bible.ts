/**
 * Bible 草稿生成 Prompt（contracts §8 锁定 6 条硬规则）。
 *
 * 注意：
 * - 流式调用时 *不要* 同时使用 stream:true 与 response_format:json_object（README §5.1）
 * - 离线调试与非流式回退场景可使用 response_format:json_object
 * - 字段命名以 contracts §3 为准（全英文 snake_case，catchphrase 而非口头禅）
 */

import type { ChatMessage } from "../client";
import type { NovelProfile } from "../../validation/schemas";

export interface BiblePromptInput {
  logline: string;
  profile: NovelProfile;
  answers?: Record<string, string | string[]>;
}

const SCHEMA_BLOCK = `必须严格输出以下 JSON 结构（snake_case，无注释，无多余字段）：

{
  "meta": {
    "suggested_title": "2-5 字推荐书名",
    "alternative_titles": ["备选 1", "备选 2", "备选 3"]
  },
  "characters": [
    {
      "role": "protagonist | mentor | antagonist | sidekick | hidden",
      "name": "string",
      "age": "number | string",
      "appearance": "≤30 字，要有记忆点",
      "personality": "表里差异、反差、调性",
      "catchphrase": "1 句口头禅，要出人、能记",
      "abilities": ["1-3 项"],
      "goals": "短期与长期各 1",
      "motivation": "1-2 句背景动机",
      "secrets": ["1-2 个未被揭示的秘密"],
      "relations": ["可空数组"]
    }
  ],
  "world": {
    "setting_summary": "60-120 字世界观速览",
    "factions": [
      { "name": "string", "alignment": "string", "role": "string" }
    ],
    "rules": ["≤30 字硬规则，2-4 条"],
    "geography": ["地点名，2-4 条"]
  },
  "outline": {
    "volume_1": {
      "name": "卷名 3-5 字",
      "theme": "卷主题一句话",
      "chapter_count_estimate": "本卷预估总章数（数字）",
      "chapters": [
        { "index": 1, "title": "章名", "summary": "40-80 字章节梗概" }
      ]
    }
  },
  "first_chapter_beats": [
    { "beat": 1, "scene": "场景描述", "purpose": "本节拍要达成的叙事目的" }
  ]
}

结构约束（违反任何一条都视为失败）：
- characters 长度 3-5，且必须恰好包含 1 个 role=protagonist
- world.factions 长度 2-4，rules 2-4 条，geography 2-4 项
- outline.volume_1.chapters 长度严格 8-12
- first_chapter_beats 长度 5-8`;

const HARD_RULES_BLOCK = `硬规则（contracts §8，缺一不可）：
1. 主角动机必须与 logline 的核心冲突闭环
2. 反派的动机必须合理，避免「为坏而坏」
3. 首卷大纲至少含 1 个小高潮
4. 首卷大纲至少含 1 个伏笔（写在某章 summary 内）
5. outline.volume_1.chapters 长度严格 8-12
6. 避免裸露 / 色情 / 违反中国法律的内容`;

function profileLines(p: NovelProfile): string {
  return [
    `- 类型：${p.genre_main} - ${p.genre_sub}`,
    `- 受众：${p.audience}`,
    `- 篇幅：${p.length}`,
    `- 调性：${p.tone}`,
    `- 节奏：${p.pace}`,
    `- 视角：${p.pov}`,
    `- 单章字数：${p.chapter_word_count}`,
    `- AI 自由度：${p.ai_freedom}`,
  ].join("\n");
}

function answerLines(answers?: Record<string, string | string[]>): string {
  if (!answers || Object.keys(answers).length === 0) {
    return "（用户未提供反向追问答案，按类型与 logline 自行合理填充）";
  }
  return Object.entries(answers)
    .map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(" / ") : v}`)
    .join("\n");
}

export function buildBiblePrompt(input: BiblePromptInput): ChatMessage[] {
  const { logline, profile, answers } = input;

  const system = `你是资深网文世界观架构师，深谙 ${profile.genre_main}/${profile.genre_sub} 流派的爽点、套路与雷区。
任务：基于用户的 logline + 偏好 + 反向追问答案，输出一份可直接交付主编辑器的小说 Bible 草稿。
不要写正文。只输出纯 JSON，且必须严格符合下方 schema。

${SCHEMA_BLOCK}

${HARD_RULES_BLOCK}

输出要求：
- 单卷大纲必须有起承转合，前 3 章建立人物与世界，后续章节制造冲突与伏笔
- first_chapter_beats 5-8 个节拍，整体能装进 ${profile.chapter_word_count} 字左右的章节
- 角色 catchphrase 要短、要怪、要能成为记忆锚点
- 输出必须是合法 JSON，禁止使用 // 注释、尾随逗号、Markdown 代码块包裹`;

  const user = `logline：${logline}

档案偏好：
${profileLines(profile)}

反向追问答案：
${answerLines(answers)}

现在输出 Bible JSON。`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
