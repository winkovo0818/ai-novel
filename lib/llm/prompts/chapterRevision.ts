import type { ChapterContext } from "@/lib/agent/chapterContext";
import type { CriticIssue } from "@/lib/agent/contracts";
import type { ChatMessage } from "@/lib/llm/client";
import { PROMPT_SAFETY_PREAMBLE, wrap, wrapOr } from "@/lib/llm/promptSafety";

export interface BuildChapterRevisionPromptInput {
  context: ChapterContext;
  chapterContent: string;
  issues: CriticIssue[];
}

export function buildChapterRevisionPrompt(input: BuildChapterRevisionPromptInput): ChatMessage[] {
  const { context, chapterContent, issues } = input;
  const bible = context.bible;
  const protagonist = bible.characters.find((c) => c.role === "protagonist");
  const previousContext = context.previousSummaries.map((s) => wrap(s.summary, "previous_summary")).join("\n\n");
  const issueText = issues.map((issue, index) => {
    const suggestion = issue.suggestion ? `\n  建议：${wrap(issue.suggestion, "critic_suggestion")}` : "";
    return `${index + 1}. [${issue.severity}/${issue.type}] ${wrap(issue.description, "critic_issue")}${suggestion}`;
  }).join("\n");

  return [
    {
      role: "system",
      content: `你是中文长篇小说修订助手。你的任务是按照审校意见修订候选稿。

${PROMPT_SAFETY_PREAMBLE}

硬规则：
- 只输出修订后的章节正文，不要 Markdown 标题，不要解释。
- 优先修复审校意见中的 major / critical 问题。
- 保留原候选稿中可用的剧情、语气和细节，不要整章重写成无关内容。
- 不得违反 Story Bible、世界规则、人物动机和前文摘要。
- 修订必须彻底：修复一个问题时不要引入新矛盾，也不要留下原问题换个说法的残留。
- 避免裸露、色情、违反中国法律的内容。`,
    },
    {
      role: "user",
      content: `小说标题：${wrap(bible.meta.suggested_title, "outline_title")}
章节：第 ${context.outline.chapterIndex} 章《${wrap(context.outline.title, "chapter_title")}》

章节大纲：
${context.outline.summary ? wrap(context.outline.summary, "outline_summary") : "本章未预设大纲，请基于前文摘要推进。"}

近 ${context.previousSummaries.length} 章摘要：
${previousContext.trim() || "无"}

主角：
- 姓名：${wrapOr(protagonist?.name, "character_name", "主角")}
- 性格：${wrapOr(protagonist?.personality, "character_personality", "待定")}
- 动机：${wrapOr(protagonist?.motivation, "character_motivation", "待定")}

世界观：
${wrap(bible.world.setting_summary, "world_setting")}

世界规则：
${bible.world.rules.map((rule) => `- ${wrap(rule, "world_rule")}`).join("\n")}

审校意见：
${issueText || "无"}

待修订候选稿：
${wrap(chapterContent.slice(0, 12000), "chapter_content")}

现在输出修订后的章节正文。`,
    },
  ];
}
