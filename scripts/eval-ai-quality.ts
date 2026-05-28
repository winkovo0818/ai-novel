import fs from "node:fs/promises";
import path from "node:path";
import { config as loadEnv } from "dotenv";

import { buildChapterContext, type ChapterDraftView } from "@/lib/agent/chapterContext";
import { chatCompletionWithRetry, streamChatCompletionWithRetry } from "@/lib/llm/client";
import { buildBiblePrompt } from "@/lib/llm/prompts/bible";
import { buildChapterPrompt } from "@/lib/llm/prompts/chapter";
import { buildCriticPrompt, type CriticResult } from "@/lib/llm/prompts/critic";
import { buildStateDiffPrompt } from "@/lib/llm/prompts/stateDiff";
import { cleanupWriterOutput } from "@/lib/llm/writerOutputCleanup";
import {
  BibleDraftSchema,
  NovelProfileSchema,
  StateDiffSchema,
  type BibleDraft,
  type NovelProfile,
  type StateDiff,
} from "@/lib/validation/schemas";

loadEnv({ path: ".env" });
loadEnv();

const ROOT = process.cwd();
const NOVEL_FIXTURE_DIR = path.join(ROOT, "scripts", "fixtures", "eval-novels");
const CHAPTER_FIXTURE_DIR = path.join(ROOT, "scripts", "fixtures", "eval-chapters");
const REPORT_DIR = path.join(ROOT, "docs", "evals");

interface NovelFixture {
  id: string;
  description: string;
  profile: NovelProfile;
  logline: string;
  answers?: Record<string, string | string[]>;
  bible: BibleDraft;
}

interface ChapterFixture {
  id: string;
  novel_fixture: string;
  description: string;
  chapter_index: number;
  chapter_title: string;
  fixed_chapter_content?: string;
  existing_content?: string;
  previous_chapters?: Array<{
    chapter_index: number;
    title: string;
    content: string;
    status?: string;
    summary?: string;
  }>;
  retrieved_memories?: Array<{ source: string; text: string; reason: string; score?: number }>;
  expected?: {
    writer_must_include?: string[];
    critic_issue_types?: string[];
    state_diff_min_timeline_events?: number;
    state_diff_character_updates?: string[];
    state_diff_plot_threads?: string[];
    state_diff_new_entities?: string[];
  };
}

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

interface ScoreResult {
  name: "completeness" | "outline_usability" | "character_conflict";
  score: number;
  max: number;
  checks: CheckResult[];
}

interface ChapterEvalResult {
  id: string;
  novelId: string;
  description: string;
  writer: {
    ok: boolean;
    chars: number;
    checks: CheckResult[];
    excerpt: string;
    model: string;
    tookMs: number;
  };
  critic: {
    ok: boolean;
    consistent: boolean;
    issueCount: number;
    checks: CheckResult[];
    model: string;
    tookMs: number;
  };
  stateDiff: {
    ok: boolean;
    timelineEvents: number;
    characterUpdates: number;
    checks: CheckResult[];
    model: string;
    tookMs: number;
  };
}

interface EvalReport {
  generatedAt: string;
  mock: boolean;
  summary: {
    novelFixtures: number;
    chapterFixtures: number;
    passedChecks: number;
    failedChecks: number;
  };
  bible: Array<{
    id: string;
    ok: boolean;
    promptMessages: number;
    scores: ScoreResult[];
    checks: CheckResult[];
  }>;
  chapters: ChapterEvalResult[];
}

function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}

async function readJsonFiles<T>(dir: string): Promise<T[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();

  return Promise.all(
    files.map(async (file) => {
      const raw = await fs.readFile(path.join(dir, file), "utf-8");
      return JSON.parse(raw) as T;
    }),
  );
}

function normalizeNovel(raw: NovelFixture): NovelFixture {
  const profile = NovelProfileSchema.parse(raw.profile);
  const bible = BibleDraftSchema.parse(raw.bible);
  return { ...raw, profile, bible };
}

function check(name: string, ok: boolean, detail: string): CheckResult {
  return { name, ok, detail };
}

function score(name: ScoreResult["name"], checks: CheckResult[]): ScoreResult {
  return {
    name,
    score: checks.filter((item) => item.ok).length,
    max: checks.length,
    checks,
  };
}

