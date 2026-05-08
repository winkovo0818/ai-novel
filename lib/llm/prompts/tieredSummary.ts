import type { ChatMessage } from "../client";

export interface VolumeSummaryInput {
  volumeIndex: number;
  volumeName: string;
  chapterSummaries: string[];
}

export function buildVolumeSummaryPrompt(input: VolumeSummaryInput): ChatMessage[] {
  return [
    {
      role: "system",
      content: `你是一位小说编辑。请将以下章节摘要压缩成一段卷级摘要（200-400字）。

要求：
- 保留主线推进、关键冲突和角色成长。
- 删除细节描写和次要支线。
- 用第三人称概述语气。
- 只输出摘要正文，不要标题或解释。`,
    },
    {
      role: "user",
      content: `第 ${input.volumeIndex} 卷《${input.volumeName}》共 ${input.chapterSummaries.length} 章：

${input.chapterSummaries.map((s, i) => `第${i + 1}章摘要：${s}`).join("\n\n")}

请输出卷级摘要。`,
    },
  ];
}

export interface NovelSummaryInput {
  volumeSummaries: Array<{ volumeIndex: number; volumeName: string; summary: string }>;
}

export function buildNovelSummaryPrompt(input: NovelSummaryInput): ChatMessage[] {
  return [
    {
      role: "system",
      content: `你是一位小说编辑。请将以下各卷摘要压缩成一段全书梗概（150-300字）。

要求：
- 保留全书主线、核心冲突和主要角色弧线。
- 突出伏笔和悬念。
- 用第三人称概述语气。
- 只输出梗概正文，不要标题或解释。`,
    },
    {
      role: "user",
      content: `${input.volumeSummaries.map((v) => `第 ${v.volumeIndex} 卷《${v.volumeName}》：${v.summary}`).join("\n\n")}

请输出全书梗概。`,
    },
  ];
}
