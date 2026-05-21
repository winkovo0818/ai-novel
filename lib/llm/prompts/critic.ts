import type { ChatMessage } from "@/lib/llm/client";
import type { ChapterContext } from "@/lib/agent/chapterContext";
import type { CriticIssue } from "@/lib/agent/contracts";
import { PROMPT_SAFETY_PREAMBLE, wrap, wrapOr } from "@/lib/llm/promptSafety";

export type { CriticIssue };

export interface CriticResult {
  consistent: boolean;
  issues: CriticIssue[];
}

export interface BuildCriticPromptInput {
  context: ChapterContext;
  chapterContent: string;
  chapterIndex: number;
  isRevision?: boolean;
}

export function buildCriticPrompt(input: BuildCriticPromptInput): ChatMessage[] {
  const { context, chapterContent, chapterIndex, isRevision } = input;
  const bible = context.bible;
  const protagonist = bible.characters.find((c) => c.role === "protagonist");

  const previousContext = context.previousSummaries.map((s) => wrap(s.summary, "previous_summary")).join("\n\n");

  // M3.x: critic now sees the same factual basis as the writer — novel/volume
  // summaries, retrieved memories, the full story state. Asymmetric context
  // was the root cause of revision churn: writer justified a beat using a
  // memory chunk or plot-thread note the critic couldn't see, so the critic
  // kept flagging "lacks setup / out of character" every pass.
  const tieredSummarySection: string[] = [];
  if (context.novelSummary) {
    tieredSummarySection.push(`全书梗概：\n${wrap(context.novelSummary, "previous_summary")}`);
  }
  if (context.volumeSummary) {
    tieredSummarySection.push(`当前卷摘要：\n${wrap(context.volumeSummary, "previous_summary")}`);
  }
  const tieredSummaryText = tieredSummarySection.length > 0
    ? tieredSummarySection.join("\n\n")
    : "";

  const memorySection = context.retrievedMemories.length > 0
    ? `## 相关历史片段（写作时检索到的，用于判断本章动作是否有前置铺垫）\n${context.retrievedMemories.map((m) => `- [来源：${m.source}] ${wrap(m.text, "memory_snippet")}`).join("\n")}`
    : "";

  let stateSection = "";
  if (context.storyState) {
    const lines: string[] = ["## 当前运行时状态"];
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
        const note = thread.notes ? `：${wrap(thread.notes, "plot_thread")}` : "";
        lines.push(`- ${wrap(thread.title, "plot_thread")}（${thread.status}）${note}`);
      }
    }
    if (context.storyState.timeline && context.storyState.timeline.length > 0) {
      lines.push("\n时间线（最近事件）：");
      // Cap to last 10 to avoid blowing the prompt on long novels.
      for (const ev of context.storyState.timeline.slice(-10)) {
        lines.push(`- 第 ${ev.chapter_index} 章：${wrap(ev.event, "story_state")}${ev.impact ? `；影响：${wrap(ev.impact, "story_state")}` : ""}`);
      }
    }
    stateSection = lines.join("\n");
  }

  return [
    {
      role: "system",
      content: `你是小说审校助手。你的任务是检查一章草稿与 Story Bible、世界规则和前文状态是否一致。

${PROMPT_SAFETY_PREAMBLE}

检查维度：
1. 角色行为：角色是否做出了与其性格/动机/当前状态矛盾的行为。
2. 世界规则：是否违反了 Bible 中定义的世界规则。
3. 线索推进：活跃线索的状态是否被正确推进或保持。
4. 时间线：事件顺序是否与 timeline 矛盾。
5. 基调：是否偏离了小说设定的基调。

判定原则（重要）：
- 你看到的"相关历史片段"和"运行时状态"就是写手写本章时依据的上下文。如果某个动作或设定能在这些资料里找到铺垫或合理化依据，**不要因为"本章没再复述一遍铺垫"就判为突兀**——读者会读到前文，这不是缺陷。
- 主观判断类问题（"显得突兀""略显鲁莽""可以更细腻"）一律降为 minor 或不报。critical / major 只留给**真正能在前文/Bible/状态里找到事实矛盾**的情况。
- 角色性格不是单一维度。"智慧型"角色在极端绝境也可以做出激进选择——只要章节内或前文有任意合理铺垫即可，不必要求每章都重新证明。
- 找不到事实矛盾就输出 \`{"consistent": true}\`。不要为了凑数硬挑问题。

严重度定义：
- critical：能在 Bible/世界规则/timeline/已知秘密里指出明确事实矛盾。
- major：与已有 plot_thread 状态或角色当前 goal/location 存在硬冲突。
- minor：风格或细腻度建议，**不阻塞**——能少报就少报。${isRevision ? `

特别说明：本章节已经按审校意见修订过一次。请大幅降低敏感度——只有 truly critical 或 genuinely major 的**新**事实矛盾才应标记。不要重复报告上次已指出且本次修订已明显改善的同一问题。若修订稿合理解决了之前的问题，且没有引入新的 critical/major 矛盾，**直接输出 \`{"consistent": true}\`**。` : ""}

输出严格 JSON：
{"consistent": true}  — 无明显问题
{"consistent": false, "issues": [{"type": "character|world_rule|plot_thread|timeline|tone", "severity": "minor|major|critical", "description": "问题描述", "suggestion": "修改建议"}]}`,
    },
    {
      role: "user",
      content: `## Story Bible 设定
小说标题：${wrap(bible.meta.suggested_title, "outline_title")}

主角：
- 姓名：${wrapOr(protagonist?.name, "character_name", "主角")}
- 性格：${wrapOr(protagonist?.personality, "character_personality", "待定")}
- 动机：${wrapOr(protagonist?.motivation, "character_motivation", "待定")}

世界设定：
${wrap(bible.world.setting_summary, "world_setting")}

世界规则：
${bible.world.rules.map((r) => `- ${wrap(r, "world_rule")}`).join("\n")}

${tieredSummaryText ? `## 跨章节摘要\n${tieredSummaryText}\n` : ""}
## 前文摘要
${previousContext.trim() || "（无）"}

${memorySection ? `${memorySection}\n` : ""}
${stateSection}

## 本章草稿（第 ${chapterIndex} 章）
${wrap(chapterContent.slice(0, 12000), "chapter_content")}

请检查本章草稿的一致性问题，输出 JSON。记住：找不到事实矛盾就输出 consistent:true，不要为了凑数挑刺。`,
    },
  ];
}