function countChecks(report: EvalReport) {
  const checks = [
    ...report.bible.flatMap((item) => item.checks),
    ...report.bible.flatMap((item) => item.scores.flatMap((scoreItem) => scoreItem.checks)),
    ...report.chapters.flatMap((item) => [
      ...item.writer.checks,
      ...item.critic.checks,
      ...item.stateDiff.checks,
    ]),
  ];
  return {
    passedChecks: checks.filter((item) => item.ok).length,
    failedChecks: checks.filter((item) => !item.ok).length,
  };
}

function buildPreviousChapters(fixture: ChapterFixture): Array<ChapterDraftView & { summary?: { summary: string } | null }> {
  return (fixture.previous_chapters ?? []).map((chapter) => ({
    id: `fixture-${fixture.id}-${chapter.chapter_index}`,
    chapter_index: chapter.chapter_index,
    title: chapter.title,
    content: chapter.content,
    status: chapter.status ?? "done",
    summary: chapter.summary ? { summary: chapter.summary } : null,
  }));
}

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function extractConflictTerms(text: string): string[] {
  const terms = new Set<string>();
  const normalized = text.replace(/[，。！？、,.!?\s]+/g, " ").trim();

  for (const part of normalized.split(/\s+/)) {
    if (part.length >= 2 && part.length <= 12) terms.add(part);
    const cjkChars = Array.from(part).filter((char) => /\p{Script=Han}/u.test(char));
    for (let index = 0; index < cjkChars.length - 1; index++) {
      terms.add(`${cjkChars[index]}${cjkChars[index + 1]}`);
    }
  }

  return [...terms].filter((term) => !["一个", "一名", "自己", "开始", "发现", "证明"].includes(term));
}

function fixtureConflictTerms(fixture: NovelFixture): string[] {
  const answerText = Object.values(fixture.answers ?? {})
    .flat()
    .join(" ");
  return [...new Set([
    ...extractConflictTerms(fixture.logline),
    ...extractConflictTerms(answerText),
  ])];
}

function evaluateBibleQuality(fixture: NovelFixture): ScoreResult[] {
  const bible = fixture.bible;
  const protagonist = bible.characters.find((character) => character.role === "protagonist");
  const antagonist = bible.characters.find((character) => character.role === "antagonist");
  const mentor = bible.characters.find((character) => character.role === "mentor");
  const outlineChapters = bible.outline.volume_1.chapters;
  const outlineText = outlineChapters.map((chapter) => `${chapter.title} ${chapter.summary}`).join("\n");
  const conflictTerms = fixtureConflictTerms(fixture);

  return [
    score("completeness", [
      check("has_core_roles", Boolean(protagonist && antagonist && mentor), "contains protagonist, antagonist, and mentor"),
      check("world_rules", bible.world.rules.length >= 2, `rules=${bible.world.rules.length}`),
      check("world_factions", bible.world.factions.length >= 2, `factions=${bible.world.factions.length}`),
      check("first_chapter_beats", bible.first_chapter_beats.length >= 5, `beats=${bible.first_chapter_beats.length}`),
    ]),
    score("outline_usability", [
      check("enough_chapters", outlineChapters.length >= 8, `chapters=${outlineChapters.length}`),
      check(
        "summaries_are_specific",
        outlineChapters.every((chapter) => chapter.summary.length >= 20 && chapter.summary.length <= 120),
        "each summary is 20-120 chars",
      ),
      check(
        "has_climax",
        includesAny(outlineText, ["高潮", "反制", "公开", "选择", "拆穿", "审判", "逆转", "幸存"]),
        "outline contains at least one escalation/climax cue",
      ),
      check(
        "has_foreshadowing",
        includesAny(outlineText, ["伏笔", "暗藏", "隐藏", "密信", "黑箱", "删改", "旧案", "内鬼"]),
        "outline contains at least one foreshadowing cue",
      ),
    ]),
    score("character_conflict", [
      check(
        "protagonist_motivation_links_logline",
        Boolean(
          protagonist &&
          conflictTerms.some((keyword) => protagonist.motivation.includes(keyword) || protagonist.goals.includes(keyword)),
        ),
        "protagonist motivation/goals reuse logline conflict terms",
      ),
      check(
        "antagonist_has_reason",
        Boolean(antagonist && antagonist.motivation.length >= 20 && !antagonist.motivation.includes("为坏而坏")),
        "antagonist motivation is specific",
      ),
      check(
        "goals_collide",
        Boolean(protagonist && antagonist && protagonist.goals !== antagonist.goals),
        "protagonist and antagonist goals are distinct",
      ),
      check(
        "secrets_drive_conflict",
        Boolean(
          protagonist?.secrets.length &&
          antagonist?.secrets.length &&
          includesAny([...protagonist.secrets, ...antagonist.secrets, outlineText].join("\n"), ["旧案", "秘密", "黑箱", "密信", "失忆", "剑魂", "通敌", "协议"]),
        ),
        "secrets connect to central conflict",
      ),
    ]),
  ];
}

