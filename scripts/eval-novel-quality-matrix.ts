import fs from "node:fs/promises";
import path from "node:path";
import { config as loadEnv } from "dotenv";

import { buildChapterContext, type ChapterDraftView } from "@/lib/agent/chapterContext";
import { chatCompletionWithRetry, streamChatCompletionWithRetry } from "@/lib/llm/client";
import { getGenerationPolicy } from "@/lib/llm/generationPolicy";
import { buildChapterPrompt } from "@/lib/llm/prompts/chapter";
import { buildChapterRevisionPrompt } from "@/lib/llm/prompts/chapterRevision";
import { buildCriticPrompt, type CriticResult } from "@/lib/llm/prompts/critic";
import { buildStateDiffPrompt } from "@/lib/llm/prompts/stateDiff";
import { cleanupWriterOutput } from "@/lib/llm/writerOutputCleanup";
import { evaluateNovelQuality, type NovelQualityReport, type QualityChapterInput } from "@/lib/evals/novelQuality";
import { buildNovelQualityMatrixReport, renderNovelQualityMatrixMarkdown, type NovelQualityMatrixCase } from "@/lib/evals/novelQualityMatrix";
import { applyStateDiff } from "@/lib/validation/stateDiffMerge";
import { BibleDraftSchema, NovelProfileSchema, StateDiffSchema, type BibleDraft, type NovelProfile } from "@/lib/validation/schemas";

loadEnv({ path: ".env" });
loadEnv();

const ROOT = process.cwd();
const FIXTURE_DIR = path.join(ROOT, "scripts", "fixtures", "eval-novels");
const REPORT_DIR = path.join(ROOT, "docs", "evals");
const DEFAULT_FIXTURES = ["xuanhuan-seed", "urban-suspense", "scifi-hard", "history-conservative"];
const DEFAULT_MODELS = ["fixture-baseline"];

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
}

interface MatrixConfig {
  fixtureIds: string[];
  models: string[];
  chapterCount: number;
  revisionRounds: number;
  useRealLlm: boolean;
}

async function main() {
  const config = readConfig();
  const fixtures = await Promise.all(config.fixtureIds.map(readFixture));
  const cases: NovelQualityMatrixCase[] = [];

  for (const fixture of fixtures) {
    for (const model of config.models) {
      const item = await runMatrixCase(fixture, model, config);
      cases.push(item);
    }
  }

  const report = buildNovelQualityMatrixReport({
    fixtureIds: config.fixtureIds,
    models: config.models,
    chapterCount: config.chapterCount,
    revisionRounds: config.revisionRounds,
    mode: config.useRealLlm ? "real_llm" : "fixture_fallback",
    cases,
  });

  await fs.mkdir(REPORT_DIR, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(REPORT_DIR, "novel-quality-matrix-latest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf-8"),
    fs.writeFile(path.join(REPORT_DIR, "novel-quality-matrix-latest.md"), `${renderNovelQualityMatrixMarkdown(report)}\n`, "utf-8"),
  ]);

  console.log(`[eval:novel-quality:matrix] ${report.summary.averageRevisedScore}/100 avg revised (${report.summary.caseCount} cases)`);
  console.log("[eval:novel-quality:matrix] wrote docs/evals/novel-quality-matrix-latest.md and docs/evals/novel-quality-matrix-latest.json");
}

function readConfig(): MatrixConfig {
  const fixtureRaw = process.env.EVAL_NOVEL_MATRIX_FIXTURES?.trim();
  const modelRaw = process.env.EVAL_NOVEL_MATRIX_MODELS?.trim();
  return {
    fixtureIds: fixtureRaw === "all" || !fixtureRaw ? DEFAULT_FIXTURES : splitCsv(fixtureRaw),
    models: modelRaw ? splitCsv(modelRaw) : DEFAULT_MODELS,
    chapterCount: clampInt(process.env.EVAL_NOVEL_MATRIX_CHAPTERS, 2, 8, 3),
    revisionRounds: clampInt(process.env.EVAL_NOVEL_MATRIX_REVISION_ROUNDS, 0, 2, 1),
    useRealLlm: process.env.EVAL_NOVEL_MATRIX_REAL === "1" || process.env.EVAL_NOVEL_MATRIX_REAL === "true",
  };
}

async function readFixture(id: string): Promise<NovelFixture> {
  const raw = JSON.parse(await fs.readFile(path.join(FIXTURE_DIR, `${id}.json`), "utf-8")) as NovelFixture;
  return {
    ...raw,
    profile: NovelProfileSchema.parse(raw.profile),
    bible: BibleDraftSchema.parse(raw.bible),
  };
}

