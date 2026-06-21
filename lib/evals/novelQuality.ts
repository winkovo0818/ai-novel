import type { BibleDraft } from "@/lib/validation/schemas";
import { collectAiWritingTraceHits, type AiWritingTraceHit } from "@/lib/llm/prompts/humanStyle";
import { AI_SIGNATURE_CATEGORIES, type CleanupHit } from "@/lib/llm/writerOutputCleanup";

function isAiSignatureHit(hit: CleanupHit): boolean {
  return AI_SIGNATURE_CATEGORIES.includes(hit.category);
}

export interface QualityChapterInput {
  chapterIndex: number;
  title: string;
  content: string;
  outlineSummary?: string;
  /**
   * AI-signature cleanup rule hits on the *raw* writer output (before
   * {@link cleanupWriterOutput} scrubbed it). The scored `content` is already
   * clean, so this is the only window into how much AI residue the model
   * emitted at the source. Optional: only real-generation eval paths populate
   * it; fixture fallbacks omit it so the CI baseline stays stable.
   */
  rawCleanupHits?: CleanupHit[];
}

export interface MetricResult {
  key:
    | "continuity"
    | "logic"
    | "character_consistency"
    | "plot_progress"
    | "world_rules"
    | "ai_voice"
    | "prose_readability";
  label: string;
  score: number;
  max: number;
  findings: string[];
  warnings: string[];
}

export interface NovelQualityReport {
  generatedAt: string;
  fixtureId: string;
  title: string;
  chapterCount: number;
  totalChars: number;
  overallScore: number;
  maxScore: number;
  level: "excellent" | "good" | "needs_work" | "weak";
  metrics: MetricResult[];
  chapterSummaries: Array<{
    chapterIndex: number;
    title: string;
    chars: number;
    sentenceCount: number;
    dialogueCount: number;
    excerpt: string;
  }>;
  riskFlags: string[];
  recommendations: string[];
  aiTraceHits: AiWritingTraceHit[];
  /** Aggregated AI-signature cleanup hits on raw writer output (empty unless the eval path supplied them). */
  rawCleanupHits: CleanupHit[];
}

interface NovelQualityInput {
  generatedAt?: string;
  fixtureId: string;
  bible: BibleDraft;
  chapters: QualityChapterInput[];
}

interface TokenStats {
  people: string[];
  places: string[];
  rules: string[];
  objects: string[];
  plotTerms: string[];
}

const LOGIC_CUES = [
  "因为",
  "所以",
  "于是",
  "因此",
  "为了",
  "只要",
  "否则",
  "如果",
  "既然",
  "才",
  "却",
  "但",
  "然而",
  "反而",
  "决定",
  "发现",
  "确认",
];

const CAUSAL_HOOK_RE = /因为|所以|于是|因此|为了|只要|否则|如果|既然|不然|免得|要不|但|却|然而|反而|偏偏|代价|换来|赌/;
const GOAL_OR_DECISION_RE = /决定|必须|不能|只能|不想|不敢|要去|得去|先|查清|活下|活过|反制|确认|试探|合作|交易|藏|带着|留下|赌|换/;
const RESULT_OR_PRICE_RE = /发现|确认|知道|拿到|失去|暴露|留下|带走|藏进|交给|亮起|熄灭|受伤|反噬|改口|收起笑|听见|看见|记住|过了|胜|失败|代价|风险/;

const UNMOTIVATED_CUES = [
  "毫无理由",
  "莫名其妙",
  "突然不想",
  "忽然觉得自己不想",
  "没有任何计划",
  "随手递给",
  "立刻改认",
];

const PLOT_ACTION_CUES = [
  "发现",
  "决定",
  "确认",
  "反制",
  "潜入",
  "逃离",
  "考核",
  "交易",
  "约定",
  "暴露",
  "拆穿",
  "夺取",
  "追查",
  "留下",
];

const STATE_CHANGE_CUES = [
  "发现",
  "确认",
  "知道",
  "拿到",
  "夺取",
  "失去",
  "交给",
  "藏进",
  "带走",
  "归还",
  "暴露",
  "留下",
  "约定",
  "反噬",
  "受伤",
  "断裂",
  "亮起",
  "熄灭",
  "变成",
  "改口",
  "收起笑",
  "记住",
  "听见",
];