async function runBibleFixture(fixture: NovelFixture) {
  const messages = buildBiblePrompt({
    logline: fixture.logline,
    profile: fixture.profile,
    answers: fixture.answers,
  });
  const checks = [
    check("schema", BibleDraftSchema.safeParse(fixture.bible).success, "Bible fixture passes BibleDraftSchema"),
    check("prompt_has_system_and_user", messages.length === 2, `prompt messages=${messages.length}`),
    check(
      "protagonist_exists",
      fixture.bible.characters.some((character) => character.role === "protagonist"),
      "Bible contains a protagonist",
    ),
  ];
  const scores = evaluateBibleQuality(fixture);

  return {
    id: fixture.id,
    ok: checks.every((item) => item.ok) && scores.every((item) => item.score === item.max),
    promptMessages: messages.length,
    scores,
    checks,
  };
}

async function runWriter(context: ReturnType<typeof buildChapterContext>, profile: NovelProfile, existingContent?: string) {
  let content = "";
  const result = await streamChatCompletionWithRetry(
    {
      route: "/scripts/eval-ai-quality/chapters/draft",
      agent: "writer",
      messages: buildChapterPrompt({ context, profile, existingContent }),
      temperature: 0.7,
      timeoutMs: 120_000,
    },
    {
      onDelta(delta) {
        content += delta;
      },
    },
    0,
  );

  return { ...result, content: cleanupWriterOutput(content || result.content) };
}

async function runCritic(context: ReturnType<typeof buildChapterContext>, chapterContent: string, chapterIndex: number): Promise<CriticResult & { model: string; tookMs: number }> {
  const result = await chatCompletionWithRetry(
    {
      route: "/scripts/eval-ai-quality/chapters/critic",
      agent: "critic",
      messages: buildCriticPrompt({ context, chapterContent, chapterIndex }),
      responseFormat: "json_object",
      temperature: 0,
      timeoutMs: 120_000,
    },
    0,
  );
  const parsed = JSON.parse(result.content) as Partial<CriticResult>;
  const issues = Array.isArray(parsed.issues) ? parsed.issues : [];
  return {
    consistent: parsed.consistent === true || issues.length === 0,
    issues,
    model: result.model,
    tookMs: result.tookMs,
  };
}

async function runStateDiff(input: {
  bible: BibleDraft;
  chapterIndex: number;
  chapterTitle: string;
  chapterContent: string;
}): Promise<StateDiff & { model: string; tookMs: number }> {
  const result = await chatCompletionWithRetry(
    {
      route: "/scripts/eval-ai-quality/state-diff",
      agent: "state_updater",
      messages: buildStateDiffPrompt({
        bible: input.bible,
        storyState: input.bible.story_state,
        chapterIndex: input.chapterIndex,
        chapterTitle: input.chapterTitle,
        chapterContent: input.chapterContent,
      }),
      responseFormat: "json_object",
      temperature: 0,
      timeoutMs: 90_000,
    },
    0,
  );
  const parsed = JSON.parse(result.content) as unknown;
  const diff = StateDiffSchema.parse(parsed);
  return { ...diff, model: result.model, tookMs: result.tookMs };
}

