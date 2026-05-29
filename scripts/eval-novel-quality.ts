import fs from "node:fs/promises";
import path from "node:path";
import { config as loadEnv } from "dotenv";

import { buildChapterContext, type ChapterDraftView } from "@/lib/agent/chapterContext";
import { chatCompletionWithRetry, streamChatCompletionWithRetry } from "@/lib/llm/client";
import { getGenerationPolicy } from "@/lib/llm/generationPolicy";
import { buildChapterPrompt } from "@/lib/llm/prompts/chapter";
import { cleanupWriterOutput, cleanupWriterOutputWithReport, type CleanupHit } from "@/lib/llm/writerOutputCleanup";
import { buildStateDiffPrompt } from "@/lib/llm/prompts/stateDiff";
import { evaluateNovelQuality, type NovelQualityReport, type QualityChapterInput } from "@/lib/evals/novelQuality";
import { applyStateDiff } from "@/lib/validation/stateDiffMerge";
import { BibleDraftSchema, NovelProfileSchema, StateDiffSchema, type BibleDraft, type NovelProfile } from "@/lib/validation/schemas";

loadEnv({ path: ".env" });
loadEnv();

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "docs", "evals");
const FIXTURE_DIR = path.join(ROOT, "scripts", "fixtures", "eval-novels");
const DEFAULT_SAMPLE_CHAPTERS = 4;
// Sliding window used to trace per-chapter quality decay. 3 gives continuity /
// logic metrics enough context to mean something while still localizing the
// drop to a chapter range.
const TRAJECTORY_WINDOW = 3;
// A sliding-window score drawdown (from the running peak) of this many points is
// the bar for calling something a decay inflection rather than chapter-to-chapter noise.
const DECAY_DROP_THRESHOLD = 5;

function readFixtureId(): string {
  const raw = process.env.EVAL_NOVEL_QUALITY_FIXTURE?.trim();
  return raw && raw.length > 0 ? raw : "xuanhuan-seed";
}

function readChapterCount(): number {
  const parsed = Number(process.env.EVAL_NOVEL_QUALITY_CHAPTERS);
  if (!Number.isInteger(parsed)) return DEFAULT_SAMPLE_CHAPTERS;
  return Math.max(1, Math.min(20, parsed));
}

interface NovelFixture {
  id: string;
  description: string;
  profile: NovelProfile;
  bible: BibleDraft;
}

interface GeneratedChapter extends QualityChapterInput {
  model: string;
  tookMs: number;
  source: "llm" | "fixture";
  rawCleanupHits?: CleanupHit[];
}

interface NovelQualityRunReport extends NovelQualityReport {
  mode: "real_llm" | "fixture_fallback";
  model: string;
  confidence: "high" | "medium" | "low";
  evaluationNotes: string[];
  generatedChapters: GeneratedChapter[];
  trajectory: TrajectoryPoint[];
  decay: DecayAnalysis;
}

interface TrajectoryPoint {
  endChapter: number;
  windowStart: number;
  windowSize: number;
  scorePct: number;
}

interface DecayAnalysis {
  hasDecay: boolean;
  peakChapter: number;
  peakScorePct: number;
  troughChapter: number;
  troughScorePct: number;
  maxDropPct: number;
  inflectionChapter: number | null;
  note: string;
}

async function readFixture(): Promise<NovelFixture> {
  const raw = JSON.parse(await fs.readFile(path.join(FIXTURE_DIR, `${readFixtureId()}.json`), "utf-8")) as NovelFixture;
  return {
    ...raw,
    profile: NovelProfileSchema.parse(raw.profile),
    bible: BibleDraftSchema.parse(raw.bible),
  };
}

function shouldUseRealLlm(): boolean {
  const mock = process.env.LLM_MOCK === "1" || process.env.LLM_MOCK === "true";
  return !mock && Boolean(process.env.DEEPSEEK_API_KEY);
}

function shouldReuseLatestChapters(): boolean {
  return process.env.EVAL_NOVEL_QUALITY_REUSE_LATEST === "1" || process.env.EVAL_NOVEL_QUALITY_REUSE_LATEST === "true";
}