const DIALOGUE_RE = /[“"][^”"]{1,80}[”"]/g;
const DASH_TRACE_RE = /[—–]|--/g;
const AI_VOCAB_TRACE_RE = /极其|几乎|仿佛|似乎|宛如|犹如|隐约|依稀|轻轻|缓缓|慢慢|悄悄|不约而同|不由得|与此同时|不知不觉|不禁|霎时|刹那|一时间/g;

// ── 题材无关常量 ─────────────────────────────────────────────
// 这些信号词与具体小说无关，对任何题材都成立，所以写死是安全的。本书专有名词
// （角色名、地点、设定物件）一律从 Bible 动态生成（见 buildTokenStats / TokenStats），
// 不再硬编码，否则换一部小说就会失效甚至误判。

/** 承接上一章的通用时间/指代提示词（题材无关）。本书专名桥另从 tokenStats 动态拼接。 */
const GENERIC_BRIDGE_CUES = ["前一", "刚才", "方才", "昨夜", "三日", "上一", "之前", "那天", "当晚", "次日"];
/** 可感知的通用感官/身体名词（题材无关），用于判断正文是否有具体物象支撑画面。 */
const GENERIC_SENSORY_NOUNS = ["手", "汗", "泥", "水", "火", "血", "喉", "风", "光", "灰", "烟", "雨", "门", "灯"];
/** 句首豁免的通用代词/虚词（题材无关）。角色名豁免从 tokenStats.people 动态加入。 */
const GENERIC_START_PREFIXES = ["他", "她", "它", "那", "这", "门", "雨", "风"];
/** 可验证状态变化的通用结果动词（题材无关）。 */
const GENERIC_RESULT_VERBS = /发现|确认|暴露|留下|拿到|失去|反制|受伤|亮起|熄灭|改口|听见/;
/** 可追踪的通用抽象名词（题材无关）。本书设定物件另从 tokenStats.objects 动态加入。 */
const GENERIC_TRACKABLE_NOUNS = ["线索", "关系", "位置", "道具", "敌人", "伤", "血", "规则", "秘密", "证据"];

function aggregateAiSignatureHits(chapters: QualityChapterInput[]): CleanupHit[] {
  const byId = new Map<string, CleanupHit>();
  for (const chapter of chapters) {
    for (const hit of chapter.rawCleanupHits ?? []) {
      if (!isAiSignatureHit(hit)) continue;
      const existing = byId.get(hit.id);
      if (existing) existing.count += hit.count;
      else byId.set(hit.id, { ...hit });
    }
  }
  return [...byId.values()].sort((a, b) => b.count - a.count);
}

export function evaluateNovelQuality(input: NovelQualityInput): NovelQualityReport {
  const chapters = input.chapters
    .filter((chapter) => chapter.content.trim())
    .sort((a, b) => a.chapterIndex - b.chapterIndex);
  const tokenStats = buildTokenStats(input.bible);
  const aiTraceHits = collectAiWritingTraceHits(chapters.map((chapter) => chapter.content).join("\n"));
  const metrics = [
    evaluateContinuity(chapters, tokenStats),
    evaluateLogic(chapters, tokenStats),
    evaluateCharacterConsistency(input.bible, chapters, tokenStats),
    evaluatePlotProgress(chapters, tokenStats),
    evaluateWorldRules(input.bible, chapters, tokenStats),
    evaluateAiVoice(chapters, aiTraceHits, tokenStats),
    evaluateProseReadability(chapters, tokenStats),
  ];

  const overallScore = metrics.reduce((sum, metric) => sum + metric.score, 0);
  const maxScore = metrics.reduce((sum, metric) => sum + metric.max, 0);
  const riskFlags = buildRiskFlags(metrics, chapters);
  const recommendations = buildRecommendations(metrics, chapters);

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    fixtureId: input.fixtureId,
    title: input.bible.meta.suggested_title,
    chapterCount: chapters.length,
    totalChars: chapters.reduce((sum, chapter) => sum + chapter.content.length, 0),
    overallScore,
    maxScore,
    level: scoreLevel(overallScore, maxScore),
    metrics,
    chapterSummaries: chapters.map((chapter) => ({
      chapterIndex: chapter.chapterIndex,
      title: chapter.title,
      chars: chapter.content.length,
      sentenceCount: splitSentences(chapter.content).length,
      dialogueCount: countMatches(chapter.content, DIALOGUE_RE),
      excerpt: normalizeWhitespace(chapter.content).slice(0, 140),
    })),
    riskFlags,
    recommendations,
    aiTraceHits,
    rawCleanupHits: aggregateAiSignatureHits(chapters),
  };
}

