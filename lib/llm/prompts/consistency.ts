import type { BibleDraft, NovelProfile } from "@/lib/validation/schemas";
import type { ChatMessage } from "@/lib/llm/client";
import { PROMPT_SAFETY_PREAMBLE, wrap } from "@/lib/llm/promptSafety";

interface ConsistencyCheckInput {
  bible: BibleDraft;
  profile: NovelProfile;
  chapters: Array<{ index: number; title: string; content: string }>;
}

export function buildConsistencyPrompt(input: ConsistencyCheckInput): ChatMessage[] {
  const characterList = input.bible.characters
    .map((c) => `  - ${wrap(c.name, "character_name")}（${c.role}）: ${wrap(c.personality, "character_personality")}`)
    .join("\n");

  const rules = input.bible.world.rules.map((r) => wrap(r, "world_rule")).join("；");

  const chapterSummaries = input.chapters
    .map((c) => `第${c.index}章《${wrap(c.title, "chapter_title")}》：${wrap(c.content.replace(/\s+/g, " ").trim().slice(0, 600), "chapter_content")}`)
    .join("\n\n");

  return [
    {
      role: "system",
      content: `你是一位小说编辑，专门检查跨章节一致性。你需要检查以下内容：
1. 角色行为是否与 Bible 设定矛盾
2. 世界规则是否被违反
3. 情节是否出现逻辑矛盾（如时间线、地点、角色状态）
4. 人物称呼是否前后一致

${PROMPT_SAFETY_PREAMBLE}

回复 JSON 格式：
- 如果一切一致：{"consistent": true}
- 如果发现问题：{"consistent": false, "issues": [{"type": "角色矛盾|规则违反|情节矛盾|称呼不一致", "chapter": 3, "description": "具体问题描述"}]}

仅回复 JSON。`,
    },
    {
      role: "user",
      content: `## 角色设定
${characterList}

## 世界规则
${rules}

## 已写章节摘要
${chapterSummaries}

请检查以上章节的一致性。`,
    },
  ];
}
