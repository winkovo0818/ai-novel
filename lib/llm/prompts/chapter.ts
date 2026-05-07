import type { ChatMessage } from "../client";
import type { BibleDraft, NovelProfile } from "../../validation/schemas";

export interface ChapterPromptInput {
  bible: BibleDraft;
  profile: NovelProfile;
  chapterIndex: number;
  title: string;
  existingContent?: string;
  previousContext?: string;
}

export function buildChapterPrompt(input: ChapterPromptInput): ChatMessage[] {
  const protagonist = input.bible.characters.find((c) => c.role === "protagonist");
  const chapter = input.bible.outline.volume_1.chapters.find(
    (item) => item.index === input.chapterIndex,
  );

  return [
    {
      role: "system",
      content: `你是中文长篇小说写作助手。任务是基于 Story Bible、卷纲和前文，起草章节正文。

硬规则：
- 只输出正文，不要 Markdown 标题，不要解释。
- 不得违反世界规则和人物动机。
- 第 ${input.chapterIndex} 章必须承接前文，不要重写已经发生过的剧情。
- 保持 ${input.profile.pov} 视角、${input.profile.tone} 调性、${input.profile.pace} 节奏。
- 目标字数接近 ${input.profile.chapter_word_count} 字；MVP 可先输出较短但完整的开篇片段。
- 避免裸露、色情、违反中国法律的内容。`,
    },
    {
      role: "user",
      content: `小说标题：${input.bible.meta.suggested_title}
章节：第 ${input.chapterIndex} 章《${input.title}》

章节大纲：
${chapter?.summary ?? "按第一章节拍展开。"}

前文上下文（按章节顺序；用于承接，不要重复）：
${input.previousContext?.trim() || "无"}

主角：
- 姓名：${protagonist?.name ?? "主角"}
- 性格：${protagonist?.personality ?? "待定"}
- 动机：${protagonist?.motivation ?? "待定"}

世界观：
${input.bible.world.setting_summary}

世界规则：
${input.bible.world.rules.map((rule) => `- ${rule}`).join("\n")}

${input.chapterIndex === 1 ? `第一章节拍：
${input.bible.first_chapter_beats.map((beat) => `${beat.beat}. ${beat.scene}：${beat.purpose}`).join("\n")}` : `本章写作要求：
- 以“章节大纲”为主，不套用第一章节拍。
- 承接前文上下文，推进新的冲突或发现。
- 保持章节结尾有继续阅读的牵引。`}

已有正文（如有，续写并融合，不要重复）：
${input.existingContent?.trim() || "无"}

现在开始输出章节正文。`,
    },
  ];
}
