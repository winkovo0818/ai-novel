import type { ChatMessage } from "@/lib/llm/client";
import type { NovelProfile } from "@/lib/validation/schemas";
import type { ChapterContext } from "@/lib/agent/chapterContext";
import type { GenerationPolicy } from "@/lib/llm/generationPolicy";
import { PROMPT_SAFETY_PREAMBLE, wrap, wrapOr } from "@/lib/llm/promptSafety";
import { HUMAN_STYLE_DIRECTIVE } from "@/lib/llm/prompts/humanStyle";

export interface ChapterPromptInput {
  context: ChapterContext;
  profile: NovelProfile;
  existingContent?: string;
  generationPolicy?: GenerationPolicy;
}

function buildStoryStateSection(context: ChapterContext): string {
  if (!context.storyState) return "";
  const lines: string[] = ["\n当前运行时状态（必须保持连贯）：\n"];

  if (context.storyState.characters && context.storyState.characters.length > 0) {
    lines.push("角色当前状态：");
    for (const char of context.storyState.characters) {
      const parts: string[] = [];
      if (char.current_location) parts.push(`位置：${wrap(char.current_location, "story_state")}`);
      if (char.current_goal) parts.push(`目标：${wrap(char.current_goal, "story_state")}`);
      if (char.emotional_state) parts.push(`情绪：${wrap(char.emotional_state, "story_state")}`);
      if (char.known_secrets && char.known_secrets.length > 0) parts.push(`已知秘密：${char.known_secrets.map((s) => wrap(s, "story_state")).join("、")}`);
      if (char.relationship_notes && char.relationship_notes.length > 0) parts.push(`关系：${char.relationship_notes.map((r) => wrap(r, "story_state")).join("、")}`);
      lines.push(`- ${wrap(char.name, "character_name")}：${parts.join("；")}`);
    }
  }

  if (context.storyState.plot_threads && context.storyState.plot_threads.length > 0) {
    lines.push("\n活跃线索：");
    for (const thread of context.storyState.plot_threads) {
      lines.push(`- ${wrap(thread.title, "plot_thread")}（${thread.status}）${thread.notes ? "：" + wrap(thread.notes, "plot_thread") : ""}`);
    }
  }

  if (context.storyState.timeline && context.storyState.timeline.length > 0) {
    const lastEvent = context.storyState.timeline[context.storyState.timeline.length - 1];
    lines.push(`\n最新时间线事件（第 ${lastEvent.chapter_index} 章）：${wrap(lastEvent.event, "story_state")}${lastEvent.impact ? "；影响：" + wrap(lastEvent.impact, "story_state") : ""}`);
  }

  return lines.join("\n");
}

export function buildChapterPrompt(input: ChapterPromptInput): ChatMessage[] {
  const { context, profile, existingContent, generationPolicy } = input;
  const bible = context.bible;
  const protagonist = bible.characters.find((c) => c.role === "protagonist");
  const chapterIndex = context.outline.chapterIndex;
  const previousContext = context.previousSummaries.map((s) => wrap(s.summary, "previous_summary")).join("\n\n");

  const storyStateSection = buildStoryStateSection(context);

  const tieredSummarySection: string[] = [];
  if (context.novelSummary) {
    tieredSummarySection.push(`全书梗概：\n${wrap(context.novelSummary, "previous_summary")}`);
  }
  if (context.volumeSummary) {
    tieredSummarySection.push(`当前卷摘要：\n${wrap(context.volumeSummary, "previous_summary")}`);
  }
  const tieredSummaryText = tieredSummarySection.length > 0
    ? `\n${tieredSummarySection.join("\n\n")}\n`
    : "";

  const memorySection = context.retrievedMemories.length > 0
    ? `相关历史片段（仅用于参考，不要直接复述）：\n${context.retrievedMemories.map((m) => `- [来源：${m.source}] ${wrap(m.text, "memory_snippet")}`).join("\n")}\n`
    : context.retrievalStatus === "error"
      ? "\n⚠ 记忆检索服务异常，本章节无法参考历史片段。请勿编造早期细节，仅基于大纲和前文推进。\n"
      : context.retrievalStatus === "empty"
        ? "\n（本章节暂无检索到相关历史片段，请基于大纲和前文摘要推进，不要编造具体细节。）\n"
        : "";

  const policy = generationPolicy ?? {
    toneDirective: `保持 ${profile.tone} 调性`,
    paceDirective: `保持 ${profile.pace} 节奏`,
    freedomDirective: "",
    audienceDirective: "",
    povDirective: `保持 ${profile.pov} 视角`,
    targetWordCount: profile.chapter_word_count,
  };

  const styleDirectives = [
    policy.povDirective,
    policy.toneDirective,
    policy.paceDirective,
    policy.freedomDirective,
    policy.audienceDirective,
  ].filter(Boolean);

  return [
    {
      role: "system",
      content: `你是中文长篇小说写作助手。任务是基于 Story Bible、卷纲和前文，起草章节正文。

${PROMPT_SAFETY_PREAMBLE}

${HUMAN_STYLE_DIRECTIVE}

硬规则：
- 只输出正文，不要 Markdown 标题，不要解释。
- 不得违反世界规则和人物动机。
- 第 ${chapterIndex} 章必须承接前文，不要重写已经发生过的剧情。
${styleDirectives.length > 0 ? `- ${styleDirectives.join("\n- ")}` : ""}
- 目标字数接近 ${policy.targetWordCount} 字；MVP 可先输出较短但完整的开篇片段。
- 避免裸露、色情、违反中国法律的内容。`,
    },
    {
      role: "user",
      content: `小说标题：${wrap(bible.meta.suggested_title, "outline_title")}
章节：第 ${chapterIndex} 章《${wrap(context.outline.title, "chapter_title")}》

章节大纲：
${context.outline.summary ? wrap(context.outline.summary, "outline_summary") : (chapterIndex === 1 ? "按第一章节拍展开。" : "本章未预设大纲，请基于前文摘要推进新的冲突或发现。")}
${tieredSummaryText}
近 ${context.previousSummaries.length} 章摘要（用于直接承接）：
${previousContext.trim() || "无"}
${memorySection}
主角：
- 姓名：${wrapOr(protagonist?.name, "character_name", "主角")}
- 性格：${wrapOr(protagonist?.personality, "character_personality", "待定")}
- 动机：${wrapOr(protagonist?.motivation, "character_motivation", "待定")}

世界观：
${wrap(bible.world.setting_summary, "world_setting")}

世界规则：
${bible.world.rules.map((rule) => `- ${wrap(rule, "world_rule")}`).join("\n")}
${storyStateSection}

${chapterIndex === 1 ? `第一章节拍：
${bible.first_chapter_beats.map((beat) => `${beat.beat}. ${wrap(beat.scene, "beat_scene")}：${wrap(beat.purpose, "beat_purpose")}`).join("\n")}` : context.beatSheet && context.beatSheet.beats.length > 0
      ? `本章节拍（按此推进）：\n${context.beatSheet.beats.map((b) => `${b.index}. ${wrap(b.description, "beat_description")}`).join("\n")}`
      : `本章写作要求：
- 以"章节大纲"为主，不套用第一章节拍。
- 承接近 ${context.previousSummaries.length} 章摘要，推进新的冲突或发现。
- 保持章节结尾有继续阅读的牵引。`}

已有正文（如有，续写并融合，不要重复）：
${existingContent?.trim() ? wrap(existingContent.trim(), "existing_content") : "无"}

现在开始输出章节正文。`,
    },
  ];
}