function evaluateContinuity(chapters: QualityChapterInput[], tokens: TokenStats): MetricResult {
  const findings: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  if (chapters.length >= 3) {
    score += 2;
    findings.push(`连续章节数 ${chapters.length}，足够观察承接。`);
  } else {
    warnings.push(`连续章节数 ${chapters.length} 偏少，无法稳定判断长篇连续性。`);
  }

  const repeatedTerms = chapters.slice(1).filter((chapter) => {
    const prev = chapters.find((item) => item.chapterIndex === chapter.chapterIndex - 1);
    if (!prev) return false;
    const previousTerms = extractImportantTerms(prev.content, tokens);
    return previousTerms.some((term) => chapter.content.includes(term));
  });
  if (repeatedTerms.length >= Math.max(1, chapters.length - 2)) {
    score += 2;
    findings.push("多数章节会复用前章关键人物、地点或线索。");
  } else {
    warnings.push("相邻章节之间关键名词复现不足，读起来可能像片段拼接。");
  }

  const outlineHits = chapters.filter((chapter) =>
    overlapCount(extractTerms(chapter.outlineSummary ?? ""), extractTerms(chapter.content)) >= 2,
  );
  if (outlineHits.length >= Math.ceil(chapters.length * 0.6)) {
    score += 2;
    findings.push("章节正文多数能落到对应大纲关键词。");
  } else {
    warnings.push("部分章节正文与大纲摘要关键词重合较低，可能偏题或推进不够明确。");
  }

  const duplicateSimilarity = maxPairSimilarity(chapters.map((chapter) => chapter.content));
  if (duplicateSimilarity < 0.72) {
    score += 2;
    findings.push(`章节之间重复度可控，最高相似度 ${formatPercent(duplicateSimilarity)}。`);
  } else {
    warnings.push(`章节之间最高相似度 ${formatPercent(duplicateSimilarity)}，有重复生成或原地打转风险。`);
  }

  const bridgeTerms = unique([...GENERIC_BRIDGE_CUES, ...tokens.objects, ...tokens.places]).filter(Boolean);
  const hasBridge = chapters.slice(1).filter((chapter) => bridgeTerms.some((term) => chapter.content.includes(term)));
  if (hasBridge.length >= Math.max(1, chapters.length - 2)) {
    score += 2;
    findings.push("后续章节存在承上启下的时间、物件或事件桥。");
  } else {
    warnings.push("后续章节缺少明确承接桥，建议增加上一章结果对本章行动的影响。");
  }

  return metric("continuity", "连续性", score, 10, findings, warnings);
}

function evaluateLogic(chapters: QualityChapterInput[], tokens: TokenStats): MetricResult {
  const findings: string[] = [];
  const warnings: string[] = [];
  let score = 0;
  const text = chapters.map((chapter) => chapter.content).join("\n");
  const cueCount = LOGIC_CUES.reduce((sum, cue) => sum + countText(text, cue), 0);
  const sentenceCount = Math.max(1, splitSentences(text).length);
  const cueDensity = cueCount / sentenceCount;

  if (cueDensity >= 0.16) {
    score += 2;
    findings.push(`因果/转折提示密度 ${cueDensity.toFixed(2)}，行动动因较容易跟上。`);
  } else if (cueDensity >= 0.06) {
    score += 1;
    findings.push(`因果/转折提示密度 ${cueDensity.toFixed(2)}，有基本提示，但仍需靠具体选择句补强。`);
  } else {
    warnings.push(`因果/转折提示密度 ${cueDensity.toFixed(2)} 偏低，剧情可能像事件罗列。`);
  }

  const unmotivatedCount = UNMOTIVATED_CUES.reduce((sum, cue) => sum + countText(text, cue), 0);
  if (unmotivatedCount === 0) {
    score += 2;
    findings.push("未命中明显的无动机跳转风险词。");
  } else {
    warnings.push(`命中 ${unmotivatedCount} 个无动机跳转风险词，需要人工复核。`);
  }

  const chaptersWithCausalHook = chapters.filter((chapter) => hasCausalHook(chapter.content));
  if (chaptersWithCausalHook.length >= Math.ceil(chapters.length * 0.7)) {
    score += 3;
    findings.push(`多数章节保留了可读的因果钩（${chaptersWithCausalHook.length}/${chapters.length}）。`);
  } else {
    warnings.push(`仅 ${chaptersWithCausalHook.length}/${chapters.length} 章有可读因果钩，关键行动的选择理由不够稳。`);
  }

  const chaptersWithGoalActionResult = chapters.filter((chapter) => hasGoalActionResultChain(chapter.content, tokens));
  if (chaptersWithGoalActionResult.length >= Math.ceil(chapters.length * 0.7)) {
    score += 2;
    findings.push(`多数章节能读出“目标 -> 行动 -> 结果”链条（${chaptersWithGoalActionResult.length}/${chapters.length}）。`);
  } else {
    warnings.push(`仅 ${chaptersWithGoalActionResult.length}/${chapters.length} 章能读出“目标 -> 行动 -> 结果”的明确链条。`);
  }

  const cliffhangerOnly = chapters.filter((chapter) => /才刚刚开始|真正的.*开始|风暴/.test(tail(chapter.content, 120)));
  if (cliffhangerOnly.length <= 1) {
    score += 1;
    findings.push("结尾没有大量依赖模板化悬念句。");
  } else {
    warnings.push("多章结尾依赖模板化悬念句，逻辑推进可能被虚假悬念替代。");
  }

  return metric("logic", "因果逻辑", score, 10, findings, warnings);
}

