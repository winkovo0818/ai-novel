import type { ChatMessage } from "@/lib/llm/client";

export function buildSummarizePrompt(chapterIndex: number, title: string, content: string): ChatMessage[] {
  return [
    {
      role: "system",
      content: "你是一个小说章节摘要生成器。将给定章节内容压缩为一段 300 字以内的摘要，保留关键情节点、角色状态变化和世界规则引用。只输出摘要文本，不要其他内容。",
    },
    {
      role: "user",
      content: `第${chapterIndex}章《${title}》：\n\n${content}`,
    },
  ];
}

export function buildContextRetrievalPrompt(
  query: string,
  summaries: Array<{ index: number; title: string; summary: string }>,
): ChatMessage[] {
  const summaryList = summaries
    .map((s) => `第${s.index}章《${s.title}》：${s.summary}`)
    .join("\n\n");

  return [
    {
      role: "system",
      content: `你是一个上下文检索助手。根据用户的查询，从以下章节摘要中找出最相关的信息，并整理成连贯的上下文描述。

章节摘要：
${summaryList}

只输出与查询相关的上下文内容，不要重复摘要原文。`,
    },
    {
      role: "user",
      content: query,
    },
  ];
}
