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
  /**
   * Mystery / suspense / detective sub-genres. When true the critic gets an
   * extra checklist (clue retention, misdirection cadence, reveal pacing)
   * so logic-chain regressions don't silently slip through.
   */
  isMystery?: boolean;
}

export function buildCriticPrompt(input: BuildCriticPromptInput): ChatMessage[] {
  const { context, chapterContent, chapterIndex, isRevision, isMystery } = input;
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
      content: `你是小说审校助手。你的任务是检查一章草稿与 Story Bible、世界规则和前文状态是否一致，同时把握章节的逻辑链与文笔质量。

${PROMPT_SAFETY_PREAMBLE}

检查维度：
1. 角色行为：角色是否做出了与其性格/动机/当前状态矛盾的行为。
2. 世界规则：是否违反了 Bible 中定义的世界规则。
3. 线索推进：活跃线索的状态是否被正确推进或保持。
4. 时间线：事件顺序是否与 timeline 矛盾。
5. 基调：是否偏离了小说设定的基调。
6. 逻辑链 (logic_chain)：本章能否读出明确的"目标 → 阻碍 → 行动 → 结果"主链？结尾是否带来一个可记录的状态变化（新线索 / 关系变化 / 位置变化 / 道具归属 / 敌人反应 / 伤势 / 世界规则确认 之一）？
7. 文笔质量 (prose_quality)：是否出现以下**可计数**信号——句首重复（相邻 5 段内 ≥3 次相同或近似开头，如"他X了…他Y了…他Z了"）、三连排比 / 列举（一句内并列 ≥3 项，如"这构成了一个…一种…一道…"）、聊天机器人式套话（"如果你愿意""可以认为""值得注意的是"等）、模板化结尾、AI 高频副词堆叠。这些是客观信号，数得出就记为 prose_quality。

判定原则（重要）：
- **两套不同的判定尺度，不要混用**：
  - **主观一致性类**（character / world_rule / plot_thread / timeline / tone）：从严克制。你看到的"相关历史片段"和"运行时状态"就是写手写本章时依据的上下文——如果某个动作或设定能在这些资料里找到铺垫或合理化依据，**不要因为"本章没再复述一遍铺垫"就判为突兀**（读者会读到前文）。主观判断类（"显得突兀""略显鲁莽""可以更细腻"）一律降为 minor 或不报；critical / major 只留给**真正能在前文/Bible/状态里找到事实矛盾**的情况。角色性格不是单一维度，"智慧型"角色在极端绝境也可以做出激进选择，只要章节内或前文有任意合理铺垫即可。
  - **可计数客观类**（logic_chain / prose_quality）：**反向操作——数得出信号就必须报**，不受上面"少报""怕凑数"原则约束。这两类只看本章文本本身（不依赖跨章上下文），漏报它们正是当前 critic 的主要短板，请主动检查、命中即报。
- 仅当**既找不到事实矛盾、也数不出任何 logic_chain / prose_quality 信号**时，才输出 \`{"consistent": true}\`。

严重度定义：
- critical：能在 Bible/世界规则/timeline/已知秘密里指出明确事实矛盾。
- major：与已有 plot_thread 状态或角色当前 goal/location 存在硬冲突；或 **logic_chain 整章由并列事件短句堆叠、几乎无因果/转折连接词（因为/所以/于是/为了/导致…）、读不出主角动机与结果链**；或 **prose_quality 多类信号叠加（句首重复 / 三连排比 / 套话 中 ≥2 类同时出现，或单类极密集）**。
- minor：单一、轻度的风格建议，或 logic_chain"目标 → 阻碍 → 行动 → 结果"只缺一环。**minor 也要照常报出（consistent:false），只是不强制触发整章重写**；"能少报就少报"只适用于主观一致性类，不适用于 prose_quality / logic_chain。${isMystery ? `

悬疑 / 推理 / 侦探题材专属（**额外**检查，命中即报，沿用上面的严重度梯度）：
- 线索回收：本章引入的新线索是否在 Bible/state/plot_thread 里能找到对应的伏笔或后续承接？无承接但已暗示重要性 → major。
- 误导节奏：是否过早暴露真凶/全部真相，让后续章节失去张力？整章揭穿核心谜底 → major。
- 信息分类：是否清晰区分"已知 / 未知 / 误导"三类信息？整章把三类混在一起、读者无法判断主角立场 → minor 升 major。
- 主角认知漂移：主角是否反复想同一条线索（presence_penalty 信号）？同一线索内心独白 ≥3 次 → minor。` : ""}${isRevision ? `

特别说明：本章节已经按审校意见修订过一次。请大幅降低敏感度——只有 truly critical 或 genuinely major 的**新**事实矛盾才应标记。不要重复报告上次已指出且本次修订已明显改善的同一问题。若修订稿合理解决了之前的问题，且没有引入新的 critical/major 矛盾，**直接输出 \`{"consistent": true}\`**。` : ""}

输出严格 JSON：
{"consistent": true}  — 无明显问题
{"consistent": false, "issues": [{"type": "character|world_rule|plot_thread|timeline|tone|logic_chain|prose_quality", "severity": "minor|major|critical", "description": "问题描述", "suggestion": "修改建议"}]}`,
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

请检查本章草稿的一致性、逻辑链与文笔质量，输出 JSON。记住：character / tone 等主观类从严克制；logic_chain / prose_quality 是可计数客观类，数得出信号就必须报。两类都没有时才输出 consistent:true。`,
    },
  ];
}