function hasCausalHook(text: string): boolean {
  const causalSentenceCount = splitSentences(text).filter((sentence) => CAUSAL_HOOK_RE.test(sentence)).length;
  return causalSentenceCount >= 2 && GOAL_OR_DECISION_RE.test(text) && RESULT_OR_PRICE_RE.test(text);
}

function hasGoalActionResultChain(text: string, tokens: TokenStats): boolean {
  return GOAL_OR_DECISION_RE.test(text) && PLOT_ACTION_CUES.some((cue) => text.includes(cue)) && hasVerifiableStateChange(text, tokens);
}

function evaluateCharacterConsistency(
  bible: BibleDraft,
  chapters: QualityChapterInput[],
  tokens: TokenStats,
): MetricResult {
  const findings: string[] = [];
  const warnings: string[] = [];
  let score = 0;
  const protagonist = bible.characters.find((character) => character.role === "protagonist");
  const antagonist = bible.characters.find((character) => character.role === "antagonist");
  const text = chapters.map((chapter) => chapter.content).join("\n");

  if (protagonist && text.includes(protagonist.name)) {
    score += 2;
    findings.push(`主角「${protagonist.name}」在连续样本中稳定出现。`);
  } else {
    warnings.push("主角没有稳定出现。");
  }

  const motivationTerms = extractTerms(`${protagonist?.goals ?? ""} ${protagonist?.motivation ?? ""}`);
  if (overlapCount(motivationTerms, extractTerms(text)) >= 3) {
    score += 3;
    findings.push("主角目标/动机关键词能在正文中回响。");
  } else {
    warnings.push("主角目标/动机在正文中回响不足，人物可能只是在被剧情推着走。");
  }

  if (antagonist && text.includes(antagonist.name)) {
    score += 1;
    findings.push(`反派或压力源「${antagonist.name}」已进入样本。`);
  } else if (chapters.length <= 3) {
    score += 1;
    findings.push("样本偏开篇，反派暂未直接登场可接受。");
  } else {
    warnings.push("连续样本中主要反派/压力源存在感不足。");
  }

  const contradictionHits = UNMOTIVATED_CUES.filter((cue) => text.includes(cue));
  if (contradictionHits.length === 0) {
    score += 2;
    findings.push("未发现明显违背主角核心动机的表层信号。");
  } else {
    warnings.push(`疑似人物动机冲突：${contradictionHits.join("、")}。`);
  }

  const namedPeople = tokens.people.filter((name) => text.includes(name));
  if (namedPeople.length >= Math.min(3, tokens.people.length)) {
    score += 2;
    findings.push(`核心角色覆盖 ${namedPeople.length}/${tokens.people.length}。`);
  } else {
    warnings.push(`核心角色覆盖 ${namedPeople.length}/${tokens.people.length}，人物关系推进不足。`);
  }

  return metric("character_consistency", "人物一致性", score, 10, findings, warnings);
}

function evaluatePlotProgress(chapters: QualityChapterInput[], tokens: TokenStats): MetricResult {
  const findings: string[] = [];
  const warnings: string[] = [];
  let score = 0;
  const text = chapters.map((chapter) => chapter.content).join("\n");
  const actionCount = PLOT_ACTION_CUES.reduce((sum, cue) => sum + countText(text, cue), 0);

  if (actionCount >= chapters.length * 2) {
    score += 3;
    findings.push(`剧情动作/发现类词出现 ${actionCount} 次，推进感较明确。`);
  } else {
    warnings.push(`剧情动作/发现类词仅 ${actionCount} 次，可能氛围多于推进。`);
  }

  const chapterWithResult = chapters.filter((chapter) => hasVerifiableStateChange(chapter.content, tokens));
  if (chapterWithResult.length >= Math.ceil(chapters.length * 0.7)) {
    score += 3;
    findings.push(`多数章节有可记录的结果或状态变化（${chapterWithResult.length}/${chapters.length}）。`);
  } else {
    warnings.push(`仅 ${chapterWithResult.length}/${chapters.length} 章有可记录状态变化，后续 Story State 难更新。`);
  }

  const plotTermsHit = tokens.plotTerms.filter((term) => text.includes(term));
  if (plotTermsHit.length >= Math.min(4, tokens.plotTerms.length)) {
    score += 2;
    findings.push(`主线关键词覆盖 ${plotTermsHit.length}/${tokens.plotTerms.length}。`);
  } else {
    warnings.push(`主线关键词覆盖 ${plotTermsHit.length}/${tokens.plotTerms.length}，主线存在感偏弱。`);
  }

  const uniqueChapterStarts = new Set(chapters.map((chapter) => normalizeWhitespace(chapter.content).slice(0, 18))).size;
  if (uniqueChapterStarts === chapters.length) {
    score += 2;
    findings.push("章节开头没有明显复制模板。");
  } else {
    warnings.push("章节开头存在重复模板，影响连续阅读的新鲜感。");
  }

  return metric("plot_progress", "剧情推进", score, 10, findings, warnings);
}