async function runChapterFixture(fixture: ChapterFixture, novel: NovelFixture): Promise<ChapterEvalResult> {
  const context = buildChapterContext(
    novel.bible,
    buildPreviousChapters(fixture),
    fixture.chapter_index,
    {
      retrievedMemories: (fixture.retrieved_memories ?? []).map((memory) => ({
        source: memory.source,
        text: memory.text,
        reason: memory.reason,
      })),
      retrievalStatus: (fixture.retrieved_memories?.length ?? 0) > 0 ? "success" : "empty",
    },
  );

  const writer = fixture.fixed_chapter_content
    ? {
        content: fixture.fixed_chapter_content,
        model: "fixture",
        tookMs: 0,
      }
    : await runWriter(context, novel.profile, fixture.existing_content);
  const writerChecks = [
    check("non_empty", writer.content.trim().length > 0, `${writer.content.trim().length} chars`),
    check(
      "source",
      fixture.fixed_chapter_content ? writer.model === "fixture" : writer.model !== "fixture",
      fixture.fixed_chapter_content ? "uses fixed chapter content" : "generated by writer",
    ),
    ...(fixture.expected?.writer_must_include ?? []).map((term) =>
      check(`includes:${term}`, writer.content.includes(term), `writer output includes ${term}`),
    ),
  ];

  const critic = await runCritic(context, writer.content, fixture.chapter_index);
  const expectedIssueTypes = fixture.expected?.critic_issue_types ?? [];
  const criticChecks = [
    check("json_shape", typeof critic.consistent === "boolean" && Array.isArray(critic.issues), "critic returned structured result"),
    check(
      "expected_issue_types",
      expectedIssueTypes.every((type) => critic.issues.some((issue) => issue.type === type)),
      expectedIssueTypes.length > 0 ? `expected ${expectedIssueTypes.join(", ")}` : "no required issue types",
    ),
  ];

  const stateDiff = await runStateDiff({
    bible: novel.bible,
    chapterIndex: fixture.chapter_index,
    chapterTitle: fixture.chapter_title,
    chapterContent: writer.content,
  });
  const minTimelineEvents = fixture.expected?.state_diff_min_timeline_events ?? 0;
  const expectedCharacters = fixture.expected?.state_diff_character_updates ?? [];
  const expectedPlotThreads = fixture.expected?.state_diff_plot_threads ?? [];
  const expectedEntities = fixture.expected?.state_diff_new_entities ?? [];
  const stateDiffChecks = [
    check("schema", StateDiffSchema.safeParse(stateDiff).success, "state diff passes schema"),
    check(
      "timeline_min",
      stateDiff.timeline_events.length >= minTimelineEvents,
      `timeline events=${stateDiff.timeline_events.length}, required>=${minTimelineEvents}`,
    ),
    ...expectedCharacters.map((name) =>
      check(
        `character_update:${name}`,
        stateDiff.character_updates.some((update) => update.name === name),
        `state diff includes character update for ${name}`,
      ),
    ),
    ...expectedPlotThreads.map((title) =>
      check(
        `plot_thread:${title}`,
        stateDiff.plot_thread_updates.some((update) => update.title === title),
        `state diff includes plot thread ${title}`,
      ),
    ),
    ...expectedEntities.map((name) =>
      check(
        `new_entity:${name}`,
        stateDiff.new_entities.some((entity) => entity.name === name),
        `state diff includes new entity ${name}`,
      ),
    ),
  ];

  return {
    id: fixture.id,
    novelId: novel.id,
    description: fixture.description,
    writer: {
      ok: writerChecks.every((item) => item.ok),
      chars: writer.content.length,
      checks: writerChecks,
      excerpt: writer.content.slice(0, 160),
      model: writer.model,
      tookMs: writer.tookMs,
    },
    critic: {
      ok: criticChecks.every((item) => item.ok),
      consistent: critic.consistent,
      issueCount: critic.issues.length,
      checks: criticChecks,
      model: critic.model,
      tookMs: critic.tookMs,
    },
    stateDiff: {
      ok: stateDiffChecks.every((item) => item.ok),
      timelineEvents: stateDiff.timeline_events.length,
      characterUpdates: stateDiff.character_updates.length,
      checks: stateDiffChecks,
      model: stateDiff.model,
      tookMs: stateDiff.tookMs,
    },
  };
}