async function readLatestGeneratedChapters(): Promise<GeneratedChapter[]> {
  const raw = JSON.parse(await fs.readFile(path.join(REPORT_DIR, "novel-quality-latest.json"), "utf-8")) as Partial<NovelQualityRunReport>;
  const generated = Array.isArray(raw.generatedChapters) ? raw.generatedChapters : [];
  if (generated.length === 0) {
    throw new Error("No generatedChapters found in docs/evals/novel-quality-latest.json");
  }
  return generated.map((chapter) => {
    if (typeof chapter.chapterIndex !== "number" || typeof chapter.title !== "string" || typeof chapter.content !== "string") {
      throw new Error("Invalid generated chapter in latest report");
    }
    return {
      chapterIndex: chapter.chapterIndex,
      title: chapter.title,
      outlineSummary: chapter.outlineSummary,
      content: cleanupWriterOutput(chapter.content),
      rawCleanupHits: Array.isArray(chapter.rawCleanupHits) ? chapter.rawCleanupHits : undefined,
      model: typeof chapter.model === "string" ? chapter.model : "latest-report",
      tookMs: typeof chapter.tookMs === "number" ? chapter.tookMs : 0,
      source: chapter.source === "fixture" ? "fixture" : "llm",
    };
  });
}

async function generateChapter(input: {
  fixture: NovelFixture;
  bible: BibleDraft;
  previousChapters: GeneratedChapter[];
  chapterIndex: number;
}): Promise<GeneratedChapter> {
  const chapterViews: Array<ChapterDraftView & { summary?: { summary: string } | null }> = input.previousChapters.map((chapter) => ({
    id: `quality-${chapter.chapterIndex}`,
    chapter_index: chapter.chapterIndex,
    title: chapter.title,
    content: chapter.content,
    status: "done",
    summary: {
      summary: summarizeForContext(chapter.content),
    },
  }));
  const context = buildChapterContext(input.bible, chapterViews, input.chapterIndex, {
    retrievalStatus: "empty",
  });
  const policy = getGenerationPolicy(input.fixture.profile);
  let content = "";
  const result = await streamChatCompletionWithRetry(
    {
      route: "/scripts/eval-novel-quality/chapters/draft",
      agent: "writer",
      messages: buildChapterPrompt({
        context,
        profile: input.fixture.profile,
        generationPolicy: {
          ...policy,
          targetWordCount: Math.min(policy.targetWordCount, 2000),
        },
      }),
      temperature: policy.temperature,
      topP: policy.topP,
      frequencyPenalty: policy.frequencyPenalty,
      presencePenalty: policy.presencePenalty,
      timeoutMs: 180_000,
    },
    {
      onDelta(delta) {
        content += delta;
      },
    },
    0,
  );
  const outline = input.bible.outline.volume_1.chapters.find((chapter) => chapter.index === input.chapterIndex);
  const cleanup = cleanupWriterOutputWithReport(stripCodeFence(content || result.content));
  return {
    chapterIndex: input.chapterIndex,
    title: outline?.title ?? `第 ${input.chapterIndex} 章`,
    outlineSummary: outline?.summary,
    content: cleanup.text,
    rawCleanupHits: cleanup.hits,
    model: result.model,
    tookMs: result.tookMs,
    source: "llm",
  };
}