function evaluateWorldRules(
  bible: BibleDraft,
  chapters: QualityChapterInput[],
  tokens: TokenStats,
): MetricResult {
  const findings: string[] = [];
  const warnings: string[] = [];
  let score = 0;
  const text = chapters.map((chapter) => chapter.content).join("\n");
  const rulesHit = tokens.rules.filter((rule) => rule.length >= 2 && text.includes(rule));

  if (rulesHit.length > 0 || bible.world.rules.some((rule) => overlapCount(extractTerms(rule), extractTerms(text)) >= 2)) {
    score += 3;
    findings.push("正文能触及世界规则或规则关键词。");
  } else {
    warnings.push("正文几乎没有触及世界规则，设定可能停留在 Bible 里。");
  }

  const placeHits = tokens.places.filter((place) => text.includes(place));
  if (placeHits.length >= Math.min(2, tokens.places.length)) {
    score += 2;
    findings.push(`地点/势力覆盖 ${placeHits.length}/${tokens.places.length}。`);
  } else {
    warnings.push(`地点/势力覆盖 ${placeHits.length}/${tokens.places.length}，舞台感偏弱。`);
  }

  if (!/认主.*改认|随意转移|无视.*延迟|直接伤害船员|无需签名/.test(text)) {
    score += 3;
    findings.push("未命中常见世界规则硬冲突信号。");
  } else {
    warnings.push("命中世界规则硬冲突信号，需要人工复核。");
  }

  const worldObjectHits = tokens.objects.filter((object) => text.includes(object));
  if (worldObjectHits.length >= 1 || placeHits.length >= 2) {
    score += 2;
    findings.push("样本包含可追踪的设定物件或稳定舞台。");
  } else {
    warnings.push("缺少可追踪的设定物件，长篇记忆抓手不足。");
  }

  return metric("world_rules", "世界规则", score, 10, findings, warnings);
}