async function runMatrixCase(fixture: NovelFixture, model: string, config: MatrixConfig): Promise<NovelQualityMatrixCase> {
  const draft = config.useRealLlm
    ? await generateSeries(fixture, model, config.chapterCount)
    : { bible: fixture.bible, chapters: fallbackSeries(fixture, model, config.chapterCount) };
  const draftReport = evaluate(fixture, draft.bible, draft.chapters);
  const revised = await reviseSeries(fixture, draft.bible, draft.chapters, model, config.revisionRounds, config.useRealLlm);
  const revisedReport = evaluate(fixture, revised.bible, revised.chapters);

  return {
    fixtureId: fixture.id,
    title: fixture.bible.meta.suggested_title,
    genre: fixture.profile.genre_sub,
    model,
    mode: config.useRealLlm ? "real_llm" : "fixture_fallback",
    chapterCount: draft.chapters.length,
    revisionRounds: config.revisionRounds,
    changedChapters: revised.changedChapters,
    criticIssues: revised.criticIssues,
    draftReport,
    revisedReport,
  };
}

function evaluate(fixture: NovelFixture, bible: BibleDraft, chapters: GeneratedChapter[]): NovelQualityReport {
  return evaluateNovelQuality({
    fixtureId: fixture.id,
    bible,
    chapters,
  });
}

async function generateSeries(fixture: NovelFixture, model: string, chapterCount: number): Promise<{ bible: BibleDraft; chapters: GeneratedChapter[] }> {
  let bible = fixture.bible;
  const chapters: GeneratedChapter[] = [];

  for (let chapterIndex = 1; chapterIndex <= chapterCount; chapterIndex += 1) {
    const chapter = await generateChapter(fixture, bible, chapters, chapterIndex, model);
    chapters.push(chapter);
    bible = await updateBibleWithChapter(bible, chapter, model);
  }

  return { bible, chapters };
}

async function generateChapter(
  fixture: NovelFixture,
  bible: BibleDraft,
  previousChapters: GeneratedChapter[],
  chapterIndex: number,
  model: string,
): Promise<GeneratedChapter> {
  const context = buildChapterContext(bible, toChapterViews(previousChapters), chapterIndex, {
    retrievalStatus: "empty",
  });
  const policy = getGenerationPolicy(fixture.profile);
  let content = "";
  const result = await streamChatCompletionWithRetry(
    {
      route: "/scripts/eval-novel-quality-matrix/chapters/draft",
      agent: "writer",
      model,
      messages: buildChapterPrompt({
        context,
        profile: fixture.profile,
        generationPolicy: {
          ...policy,
          targetWordCount: Math.min(policy.targetWordCount, 1800),
        },
      }),
      temperature: policy.temperature,
      topP: 0.95,
      frequencyPenalty: 0.5,
      presencePenalty: 0.3,
      timeoutMs: 180_000,
    },
    {
      onDelta(delta) {
        content += delta;
      },
    },
    0,
  );
  const outline = bible.outline.volume_1.chapters.find((chapter) => chapter.index === chapterIndex);
  return {
    chapterIndex,
    title: outline?.title ?? `第 ${chapterIndex} 章`,
    outlineSummary: outline?.summary,
    content: cleanupWriterOutput(content || result.content),
    model: result.model,
    tookMs: result.tookMs,
    source: "llm",
  };
}

async function reviseSeries(
  fixture: NovelFixture,
  bible: BibleDraft,
  chapters: GeneratedChapter[],
  model: string,
  revisionRounds: number,
  useRealLlm: boolean,
): Promise<{ bible: BibleDraft; chapters: GeneratedChapter[]; changedChapters: number; criticIssues: number }> {
  let currentBible = bible;
  let changedChapters = 0;
  let criticIssues = 0;
  const revised: GeneratedChapter[] = [];

  for (const chapter of chapters) {
    let current = chapter;
    for (let round = 0; round < revisionRounds; round += 1) {
      const context = buildChapterContext(currentBible, toChapterViews(revised), current.chapterIndex, {
        retrievalStatus: "empty",
      });
      const critic = useRealLlm ? await runCritic(context, current, model, round > 0) : fallbackCritic(current);
      criticIssues += critic.issues.length;
      if (critic.consistent && critic.issues.length === 0) {
        const cleaned = cleanupWriterOutput(current.content);
        if (cleaned !== current.content) changedChapters += 1;
        current = {
          ...current,
          content: cleaned,
        };
        continue;
      }
      const nextContent = useRealLlm
        ? await runRevision(context, current, critic, model)
        : fallbackRevise(current.content);
      const cleaned = cleanupWriterOutput(nextContent);
      if (cleaned !== current.content) changedChapters += 1;
      current = { ...current, content: cleaned };
    }
    revised.push(current);
    currentBible = useRealLlm ? await updateBibleWithChapter(currentBible, current, model) : currentBible;
  }

  return { bible: currentBible, chapters: revised, changedChapters, criticIssues };
}