async function updateBibleWithChapter(bible: BibleDraft, chapter: GeneratedChapter): Promise<BibleDraft> {
  const result = await chatCompletionWithRetry(
    {
      route: "/scripts/eval-novel-quality/state-diff",
      agent: "state_updater",
      messages: buildStateDiffPrompt({
        bible,
        storyState: bible.story_state,
        chapterIndex: chapter.chapterIndex,
        chapterTitle: chapter.title,
        chapterContent: chapter.content,
      }),
      responseFormat: "json_object",
      temperature: 0,
      timeoutMs: 90_000,
    },
    0,
  );
  try {
    const diff = StateDiffSchema.parse(JSON.parse(sanitizeJsonContent(result.content)));
    return applyStateDiff(bible, diff, chapter.chapterIndex);
  } catch (err) {
    // State diff feeds continuity context for later chapters but is not what
    // the quality eval scores. Malformed JSON (Chinese quotes / truncation)
    // shouldn't abort a 12-chapter long-form run — keep the prior bible and
    // press on so the chapter trajectory still gets recorded.
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[eval:novel-quality] state-diff parse failed for chapter ${chapter.chapterIndex}, keeping prior bible: ${message}`);
    return bible;
  }
}

async function generateSeries(fixture: NovelFixture, chapterCount: number): Promise<{ bible: BibleDraft; chapters: GeneratedChapter[] }> {
  let bible = fixture.bible;
  const chapters: GeneratedChapter[] = [];

  for (let chapterIndex = 1; chapterIndex <= chapterCount; chapterIndex += 1) {
    const chapter = await generateChapter({
      fixture,
      bible,
      previousChapters: chapters,
      chapterIndex,
    });
    chapters.push(chapter);
    bible = await updateBibleWithChapter(bible, chapter);
    console.log(`[eval:novel-quality] chapter ${chapterIndex}/${chapterCount} done (${chapter.content.length} chars)`);
  }

  return { bible, chapters };
}

function sanitizeJsonContent(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}

function fallbackSeries(fixture: NovelFixture): GeneratedChapter[] {
  const chapters = [
    {
      chapterIndex: 1,
      title: "雨夜火房",
      content: [
        "雨夜压在柴饦峰上，火房里的柴烟像一条灰蛇，沿着破瓦缝钻出去。",
        "沈言蹲在灶前，把最后一根湿柴塞进火膛，袖口下的旧疤被火光照得发亮。外头执事的脚步声越来越近，他只低着头，像往常一样装作什么都没听见。",
        "门被一脚踹开时，冷雨卷进来，火苗伏低。执事把一枚黑色木牌摔到他脚边，说三日后的宗门考核，火房杂役也要上场。",
        "沈言抬头，眼神仍旧怯弱。可就在指尖碰到木牌的瞬间，后山裂井方向传来一声只有他能听见的剑鸣。",
        "那声音苍老、讥诮，又像等了他很多年：“小子，你再装下去，就真要死在这里了。”",
      ].join("\n\n"),
    },
    {
      chapterIndex: 2,
      title: "黑牌入手",
      content: [
        "黑牌被沈言藏进袖口，贴着旧疤，烫得像一枚小火炭。",
        "他没有立刻扔掉。扔掉太干净，蒋阶的人会知道他已经察觉。于是他照旧挑水，照旧被执事骂，甚至故意在门槛前摔了一跤。",
        "“真怂。”旁边弟子笑。",
        "沈言垂着眼，把泥抹到黑牌边缘。泥水顺着牌纹渗进去，一道细到几乎看不见的符线亮了半息，朝后山裂井爬去。",
        "几在他耳边啧了一声：“追踪符。有人怕你不上钩。”",
        "沈言把木桶提起来。很重。好，重一点才像真的。",
      ].join("\n\n"),
    },
    {
      chapterIndex: 3,
      title: "裂井剑鸣",
      content: [
        "入夜后，柴饦峰的雨停了，泥还在滑。",
        "沈言顺着追踪符留下的暗线摸到后山裂井。井口被藤根勒住，像一只闭了很多年的眼。他把黑牌按在井壁裂缝上，符光往里一钻，井底传出低笑。",
        "“你爹当年，也这么拿命试别人。”",
        "沈言的手指顿住。",
        "父母旧案四个字堵在喉咙里。他没有问。现在问，几只会加价。于是他先把三日后的考核摆出来：几借他剑魂共振活下去，他替几找重塑剑魂本体的线索。",
        "“成交？”",
        "“不成交你就死。”",
        "沈言点头，把黑牌留在裂缝里。第一枚钩子，挂回去了。",
      ].join("\n\n"),
    },
    {
      chapterIndex: 4,
      title: "考核初战",
      content: [
        "宗门考核在雨后第二日开始。台下泥水未干，台上新铺的青石却擦得发亮。",
        "执事把沈言推到第一场，像推一袋迟早要破的柴灰。对面的外门弟子拔剑时，黑牌在井底留下的符线轻轻一抖，抖进沈言腕上的旧疤。",
        "疼。",
        "他退了半步。不是怕，是把脚尖挪到几昨夜指出的位置。",
        "剑锋压下来的时候，沈言没有拔剑，只抬起那柄火房劈柴用的钝木刀。剑魂共振从旧疤里撞出去，追踪符反噬，对手手腕一僵。",
        "木刀横拍。",
        "啪。",
        "那人跪在泥里，半天没能起身。台下先是静，随后有人倒吸一口气。",
        "高台上，蒋阶的笑淡了。",
      ].join("\n\n"),
    },
  ];
  return chapters.map((chapter) => ({
    ...chapter,
    outlineSummary: fixture.bible.outline.volume_1.chapters.find((outline) => outline.index === chapter.chapterIndex)?.summary,
    model: "fixture-fallback",
    tookMs: 0,
    source: "fixture",
  }));
}

function summarizeForContext(content: string): string {
  return content.replace(/\s+/g, " ").trim().slice(0, 240);
}

/**
 * Traces per-chapter quality by re-scoring a sliding window of chapters ending
 * at each position. Pure + local (no LLM), so it's cheap to run on every
 * generated series. The window gives continuity / logic metrics enough context
 * to be meaningful while still localizing a drop to a chapter range.
 */
function buildQualityTrajectory(fixtureId: string, bible: BibleDraft, chapters: GeneratedChapter[]): TrajectoryPoint[] {
  const points: TrajectoryPoint[] = [];
  for (let end = 1; end <= chapters.length; end += 1) {
    const start = Math.max(1, end - TRAJECTORY_WINDOW + 1);
    const windowChapters = chapters.filter((c) => c.chapterIndex >= start && c.chapterIndex <= end);
    if (windowChapters.length === 0) continue;
    const windowReport = evaluateNovelQuality({ fixtureId, bible, chapters: windowChapters });
    points.push({
      endChapter: end,
      windowStart: start,
      windowSize: windowChapters.length,
      scorePct: Math.round((windowReport.overallScore / windowReport.maxScore) * 1000) / 10,
    });
  }
  return points;
}

function analyzeDecay(trajectory: TrajectoryPoint[]): DecayAnalysis {
  if (trajectory.length === 0) {
    return {
      hasDecay: false,
      peakChapter: 0,
      peakScorePct: 0,
      troughChapter: 0,
      troughScorePct: 0,
      maxDropPct: 0,
      inflectionChapter: null,
      note: "无章节可分析。",
    };
  }

  // Cold-start windows (fewer than TRAJECTORY_WINDOW chapters) score artificially
  // low / volatile because cross-chapter metrics (continuity, causality) have
  // little to chew on. Exclude them so warm-up wobble isn't mistaken for decay.
  // Fall back to the full trajectory only when the run is shorter than one window.
  const mature = trajectory.filter((point) => point.windowSize >= TRAJECTORY_WINDOW);
  const series = mature.length > 0 ? mature : trajectory;

  const peak = series.reduce((best, p) => (p.scorePct > best.scorePct ? p : best), series[0]);
  const trough = series.reduce((worst, p) => (p.scorePct < worst.scorePct ? p : worst), series[0]);

  // Inflection = first chapter (after the running peak) where the window score
  // drops 5+ points below the peak seen so far. This catches a sustained dip,
  // not single-chapter noise.
  let runningPeak = series[0].scorePct;
  let inflectionChapter: number | null = null;
  let maxDrop = 0;
  for (const point of series) {
    if (point.scorePct > runningPeak) runningPeak = point.scorePct;
    const drop = runningPeak - point.scorePct;
    if (drop > maxDrop) maxDrop = drop;
    if (inflectionChapter === null && drop >= DECAY_DROP_THRESHOLD) {
      inflectionChapter = point.endChapter;
    }
  }

  const endChapter = series[series.length - 1].endChapter;
  const endScorePct = series[series.length - 1].scorePct;
  const roundedMaxDrop = Math.round(maxDrop * 10) / 10;
  // A drawdown that climbs back within threshold of the peak by the final window
  // is noise (warm-up wobble / one weak chapter), not sustained decay. Only an
  // un-recovered drop counts as real long-form quality decay.
  const recovered = inflectionChapter !== null && endScorePct >= peak.scorePct - DECAY_DROP_THRESHOLD;
  const hasDecay = inflectionChapter !== null && !recovered;

  let note: string;
  if (inflectionChapter === null) {
    note = `连续 ${series.length} 个成熟窗口未见衰减拐点：窗口分数在 ${trough.scorePct}%~${peak.scorePct}% 区间波动，最大回撤仅 ${roundedMaxDrop} 分。`;
  } else if (recovered) {
    note = `无持续性衰减：第 ${inflectionChapter} 章窗口出现 ${roundedMaxDrop} 分回撤（峰值第 ${peak.endChapter} 章 ${peak.scorePct}% → 谷值第 ${trough.endChapter} 章 ${trough.scorePct}%），但随后回升至第 ${endChapter} 章 ${endScorePct}%，属正常波动。`;
  } else {
    note = `质量自第 ${peak.endChapter} 章峰值 ${peak.scorePct}% 起，于第 ${inflectionChapter} 章跌破阈值且未回升，谷值第 ${trough.endChapter} 章 ${trough.scorePct}%，最大回撤 ${roundedMaxDrop} 分。`;
  }

  return {
    hasDecay,
    peakChapter: peak.endChapter,
    peakScorePct: peak.scorePct,
    troughChapter: trough.endChapter,
    troughScorePct: trough.scorePct,
    maxDropPct: roundedMaxDrop,
    inflectionChapter,
    note,
  };
}

function stripCodeFence(content: string): string {
  return content
    .replace(/^```(?:\w+)?\s*/u, "")
    .replace(/\s*```$/u, "");
}

function renderMarkdown(report: NovelQualityRunReport): string {
  const ratio = `${report.overallScore}/${report.maxScore}`;
  const cleanupAiHits = report.rawCleanupHits;
  const cleanupChapters = report.generatedChapters.filter((chapter) => Array.isArray(chapter.rawCleanupHits)).length;
  const cleanupAiTotal = cleanupAiHits.reduce((sum, hit) => sum + hit.count, 0);
  const lines = [
    "# 连续小说质量测评报告",
    "",
    `- 生成时间：${report.generatedAt}`,
    `- 样例：${report.fixtureId}《${report.title}》`,
    `- 模式：${report.mode}`,
    `- 模型：${report.model}`,
    `- 置信度：${report.confidence}`,
    `- 样本：${report.chapterCount} 章 / ${report.totalChars} 字`,
    `- 总分：${ratio}（${levelLabel(report.level)}）`,
    "",
    "## 结论",
    "",
    ...report.evaluationNotes.map((note) => `- ${note}`),
    "",
    "## 指标",
    "",
    "| 维度 | 分数 | 主要发现 | 风险 |",
    "|---|---:|---|---|",
    ...report.metrics.map((metric) =>
      `| ${metric.label} | ${metric.score}/${metric.max} | ${metric.findings.join("<br>") || "无"} | ${metric.warnings.join("<br>") || "无"} |`,
    ),
    "",
    "## AI 写作痕迹命中",
    "",
    report.aiTraceHits.length > 0
      ? "| 规则 | 类别 | 次数 | 示例 |"
      : "本轮未命中 humanizer 规则中的显性 AI 写作痕迹。",
    ...(report.aiTraceHits.length > 0 ? [
      "|---|---|---:|---|",
      ...report.aiTraceHits.slice(0, 12).map((hit) =>
        `| ${hit.label} | ${categoryLabel(hit.category)} | ${hit.count} | ${hit.examples.join("、") || "无"} |`,
      ),
    ] : []),
    "",
    "## 清洗前 AI 签名命中（原始输出，按规则）",
    "",
    cleanupChapters > 0
      ? `> 统计写手原始输出在 \`cleanupWriterOutput\` 清洗**前**触发的 AI 签名规则。命中越多 = 提示侧 AI 味越重（而非清洗兜底的功劳）。本轮 ${cleanupChapters} 章，AI 签名命中合计 ${cleanupAiTotal} 次，平均每章 ${(cleanupAiTotal / cleanupChapters).toFixed(1)} 次。`
      : "本轮无原始输出统计（reuse 旧报告或 fixture 模式未记录清洗前命中）。",
    ...(cleanupChapters > 0 && cleanupAiHits.length > 0 ? [
      "",
      "| 规则 | 命中次数 | 平均每章 |",
      "|---|---:|---:|",
      ...cleanupAiHits.map((hit) => `| ${hit.label} | ${hit.count} | ${(hit.count / cleanupChapters).toFixed(1)} |`),
    ] : cleanupChapters > 0 ? ["", "写手原始输出未触发任何 AI 签名清洗规则，提示侧已较干净。"] : []),
    "",
    "## 章节样本",
    "",
    "| 章节 | 字数 | 句子 | 对白 | 摘要 |",
    "|---|---:|---:|---:|---|",
    ...report.chapterSummaries.map((chapter) =>
      `| 第 ${chapter.chapterIndex} 章《${chapter.title}》 | ${chapter.chars} | ${chapter.sentenceCount} | ${chapter.dialogueCount} | ${chapter.excerpt} |`,
    ),
    "",
    "## 质量轨迹（滑动窗口）",
    "",
    `- 衰减判定：${report.decay.note}`,
    `- 峰值：第 ${report.decay.peakChapter} 章 ${report.decay.peakScorePct}%`,
    `- 谷值：第 ${report.decay.troughChapter} 章 ${report.decay.troughScorePct}%`,
    `- 拐点：${report.decay.inflectionChapter !== null ? `第 ${report.decay.inflectionChapter} 章` : "无"}`,
    "",
    "| 窗口结束章 | 窗口范围 | 窗口分数% | 走势 |",
    "|---:|---|---:|---|",
    ...report.trajectory.map((point, i) => {
      const prev = report.trajectory[i - 1];
      const arrow = !prev ? "·" : point.scorePct > prev.scorePct ? "↑" : point.scorePct < prev.scorePct ? "↓" : "=";
      return `| 第 ${point.endChapter} 章 | ${point.windowStart}-${point.endChapter} | ${point.scorePct} | ${arrow} ${bar(point.scorePct)} |`;
    }),
    "",
    "## 风险",
    "",
    ...(report.riskFlags.length > 0 ? report.riskFlags.map((flag) => `- ${flag}`) : ["- 暂无高优先级风险。"]),
    "",
    "## 下一步优化",
    "",
    ...report.recommendations.map((item) => `- ${item}`),
    "",
  ];
  return lines.join("\n");
}

