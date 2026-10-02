import type { ChatMessage } from "@/lib/llm/client";
import type { BibleDraft } from "@/lib/validation/schemas";
import type { QualityChapterInput } from "@/lib/evals/novelQuality";
import { PROMPT_SAFETY_PREAMBLE, wrap } from "@/lib/llm/promptSafety";

/**
 * P2 LLM Judge（锚定量表）。judge 与启发式评分器/critic 的分工：
 *  - 启发式：廉价灾难检测（词汇代理，误杀率高，已降级）；
 *  - critic：单章语义一致性（既定事实/称谓/逻辑链）；
 *  - judge：窗口级**语义与宏观结构**评价——前两者看不见的区域。三个宏观维度
 *    直接来自两次人工通读的编辑判断：线索兑现（答案应带来理解而非下一件
 *    东西）、局面改变（发现之后处境必须真正变化）、阶段推进（铺垫应通向
 *    不可逆转折，而非重复试探节拍）。
 */
export interface JudgePromptInput {
  window: QualityChapterInput[];
  bible: BibleDraft;
  /**
   * 悬置期待账本（2026-10-03 裁决结论：单窗口看不见延宕循环，judge 高估腻章的
   * 根因）。列出当前章仍未回收的伏笔/线索及其已悬置章数，让 judge 把「又推开了
   * 一个答案」放在账本上下文里评分。
   */
  openExpectations?: ReadonlyArray<{ title: string; kind: "伏笔" | "线索"; ageChapters: number; status: string }>;
}

const SHARED_DIMENSIONS: Array<[string, string, string, string]> = [
  // key, 定义, 低分锚(≤3), 高分锚(≥8)
  ["continuity", "窗口内章节承接：开头接前章落点，无断裂、无重演", "章际断裂或重复演已发生情节", "承接自然且有新推进"],
  ["logic", "因果链：目标→阻碍→行动→结果可读，行动有当场理由", "事件罗列，行动靠巧合或外部指令", "每章因果自足，选择有代价"],
  ["character_consistency", "人物言行与动机/已知信息一致（含知识边界）", "人物忘记已知信息或行为无据", "全部言行可由前文解释"],
  ["plot_progress", "实质推进：每章至少一件改变处境的事", "多数篇幅在确认已知/氛围等待", "每章都有不可撤回的新事实"],
  ["world_rules", "设定一致：规则/地点/物品属性不漂移", "出现与既定设定冲突的描写", "完全吻合"],
  ["ai_voice", "AI 腔：套话/模板句/工整排比/解释腔", "多处可数信号", "读感接近人写"],
  ["prose_readability", "文字质量：具体物象、句式错落、对白自然", "抽象情绪词堆砌、句式单一", "画面感强、节奏有变化"],
];

const MACRO_DIMENSIONS: Array<[string, string, string, string]> = [
  // 锚点文案来自 2026-10-03 人工裁决 7 个分歧章的定性：「腻的不是词汇重复，而是
  // 『再探一次—得到半个答案—回去收好—大事再说』的结构循环」。
  ["clue_payoff", "线索兑现：读者拿到答案时是否『明白了一件重要的事』，还是只得到下一件要找的东西", "逼近答案又推开（『到时候你就知道』式延宕）；搭起行动期待却只交付新疑问；反复确认读者已理解的事", "答案兑现理解、旧期待被关闭；准备终于转化为释放"],
  ["situation_change", "局面改变：发现秘密/冒险之后，力量关系或行动条件是否真正变化", "『大家知道他有问题，但暂时照旧』；新知识只被收好备用，处境未变", "当场身体危险有明确空间与代价；真实不可逆的代价落地；敌方控制实际收紧、威胁落成事实"],
  ["arc_progress", "阶段推进：铺垫在通向不可逆转折，还是在重复同类试探/验证/等待节拍", "『再探一次—半个答案—收好—大事再说』结构循环；准备工作层层加码而高潮不释放", "明确朝一次有代价的转折推进，节奏收紧"],
];

export const JUDGE_DIMENSION_KEYS = [
  ...SHARED_DIMENSIONS.map(([key]) => key),
  ...MACRO_DIMENSIONS.map(([key]) => key),
] as const;

function dimensionLines(dims: Array<[string, string, string, string]>): string {
  return dims.map(([key, def, low, high]) => `- ${key}：${def}。低分锚（≤3）：${low}；高分锚（≥8）：${high}。`).join("\n");
}

export function buildJudgePrompt(input: JudgePromptInput): ChatMessage[] {
  const windowText = input.window
    .map((c) => `### 第 ${c.chapterIndex} 章《${c.title}》\n${wrap(c.content.slice(0, 9000), "chapter_content")}`)
    .join("\n\n");
  return [
    {
      role: "system",
      content: `你是小说质量评审（judge）。对给定窗口（连续数章）按锚定量表打分。你评价的是**语义与宏观结构**，不是词汇统计——与自动评分器互补。

${PROMPT_SAFETY_PREAMBLE}

评分维度（前 7 个与自动评分器可比，后 3 个为宏观结构专属）：
${dimensionLines(SHARED_DIMENSIONS)}

${dimensionLines(MACRO_DIMENSIONS)}

评分纪律：
- 每个维度 0-10 分，**必须引用窗口正文原文片段作为证据**（evidence 字段，逐字摘录 ≤40 字）；无证据的维度记 0 分并在 evidence 写「无证据」。
- 打分对标锚点描述，避免中庸聚集；拿不准往锚点靠，不往 6 分靠。
- 只依据给定材料，不脑补窗口外的剧情。

输出严格 JSON：
{"scores":[{"key":"<维度名>","score":<0-10>,"evidence":"<原文摘录或无证据>"}],"summary":"≤80字总评","confidence":"high|medium|low"}
scores 必须恰好包含全部 ${JUDGE_DIMENSION_KEYS.length} 个维度。`,
    },
    {
      role: "user",
      content: `## 作品设定摘要
${wrap(input.bible.world.setting_summary, "world_setting")}
主角：${wrap(input.bible.characters.find((c) => c.role === "protagonist")?.name ?? "未知", "character_name")}

${(input.openExpectations ?? []).length > 0 ? `## 悬置期待账本（截至上一章仍未回收，ageChapters=已悬置章数）\n评分线索兑现与阶段推进时必须对照此账本：答案又被推开的章，即便单章语义完整也应压低 clue_payoff/arc_progress。\n${input.openExpectations!.map((e) => `- [${e.kind}]「${e.title}」悬置 ${e.ageChapters} 章（${e.status}）`).join("\n")}\n\n` : ""}## 评审窗口（共 ${input.window.length} 章）
${windowText}

请按锚定量表输出 JSON。`,
    },
  ];
}