function markdownStatus(ok: boolean): string {
  return ok ? "PASS" : "FAIL";
}

function renderMarkdown(report: EvalReport): string {
  const lines: string[] = [
    "# AI 质量评估报告",
    "",
    `- 生成时间：${report.generatedAt}`,
    `- LLM_MOCK：${report.mock ? "on" : "off"}`,
    `- Novel fixtures：${report.summary.novelFixtures}`,
    `- Chapter fixtures：${report.summary.chapterFixtures}`,
    `- Checks：${report.summary.passedChecks} passed / ${report.summary.failedChecks} failed`,
    "",
    "## Bible Fixtures",
    "",
    "| Fixture | 状态 | Checks |",
    "|---|---|---|",
    ...report.bible.map((item) => {
      const schemaChecks = item.checks.map((entry) => `${entry.name}:${markdownStatus(entry.ok)}`).join("<br>");
      const scoreChecks = item.scores
        .map((entry) => `${entry.name}:${entry.score}/${entry.max}`)
        .join("<br>");
      return `| ${item.id} | ${markdownStatus(item.ok)} | ${schemaChecks}<br>${scoreChecks} |`;
    }),
    "",
    "## Chapter Fixtures",
    "",
    "| Fixture | Writer | Critic | StateDiff | 摘要 |",
    "|---|---|---|---|---|",
    ...report.chapters.map((item) =>
      [
        `| ${item.id}`,
        `${markdownStatus(item.writer.ok)} (${item.writer.chars} chars)`,
        `${markdownStatus(item.critic.ok)} (${item.critic.issueCount} issues)`,
        `${markdownStatus(item.stateDiff.ok)} (${item.stateDiff.timelineEvents} timeline)`,
        item.writer.excerpt.replace(/\s+/g, " "),
      ].join(" | ") + " |",
    ),
    "",
  ];

  return lines.join("\n");
}

async function writeReports(report: EvalReport) {
  await fs.mkdir(REPORT_DIR, { recursive: true });
  const date = report.generatedAt.slice(0, 10);
  const json = JSON.stringify(report, null, 2);
  const markdown = renderMarkdown(report);

  await Promise.all([
    fs.writeFile(path.join(REPORT_DIR, "latest.json"), `${json}\n`, "utf-8"),
    fs.writeFile(path.join(REPORT_DIR, "latest.md"), `${markdown}\n`, "utf-8"),
    fs.writeFile(path.join(REPORT_DIR, `${date}.md`), `${markdown}\n`, "utf-8"),
  ]);
}

async function main() {
  const novels = (await readJsonFiles<NovelFixture>(NOVEL_FIXTURE_DIR)).map(normalizeNovel);
  const chapters = await readJsonFiles<ChapterFixture>(CHAPTER_FIXTURE_DIR);
  const novelById = new Map(novels.map((novel) => [novel.id, novel]));

  const bibleResults = await Promise.all(novels.map(runBibleFixture));
  const chapterResults: ChapterEvalResult[] = [];
  for (const chapter of chapters) {
    const novel = novelById.get(chapter.novel_fixture);
    if (!novel) throw new Error(`Missing novel fixture: ${chapter.novel_fixture}`);
    chapterResults.push(await runChapterFixture(chapter, novel));
  }

  const report: EvalReport = {
    generatedAt: new Date().toISOString(),
    mock: process.env.LLM_MOCK === "1" || process.env.LLM_MOCK === "true",
    summary: {
      novelFixtures: novels.length,
      chapterFixtures: chapters.length,
      passedChecks: 0,
      failedChecks: 0,
    },
    bible: bibleResults,
    chapters: chapterResults,
  };
  report.summary = { ...report.summary, ...countChecks(report) };

  await writeReports(report);
  console.log(`[eval:ai] ${report.summary.passedChecks} passed / ${report.summary.failedChecks} failed`);
  console.log("[eval:ai] wrote docs/evals/latest.md and docs/evals/latest.json");

  if (report.summary.failedChecks > 0) process.exit(1);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[eval:ai] failed: ${message}`);
  process.exit(1);
});

// Keep exhaustive-helper live for future discriminated report sections.
void assertNever;
