import type { ChatMessage } from "../client";
import type { ChapterContext } from "../../agent/chapterContext";

export interface CriticIssue {
  type: "character" | "world_rule" | "plot_thread" | "timeline" | "tone";
  severity: "minor" | "major" | "critical";
  description: string;
  suggestion?: string;
}

export interface CriticResult {
  consistent: boolean;
  issues: CriticIssue[];
}

export interface BuildCriticPromptInput {
  context: ChapterContext;
  chapterContent: string;
  chapterIndex: number;
}

export function buildCriticPrompt(input: BuildCriticPromptInput): ChatMessage[] {
  const { context, chapterContent, chapterIndex } = input;
  const bible = context.bible;
  const protagonist = bible.characters.find((c) => c.role === "protagonist");

  const previousContext = context.previousSummaries.map((s) => s.summary).join("\n\n");

  let stateSection = "";
  if (context.storyState) {
    const lines: string[] = ["当前运行时状态："];
    if (context.storyState.characters) {
      for (const char of context.storyState.characters) {
        const parts: string[] = [];
        if (char.current_location) parts.push(`位置：${char.current_location}`);
        if (char.current_goal) parts.push(`目标：${char.current_goal}`);
        if (char.emotional_state) parts.push(`情绪：${char.emotional_state}`);
        lines.push(`- ${char.name}：${parts.join("；")}`);
      }
    }
    if (context.storyState.plot_threads) {
      for (const thread of context.storyState.plot_threads) {
        lines.push(`- 线索「${thread.title}」状态：${thread.status}`);
      }
    }
    stateSection = lines.join("\n");
  }

  return [
    {
      role: "system",
      content: `你是小说审校助手。你的任务是检查一章草稿与 Story Bible、世界规则和前文状态是否一致。

检查维度：
1. 角色行为：角色是否做出了与其性格/动机/当前状态矛盾的行为。
2. 世界规则：是否违反了 Bible 中定义的世界规则。
3. 线索推进：活跃线索的状态是否被正确推进或保持。
4. 时间线：事件顺序是否与 timeline 矛盾。
5. 基调：是否偏离了小说设定的基调。

严重度定义：
- critical：必须修改，否则会破坏读者信任（如主角性格突变、核心规则被违反）。
- major：建议修改，但不影响主线理解（如次要线索被忽略）。
- minor：可接受的小偏差（如语气略有不一致）。

输出严格 JSON：
{"consistent": true}  — 无明显问题
{"consistent": false, "issues": [{"type": "character|world_rule|plot_thread|timeline|tone", "severity": "minor|major|critical", "description": "问题描述", "suggestion": "修改建议"}]}`,
    },
    {
      role: "user",
      content: `## Story Bible 设定
小说标题：${bible.meta.suggested_title}

主角：
- 姓名：${protagonist?.name ?? "主角"}
- 性格：${protagonist?.personality ?? "待定"}
- 动机：${protagonist?.motivation ?? "待定"}

世界规则：
${bible.world.rules.map((r) => `- ${r}`).join("\n")}

${stateSection}

## 前文摘要
${previousContext.trim() || "（无）"}

## 本章草稿（第 ${chapterIndex} 章）
${chapterContent.slice(0, 4000)}

请检查本章草稿的一致性问题，输出 JSON。`,
    },
  ];
}
