import type { ChapterContext } from "@/lib/agent/chapterContext";
import type { CriticIssue } from "@/lib/agent/contracts";
import type { ChatMessage } from "@/lib/llm/client";
import type { ChapterRevisionOperation } from "@/lib/validation/schemas";
import { PROMPT_SAFETY_PREAMBLE, wrap, wrapOr } from "@/lib/llm/promptSafety";
import { HUMANIZE_OPERATION_GUIDE, HUMAN_STYLE_DIRECTIVE } from "@/lib/llm/prompts/humanStyle";

export interface BuildChapterRevisionPromptInput {
  context: ChapterContext;
  chapterContent: string;
  issues: CriticIssue[];
}

export interface BuildLocalChapterRevisionPromptInput {
  context: ChapterContext;
  operation: ChapterRevisionOperation;
  selectedText: string;
  beforeContext: string;
  afterContext: string;
  title: string;
}

const LOCAL_OPERATION_INSTRUCTIONS: Record<ChapterRevisionOperation, string> = {
  polish: "润色选中段落：改善节奏、句式和质感，保留原意、信息量和人物行动。",
  humanize: "去 AI 味：识别并改掉模式化续写痕迹，让选中段落更像真实作者写出的小说片段；保留剧情事实、人物动作、信息量和前后文衔接。",
  expand: "扩写选中段落：补足动作、心理、环境或因果，使段落更饱满，但不要改变剧情结果。",
  shorten: "缩写选中段落：压缩冗余表达，保留必要信息、人物动机和情绪转折。",
  dialogue: "改对白：强化人物口吻、潜台词和对话推进，减少解释性旁白。",
  intensify_conflict: "增强冲突：提高阻力、选择压力或情绪对抗，但不得引入无铺垫的新设定。",
  continue: "续写选中段落：承接选中段落继续推进一小段，只输出新增/改写后的局部正文。",
};

export function buildChapterRevisionPrompt(input: BuildChapterRevisionPromptInput): ChatMessage[] {
  const { context, chapterContent, issues } = input;
  const bible = context.bible;
  const protagonist = bible.characters.find((c) => c.role === "protagonist");
  const previousContext = context.previousSummaries.map((s) => wrap(s.summary, "previous_summary")).join("\n\n");
  const issueText = issues.map((issue, index) => {
    const suggestion = issue.suggestion ? `\n  建议：${wrap(issue.suggestion, "critic_suggestion")}` : "";
    return `${index + 1}. [${issue.severity}/${issue.type}] ${wrap(issue.description, "critic_issue")}${suggestion}`;
  }).join("\n");

  // Countable issue types need concrete mechanics, otherwise the model "acknowledges"
  // the note without measurably changing the prose. Mirror the critic's signals.
  const issueTypes = new Set(issues.map((issue) => issue.type));
  const typeGuidance: string[] = [];
  if (issueTypes.has("prose_quality")) {
    typeGuidance.push('- 修 prose_quality：打散句首重复（改写相邻段落的起始结构，别再用同一主语+动词开头）、拆掉三连排比/列举（改写成带动作或细节的句子，不要"一个…一种…一道…"）、删聊天机器人套话（"如果你愿意""可以认为""值得注意的是"等）。保留剧情事实与信息量。');
  }
  if (issueTypes.has("logic_chain")) {
    typeGuidance.push("- 修 logic_chain：为堆叠的事件补上动机与因果连接（为什么做 → 遇到什么阻碍 → 怎么行动 → 得到什么结果），让主链可读；只能用已确立的设定，不得新增与 Bible 冲突的因果。");
  }
  const typeGuidanceText = typeGuidance.length > 0 ? `\n\n针对性修订指引（按命中的问题类型）：\n${typeGuidance.join("\n")}` : "";

  return [
    {
      role: "system",
      content: `你是中文长篇小说修订助手。你的任务是按照审校意见修订候选稿。

${PROMPT_SAFETY_PREAMBLE}

${HUMAN_STYLE_DIRECTIVE}

硬规则：
- 只输出修订后的章节正文，不要 Markdown 标题，不要解释。
- 优先修复审校意见中的 major / critical 问题。
- 保留原候选稿中可用的剧情、语气和细节，不要整章重写成无关内容。
- 不得违反 Story Bible、世界规则、人物动机和前文摘要。
- 修订必须彻底：修复一个问题时不要引入新矛盾，也不要留下原问题换个说法的残留。
- 修订时同样要符合"人工痕迹要求"——审校意见的"语言生硬"类问题往往就是 AI 痕迹问题。
- 避免裸露、色情、违反中国法律的内容。${typeGuidanceText}`,
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

export function buildLocalChapterRevisionPrompt(input: BuildLocalChapterRevisionPromptInput): ChatMessage[] {
  const { context, operation, selectedText, beforeContext, afterContext, title } = input;
  const bible = context.bible;
  const protagonist = bible.characters.find((c) => c.role === "protagonist");
  const instruction = LOCAL_OPERATION_INSTRUCTIONS[operation];

  return [
    {
      role: "system",
      content: `你是中文长篇小说局部改写助手。你的任务是只处理用户选中的正文片段。

${PROMPT_SAFETY_PREAMBLE}

${HUMAN_STYLE_DIRECTIVE}

硬规则：
- 只返回改写后的局部正文，不要 Markdown 标题，不要解释，不要输出前后文。
- 必须严格执行本次操作：${instruction}
- ${operation === "humanize" ? "改写前先在内部检查 AI 痕迹，最终只输出去 AI 味后的正文，不要列出检查过程。" : "保持局部改写范围清晰。"}
- 改写必须能无缝替换原选区，和前后文自然衔接。
- 不得改变已确立的 Story Bible、世界规则、人物动机和时间线。
- 不得擅自扩展到整章重写；除 continue 外，不要续写选区之后的新剧情。
- 避免裸露、色情、违反中国法律的内容。`,
    },
    {
      role: "user",
      content: `小说标题：${wrap(bible.meta.suggested_title, "outline_title")}
章节：第 ${context.outline.chapterIndex} 章《${wrap(title || context.outline.title, "chapter_title")}》
操作：${operation}
操作说明：${instruction}
${operation === "humanize" ? `\n${HUMANIZE_OPERATION_GUIDE}\n` : ""}

章节大纲：
${context.outline.summary ? wrap(context.outline.summary, "outline_summary") : "本章未预设大纲，请基于前后文推进。"}

主角：
- 姓名：${wrapOr(protagonist?.name, "character_name", "主角")}
- 性格：${wrapOr(protagonist?.personality, "character_personality", "待定")}
- 动机：${wrapOr(protagonist?.motivation, "character_motivation", "待定")}

世界规则：
${bible.world.rules.map((rule) => `- ${wrap(rule, "world_rule")}`).join("\n")}

选区前文：
${beforeContext.trim() ? wrap(beforeContext, "chapter_content") : "无"}

待改写选区：
${wrap(selectedText, "chapter_content")}

选区后文：
${afterContext.trim() ? wrap(afterContext, "chapter_content") : "无"}

现在只输出改写后的局部正文。`,
    },
  ];
}