async function runCritic(
  context: ReturnType<typeof buildChapterContext>,
  chapter: GeneratedChapter,
  model: string,
  isRevision: boolean,
): Promise<CriticResult> {
  const result = await chatCompletionWithRetry(
    {
      route: "/scripts/eval-novel-quality-matrix/chapters/critic",
      agent: "critic",
      model,
      messages: buildCriticPrompt({
        context,
        chapterContent: chapter.content,
        chapterIndex: chapter.chapterIndex,
        isRevision,
      }),
      responseFormat: "json_object",
      temperature: 0,
      timeoutMs: 90_000,
    },
    0,
  );
  return normalizeCriticResult(JSON.parse(result.content) as Partial<CriticResult>);
}

async function runRevision(
  context: ReturnType<typeof buildChapterContext>,
  chapter: GeneratedChapter,
  critic: CriticResult,
  model: string,
): Promise<string> {
  const result = await chatCompletionWithRetry(
    {
      route: "/scripts/eval-novel-quality-matrix/chapters/draft/revise",
      agent: "writer",
      model,
      messages: buildChapterRevisionPrompt({
        context,
        chapterContent: chapter.content,
        issues: critic.issues,
      }),
      temperature: 0.55,
      timeoutMs: 120_000,
    },
    0,
  );
  return result.content;
}

async function updateBibleWithChapter(bible: BibleDraft, chapter: GeneratedChapter, model?: string): Promise<BibleDraft> {
  const result = await chatCompletionWithRetry(
    {
      route: "/scripts/eval-novel-quality-matrix/state-diff",
      agent: "state_updater",
      model,
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
  const diff = StateDiffSchema.parse(JSON.parse(result.content));
  return applyStateDiff(bible, diff, chapter.chapterIndex);
}

function fallbackSeries(fixture: NovelFixture, model: string, chapterCount: number): GeneratedChapter[] {
  return fixture.bible.outline.volume_1.chapters.slice(0, chapterCount).map((outline) => ({
    chapterIndex: outline.index,
    title: outline.title,
    outlineSummary: outline.summary,
    content: fallbackChapterContent(fixture, outline.index, outline.title, outline.summary),
    model,
    tookMs: 0,
    source: "fixture",
  }));
}

function fallbackChapterContent(fixture: NovelFixture, chapterIndex: number, title: string, summary: string): string {
  const protagonist = fixture.bible.characters.find((character) => character.role === "protagonist")?.name ?? "主角";
  const antagonist = fixture.bible.characters.find((character) => character.role === "antagonist")?.name ?? "对手";
  const place = fixture.bible.world.geography[0] ?? fixture.bible.world.factions[0]?.name ?? "旧地";
  const object = objectForGenre(fixture.profile.genre_sub);
  return [
    `${place}的灯还亮着。${protagonist}把${object}压在掌心，纸边硌着旧伤。`,
    `本章要处理的是《${title}》：${summary}`,
    `他没有立刻交出去。因为${antagonist}的人正在查，交得太快，反而会让线索断在自己手里。于是他先换了个位置，把${object}藏进衣袖，又记下门口那个人的靴印。`,
    `“你确定？”旁边有人问。`,
    `“不确定。”${protagonist}说，“所以才要查。”`,
    `到天亮前，他确认了一个变化：${object}指向的不是空穴，而是${place}里被人改过的一处记录。${antagonist}也有了反应，派人封住通往下一处地点的路。`,
  ].join("\n\n");
}

function fallbackCritic(chapter: GeneratedChapter): CriticResult {
  if (/慢慢|似乎|仿佛|——|\*\*/.test(chapter.content)) {
    return {
      consistent: false,
      issues: [
        {
          type: "tone",
          severity: "minor",
          description: "章节存在明显 AI 写作表层痕迹。",
          suggestion: "清理破折号、Markdown 和高频副词。",
        },
      ],
    };
  }
  return { consistent: true, issues: [] };
}

function fallbackRevise(content: string): string {
  return cleanupWriterOutput(content);
}

function normalizeCriticResult(value: Partial<CriticResult>): CriticResult {
  return {
    consistent: Boolean(value.consistent),
    issues: Array.isArray(value.issues) ? value.issues : [],
  };
}

function toChapterViews(chapters: GeneratedChapter[]): Array<ChapterDraftView & { summary?: { summary: string } | null }> {
  return chapters.map((chapter) => ({
    id: `matrix-${chapter.chapterIndex}`,
    chapter_index: chapter.chapterIndex,
    title: chapter.title,
    content: chapter.content,
    status: "done",
    summary: { summary: chapter.content.replace(/\s+/g, " ").slice(0, 240) },
  }));
}

function objectForGenre(genre: string): string {
  if (genre.includes("悬疑")) return "证物袋";
  if (genre.includes("科幻")) return "黑箱日志";
  if (genre.includes("历史")) return "残奏副本";
  return "木牌";
}

function splitCsv(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function clampInt(value: string | undefined, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[eval:novel-quality:matrix] failed: ${message}`);
  process.exit(1);
});