function categoryLabel(category: NovelQualityRunReport["aiTraceHits"][number]["category"]): string {
  if (category === "content") return "内容模式";
  if (category === "language") return "语言语法";
  if (category === "style") return "风格模式";
  if (category === "communication") return "沟通模式";
  return "填充兜底";
}

function levelLabel(level: NovelQualityRunReport["level"]): string {
  if (level === "excellent") return "优秀";
  if (level === "good") return "可用";
  if (level === "needs_work") return "需要优化";
  return "较弱";
}

function buildEvaluationNotes(report: NovelQualityReport, mode: NovelQualityRunReport["mode"]): string[] {
  const notes: string[] = [];
  const scoreRatio = Math.round((report.overallScore / report.maxScore) * 100);
  notes.push(`本轮连续写作质量折算百分制为 ${scoreRatio} 分，结论是「${levelLabel(report.level)}」。`);
  if (mode === "real_llm") {
    notes.push("本轮调用真实 LLM 连续生成章节，能初步代表当前 Writer Prompt 的实际质量。");
  } else {
    notes.push("本轮未使用真实 LLM 连续长章输出，只能验证评测管线和样本级质量，不能当作最终模型效果。");
  }
  const weakest = [...report.metrics].sort((a, b) => a.score / a.max - b.score / b.max)[0];
  if (weakest) {
    notes.push(`当前最短板是「${weakest.label}」：${weakest.warnings[0] ?? "暂无明确风险，但仍是相对低分项。"}`);
  }
  return notes;
}

