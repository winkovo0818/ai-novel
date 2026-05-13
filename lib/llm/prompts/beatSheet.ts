import type { ChatMessage } from "../client";
import type { BibleDraft, StoryStateV1 } from "../../validation/schemas";
import { PROMPT_SAFETY_PREAMBLE, wrap, wrapOr } from "../promptSafety";

export interface BeatSheetPromptInput {
  bible: BibleDraft;
  chapterIndex: number;
  chapterTitle: string;
  chapterSummary?: string;
  previousChapterSummary?: string;
  storyState?: StoryStateV1;
  chapterGoal?: string;
}

export function buildBeatSheetPrompt(input: BeatSheetPromptInput): ChatMessage[] {
  const { bible, chapterIndex, chapterTitle, chapterSummary, previousChapterSummary, storyState, chapterGoal } = input;
  const protagonist = bible.characters.find((c) => c.role === "protagonist");
  const allChapters = [
    ...bible.outline.volume_1.chapters,
    ...(bible.outline.volumes?.flatMap((v) => v.chapters) ?? []),
  ];
  const outline = allChapters.find((c) => c.index === chapterIndex);

  let stateSection = "";
  if (storyState) {
    const lines: string[] = [];
    if (storyState.characters?.length) {
      lines.push("角色状态：");
      for (const char of storyState.characters) {
        const parts: string[] = [];
        if (char.current_location) parts.push(`位置：${wrap(char.current_location, "story_state")}`);
        if (char.emotional_state) parts.push(`情绪：${wrap(char.emotional_state, "story_state")}`);
        if (char.current_goal) parts.push(`目标：${wrap(char.current_goal, "story_state")}`);
        lines.push(`- ${wrap(char.name, "character_name")}：${parts.join("；")}`);
      }
    }
    if (storyState.plot_threads?.length) {
      lines.push("活跃线索：");
      for (const thread of storyState.plot_threads) {
        lines.push(`- ${wrap(thread.title, "plot_thread")}（${thread.status}）`);
      }
    }
    if (lines.length > 0) stateSection = `\n${lines.join("\n")}\n`;
  }

  const outlineLine = chapterSummary
    ? `章节大纲：${wrap(chapterSummary, "outline_summary")}`
    : outline?.summary
      ? `章节大纲：${wrap(outline.summary, "outline_summary")}`
      : "（本章未预设大纲）";

  return [
    {
      role: "system",
      content: `你是一个小说大纲写作助手。你的任务是为给定章节生成 5-8 个节拍（beat），指导正文写作。

${PROMPT_SAFETY_PREAMBLE}

每个节拍包含：
- index: 节拍序号（从 1 开始）
- description: 节拍描述（50-100字），包含场景、角色动作和情感、情节推进目的

规则：
- 节拍必须承接前文状态和活跃线索。
- 每个节拍要有明确的戏剧功能（铺垫、冲突、转折、揭示、升级）。
- 只输出 JSON，不要任何其他文本。
- 如果章节大纲有明确摘要，节拍应覆盖大纲要点。`,
    },
    {
      role: "user",
      content: `小说标题：${wrap(bible.meta.suggested_title, "outline_title")}
章节：第 ${chapterIndex} 章《${wrap(chapterTitle, "chapter_title")}》

主角：${wrapOr(protagonist?.name, "character_name", "主角")}（${wrapOr(protagonist?.personality, "character_personality", "待定")}；动机：${wrapOr(protagonist?.motivation, "character_motivation", "待定")}）
${outlineLine}
${previousChapterSummary ? `\n上一章摘要：\n${wrap(previousChapterSummary, "previous_summary")}\n` : ""}${stateSection}${chapterGoal ? `\n本章目标：${wrap(chapterGoal, "outline_summary")}\n` : ""}

请生成 5-8 个节拍，输出 JSON 格式：
{"beats": [{"index": 1, "description": "..."}]}`,
    },
  ];
}