function evaluateAiVoice(chapters: QualityChapterInput[], aiTraceHits: AiWritingTraceHit[], tokens: TokenStats): MetricResult {
  const findings: string[] = [];
  const warnings: string[] = [];
  let score = 10;
  const text = chapters.map((chapter) => chapter.content).join("\n");
  const traceCount = aiTraceHits.reduce((sum, hit) => sum + hit.count, 0);
  const dashCount = countMatches(text, DASH_TRACE_RE);
  const aiVocabCount = countMatches(text, AI_VOCAB_TRACE_RE);
  const paragraphLengths = chapters.flatMap((chapter) =>
    chapter.content
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim().length)
      .filter((length) => length > 0),
  );
  const sentenceLengths = splitSentences(text).map((sentence) => sentence.length);
  const shortSentenceRatio = sentenceLengths.filter((length) => length <= 8).length / Math.max(1, sentenceLengths.length);
  const paragraphCv = coefficientOfVariation(paragraphLengths);

  if (traceCount <= Math.max(4, chapters.length * 2)) {
    findings.push(`humanizer 规则命中 ${traceCount} 次，处于可控范围。`);
  } else {
    const penalty = Math.min(5, Math.ceil((traceCount - chapters.length * 2) / 4));
    score -= penalty;
    const topHits = aiTraceHits.slice(0, 3).map((hit) => `${hit.label} ${hit.count} 次`).join("；");
    warnings.push(`humanizer 规则命中 ${traceCount} 次（${topHits}），扣 ${penalty} 分。`);
  }

  if (dashCount <= Math.max(1, chapters.length)) {
    findings.push(`破折号 ${dashCount} 次，处于可控范围。`);
  } else {
    const penalty = Math.min(2, Math.ceil((dashCount - chapters.length) / 8));
    score -= penalty;
    warnings.push(`破折号 ${dashCount} 次，扣 ${penalty} 分；建议继续把旁白破折号改成动作或句号。`);
  }

  if (aiVocabCount <= chapters.length * 2) {
    findings.push(`AI 高频词 ${aiVocabCount} 次，处于可控范围。`);
  } else {
    const penalty = Math.min(2, Math.ceil((aiVocabCount - chapters.length * 2) / 10));
    score -= penalty;
    warnings.push(`AI 高频词 ${aiVocabCount} 次，扣 ${penalty} 分；重点替换“慢慢/似乎/仿佛/缓缓”。`);
  }

  if (shortSentenceRatio >= 0.08) {
    findings.push(`短句比例 ${formatPercent(shortSentenceRatio)}，有一定句式错落。`);
  } else {
    score -= 2;
    warnings.push(`短句比例 ${formatPercent(shortSentenceRatio)} 偏低，容易显得过度工整。`);
  }

  if (paragraphCv >= 0.35) {
    findings.push(`段落长度变异系数 ${paragraphCv.toFixed(2)}，段落节奏不算机械。`);
  } else {
    score -= 2;
    warnings.push(`段落长度变异系数 ${paragraphCv.toFixed(2)} 偏低，有段段同长的 AI 味风险。`);
  }

  const repetitiveStarts = repeatedSentenceStartCount(text, tokens.people);
  if (repetitiveStarts <= 3) {
    findings.push("句首重复模式不明显。");
  } else {
    const penalty = Math.min(2, Math.ceil(repetitiveStarts / 4));
    score -= penalty;
    warnings.push(`句首重复模式 ${repetitiveStarts} 次，扣 ${penalty} 分。`);
  }

  // Raw-output cleanup pressure: how many AI-signature rules the writer tripped
  // *before* cleanup masked them. A high pre-cleanup hit rate means the prompt
  // (not the regex band-aid) is what needs fixing. Only scored when the eval
  // path supplied raw counts; fixture fallbacks omit it (keeps CI baseline stable).
  const rawChapters = chapters.filter((chapter) => Array.isArray(chapter.rawCleanupHits));
  if (rawChapters.length > 0) {
    const totalRawHits = rawChapters.reduce(
      (sum, chapter) =>
        sum + (chapter.rawCleanupHits ?? []).filter(isAiSignatureHit).reduce((s, h) => s + h.count, 0),
      0,
    );
    const avgRawHits = totalRawHits / rawChapters.length;
    if (avgRawHits < 5) {
      findings.push(`清洗前 AI 签名规则平均每章命中 ${avgRawHits.toFixed(1)} 条（< 5），写手原始输出较干净。`);
    } else {
      const penalty = Math.min(2, Math.floor(avgRawHits / 5));
      score -= penalty;
      warnings.push(`清洗前 AI 签名规则平均每章命中 ${avgRawHits.toFixed(1)} 条（≥ 5），原始输出 AI 味偏重，扣 ${penalty} 分；应从提示侧治理而非依赖清洗。`);
    }
  }

  // Shadow 统计特征（题材无关）：词汇丰富度 type-token ratio。TTR 越低 = 用词越重复
  // 单调，是机械/AI 文本的常见信号；它不依赖固定词表，换题材/换模型都成立，可在词表
  // 失效时兜底。当前以「仅记录、不扣分」的 shadow 模式接入——阈值需用第四章人工黄金集
  // 校准后再决定是否参与扣分，避免现在拍脑袋设阈值破坏既有评分基线。
  const ttr = typeTokenRatio(text);
  findings.push(`[shadow] 词汇丰富度 TTR ${ttr.toFixed(3)}（越低越单调；暂不计分，待黄金集校准）。`);

  return metric("ai_voice", "AI 味控制", Math.max(0, score), 10, findings, warnings);
}

function evaluateProseReadability(chapters: QualityChapterInput[], tokens: TokenStats): MetricResult {
  const findings: string[] = [];
  const warnings: string[] = [];
  let score = 0;
  const text = chapters.map((chapter) => chapter.content).join("\n");
  const sentenceLengths = splitSentences(text).map((sentence) => sentence.length);
  const avgSentenceLength = average(sentenceLengths);
  const dialogueCount = countMatches(text, DIALOGUE_RE);
  const totalChars = Math.max(1, text.length);
  const punctuationDensity = countMatches(text, /[，。！？；：、“”]/g) / totalChars;

  if (avgSentenceLength >= 12 && avgSentenceLength <= 38) {
    score += 3;
    findings.push(`平均句长 ${avgSentenceLength.toFixed(1)}，可读性正常。`);
  } else {
    warnings.push(`平均句长 ${avgSentenceLength.toFixed(1)} 不在理想区间。`);
  }

  if (dialogueCount >= Math.max(1, chapters.length - 1)) {
    score += 2;
    findings.push(`对白 ${dialogueCount} 处，人物互动不全靠旁白。`);
  } else {
    warnings.push(`对白仅 ${dialogueCount} 处，容易变成叙述摘要。`);
  }

  // 具体物象 = 通用感官名词（题材无关）+ 本书设定物件（从 Bible 动态生成）。
  const vividCandidates = unique([...GENERIC_SENSORY_NOUNS, ...tokens.objects]).filter(Boolean);
  const vividNouns = vividCandidates.filter((noun) => text.includes(noun));
  if (vividNouns.length >= Math.max(3, chapters.length)) {
    score += 2;
    findings.push("有足够具体物象支撑画面。");
  } else {
    warnings.push("具体物象偏少，建议增加可感知动作、物件和环境细节。");
  }

  if (punctuationDensity >= 0.06 && punctuationDensity <= 0.18) {
    score += 1;
    findings.push("标点密度正常。");
  } else {
    warnings.push(`标点密度 ${punctuationDensity.toFixed(2)} 异常，可能影响阅读流畅度。`);
  }

  const summaryLikeCount = countMatches(text, /进行|发生|出现|展开|推动|体现/g);
  if (summaryLikeCount <= chapters.length * 2) {
    score += 2;
    findings.push("摘要腔词汇不过量。");
  } else {
    warnings.push(`摘要腔词汇 ${summaryLikeCount} 次，正文可能偏梗概化。`);
  }

  return metric("prose_readability", "正文可读性", score, 10, findings, warnings);
}