async function writeReports(report: NovelQualityRunReport) {
  await fs.mkdir(REPORT_DIR, { recursive: true });
  await writeGeneratedChapters(report.generatedChapters);
  const json = JSON.stringify(report, null, 2);
  const markdown = renderMarkdown(report);
  await Promise.all([
    fs.writeFile(path.join(REPORT_DIR, "novel-quality-latest.json"), `${json}\n`, "utf-8"),
    fs.writeFile(path.join(REPORT_DIR, "novel-quality-latest.md"), `${markdown}\n`, "utf-8"),
  ]);
}

async function writeGeneratedChapters(chapters: GeneratedChapter[]) {
  const chapterDir = path.join(REPORT_DIR, "chapters");
  await fs.mkdir(chapterDir, { recursive: true });
  await Promise.all(
    chapters.map((chapter) => {
      const fileName = `chapter-${String(chapter.chapterIndex).padStart(2, "0")}-${safeFileName(chapter.title)}.md`;
      const lines = [
        `# 第 ${chapter.chapterIndex} 章《${chapter.title}》`,
        "",
        `- 来源：${chapter.source}`,
        `- 模型：${chapter.model}`,
        `- 字数：${chapter.content.length}`,
        "",
        chapter.content.trim(),
        "",
      ];
      return fs.writeFile(path.join(chapterDir, fileName), lines.join("\n"), "utf-8");
    }),
  );
  const combined = chapters
    .map((chapter) => [`# 第 ${chapter.chapterIndex} 章《${chapter.title}》`, "", chapter.content.trim(), ""].join("\n"))
    .join("\n");
  await fs.writeFile(path.join(chapterDir, "combined.md"), combined, "utf-8");
}