function buildTokenStats(bible: BibleDraft): TokenStats {
  const people = bible.characters.map((character) => character.name);
  const places = [
    ...bible.world.geography,
    ...bible.world.factions.map((faction) => faction.name),
  ];
  const rules = bible.world.rules.flatMap(extractTerms);
  const outlineText = bible.outline.volume_1.chapters
    .map((chapter) => `${chapter.title} ${chapter.summary}`)
    .join(" ");
  const plotTerms = unique([
    ...extractTerms(outlineText),
    ...extractTerms(bible.world.setting_summary),
  ]).filter((term) => term.length >= 2 && !COMMON_TERMS.has(term));
  const objects = plotTerms.filter((term) => /牌|剑|魂|井|案|符|尸|伤|纹|箱|矿|样|日志|协议/.test(term));
  return { people, places, rules, objects, plotTerms };
}

function hasVerifiableStateChange(text: string, tokens: TokenStats): boolean {
  const cueHits = STATE_CHANGE_CUES.filter((cue) => text.includes(cue)).length;
  if (cueHits >= 2) return true;
  // 通用可追踪名词（题材无关）+ 本书设定物件（从 Bible 动态生成），任一命中即可。
  const trackable = unique([...GENERIC_TRACKABLE_NOUNS, ...tokens.objects]).filter(Boolean);
  return trackable.some((noun) => text.includes(noun)) && GENERIC_RESULT_VERBS.test(text);
}

function buildRiskFlags(metrics: MetricResult[], chapters: QualityChapterInput[]): string[] {
  const flags = metrics
    .filter((metricResult) => metricResult.score / metricResult.max < 0.7)
    .map((metricResult) => `${metricResult.label}低于 70%`);
  const shortChapters = chapters.filter((chapter) => chapter.content.length < 800);
  if (shortChapters.length > 0) {
    flags.push(`${shortChapters.length} 章样本文字少于 800 字，真实质量判断置信度有限`);
  }
  return flags;
}

function buildRecommendations(metrics: MetricResult[], chapters: QualityChapterInput[]): string[] {
  const recommendations: string[] = [];
  const byKey = new Map(metrics.map((metricResult) => [metricResult.key, metricResult]));

  if ((byKey.get("continuity")?.score ?? 0) < 8) {
    recommendations.push("生成下一章前强制注入“上一章结果、本章开场承接、本章必须改变的状态”三项。");
  }
  if ((byKey.get("logic")?.score ?? 0) < 8) {
    recommendations.push("让 Writer 输出前先规划“目标 -> 阻碍 -> 行动 -> 结果”，正文里至少保留一个清晰因果钩。");
  }
  if ((byKey.get("character_consistency")?.score ?? 0) < 8) {
    recommendations.push("把主角当前目标和禁忌行为放进硬约束，并让 Critic 对“突然放弃目标”类行为升为 major。");
  }
  if ((byKey.get("ai_voice")?.score ?? 0) < 8) {
    recommendations.push("继续减少模板化结尾和抽象情绪词，增加短句、打断式对白和具体身体/物件动作。");
  }
  if ((byKey.get("plot_progress")?.score ?? 0) < 8) {
    recommendations.push("每章保存一个可验证状态变化：新线索、关系变化、位置变化、道具归属或敌人反应。");
  }
  if (chapters.some((chapter) => chapter.content.length < 800)) {
    recommendations.push("当前样本偏短；要评估商业可读性，应至少连续生成 5 章、每章 2000 字以上。");
  }

  return recommendations.length > 0
    ? unique(recommendations)
    : ["当前样本质量稳定，下一步可以扩大到多题材、多模型、多轮修订前后对比。"];
}

function metric(
  key: MetricResult["key"],
  label: string,
  score: number,
  max: number,
  findings: string[],
  warnings: string[],
): MetricResult {
  return {
    key,
    label,
    score: clamp(score, 0, max),
    max,
    findings,
    warnings,
  };
}

const COMMON_TERMS = new Set([
  "一个",
  "自己",
  "发现",
  "决定",
  "确认",
  "开始",
  "成为",
  "进行",
  "首次",
  "关键",
  "危机",
]);

function extractImportantTerms(text: string, tokens: TokenStats): string[] {
  return unique([
    ...tokens.people.filter((term) => text.includes(term)),
    ...tokens.places.filter((term) => text.includes(term)),
    ...tokens.objects.filter((term) => text.includes(term)),
    ...extractTerms(text).filter((term) => tokens.plotTerms.includes(term)),
  ]).slice(0, 16);
}

export function extractTerms(text: string): string[] {
  const terms = new Set<string>();
  const normalized = text.replace(/[，。！？、,.!?\s：；“”"（）()《》]/g, " ");
  for (const part of normalized.split(/\s+/)) {
    if (!part) continue;
    if (/^[a-z0-9_-]+$/i.test(part) && part.length >= 3) {
      terms.add(part);
      continue;
    }
    const chars = Array.from(part).filter((char) => /\p{Script=Han}/u.test(char));
    for (let index = 0; index < chars.length - 1; index += 1) {
      const bi = `${chars[index]}${chars[index + 1]}`;
      if (!COMMON_TERMS.has(bi)) terms.add(bi);
    }
    for (let index = 0; index < chars.length - 2; index += 1) {
      const tri = `${chars[index]}${chars[index + 1]}${chars[index + 2]}`;
      if (!COMMON_TERMS.has(tri)) terms.add(tri);
    }
  }
  return [...terms];
}

function splitSentences(text: string): string[] {
  return text
    .split(/[。！？!?；;\n]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function maxPairSimilarity(texts: string[]): number {
  let max = 0;
  for (let left = 0; left < texts.length; left += 1) {
    for (let right = left + 1; right < texts.length; right += 1) {
      max = Math.max(max, jaccard(extractTerms(texts[left]), extractTerms(texts[right])));
    }
  }
  return max;
}

function jaccard(leftTerms: string[], rightTerms: string[]): number {
  const left = new Set(leftTerms);
  const right = new Set(rightTerms);
  if (left.size === 0 && right.size === 0) return 1;
  let intersection = 0;
  for (const term of left) {
    if (right.has(term)) intersection += 1;
  }
  return intersection / (left.size + right.size - intersection);
}

function overlapCount(leftTerms: string[], rightTerms: string[]): number {
  const right = new Set(rightTerms);
  return unique(leftTerms).filter((term) => right.has(term)).length;
}

/**
 * 统计句首重复模式。`knownNames` 是本书角色名（从 Bible 动态生成）——以角色名开头
 * 的句子在中文小说里很常见，不应记为 AI 式重复，故豁免。通用代词开头（他/她…）同样
 * 是省略主语的正常承接句，一并豁免。不再硬编码任何具体小说的专名。
 */
function repeatedSentenceStartCount(text: string, knownNames: string[]): number {
  // 题材无关的通用句首豁免：代词 + 代词接常见动词（省略主语的承接句）。
  const genericIgnored = [
    ...GENERIC_START_PREFIXES,
    "他说", "她说", "他把", "他没", "他站", "他蹲", "他抬", "他看", "那人",
  ];
  const ignoredStarts = unique([...knownNames, ...genericIgnored]).filter(Boolean);
  const starts = splitSentences(text)
    .map((sentence) => sentence.replace(/^[“"']+/, "").slice(0, 4))
    .filter((start) => start.length === 4)
    .filter((start) => !ignoredStarts.some((ignored) => start.startsWith(ignored)));
  const counts = new Map<string, number>();
  for (const start of starts) counts.set(start, (counts.get(start) ?? 0) + 1);
  return [...counts.values()].filter((count) => count >= 4).reduce((sum, count) => sum + count, 0);
}

/**
 * 词汇丰富度 type-token ratio：去重 bigram 数 / 总 bigram 数。题材无关的统计特征，
 * 越低代表用词越重复单调。这里用「全部汉字 bigram（含重复）」做分母——不能复用
 * extractTerms，因为它内部已去重，TTR 会恒为 1。
 */
function typeTokenRatio(text: string): number {
  const chars = Array.from(text).filter((char) => /\p{Script=Han}/u.test(char));
  if (chars.length < 2) return 1;
  const bigrams: string[] = [];
  for (let index = 0; index < chars.length - 1; index += 1) {
    bigrams.push(`${chars[index]}${chars[index + 1]}`);
  }
  return new Set(bigrams).size / bigrams.length;
}

function coefficientOfVariation(values: number[]): number {  if (values.length === 0) return 0;
  const mean = average(values);
  if (mean === 0) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function countText(text: string, needle: string): number {
  if (!needle) return 0;
  return text.split(needle).length - 1;
}

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))].length;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function tail(text: string, length: number): string {
  return text.slice(Math.max(0, text.length - length));
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function scoreLevel(score: number, max: number): NovelQualityReport["level"] {
  const ratio = score / max;
  if (ratio >= 0.88) return "excellent";
  if (ratio >= 0.75) return "good";
  if (ratio >= 0.6) return "needs_work";
  return "weak";
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