function safeFileName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 48);
}

function bar(scorePct: number): string {
  const filled = Math.round(scorePct / 10);
  return "█".repeat(Math.max(0, Math.min(10, filled)));
}

async function main() {
  const fixture = await readFixture();
  const chapterCount = readChapterCount();
  let mode: NovelQualityRunReport["mode"] = shouldUseRealLlm() ? "real_llm" : "fixture_fallback";
  let model = "not-run";
  let chapters: GeneratedChapter[];
  let bible = fixture.bible;

  try {
    if (shouldReuseLatestChapters()) {
      chapters = await readLatestGeneratedChapters();
      mode = chapters.some((chapter) => chapter.source === "llm") ? "real_llm" : "fixture_fallback";
      model = chapters[0]?.model ?? "latest-report";
    } else if (shouldUseRealLlm()) {
      const generated = await generateSeries(fixture, chapterCount);
      bible = generated.bible;
      chapters = generated.chapters;
      model = chapters[0]?.model ?? "unknown";
    } else {
      chapters = fallbackSeries(fixture);
      model = chapters[0]?.model ?? "fixture-fallback";
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[eval:novel-quality] real generation failed, using fixture fallback: ${message}`);
    mode = "fixture_fallback";
    chapters = fallbackSeries(fixture);
    model = chapters[0]?.model ?? "fixture-fallback";
  }

  const baseReport = evaluateNovelQuality({
    fixtureId: fixture.id,
    bible,
    chapters,
  });
  const trajectory = buildQualityTrajectory(fixture.id, bible, chapters);
  const decay = analyzeDecay(trajectory);
  const report: NovelQualityRunReport = {
    ...baseReport,
    mode,
    model,
    confidence: mode === "real_llm" ? "medium" : "low",
    evaluationNotes: buildEvaluationNotes(baseReport, mode),
    generatedChapters: chapters,
    trajectory,
    decay,
  };

  await writeReports(report);
  console.log(`[eval:novel-quality] ${report.overallScore}/${report.maxScore} (${levelLabel(report.level)}) · ${chapters.length} chapters`);
  console.log(`[eval:novel-quality] decay: ${decay.note}`);
  console.log("[eval:novel-quality] wrote docs/evals/novel-quality-latest.md and docs/evals/novel-quality-latest.json");
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[eval:novel-quality] failed: ${message}`);
  process.exit(1);
});
