import fs from "node:fs/promises";
import path from "node:path";
import { config as loadEnv } from "dotenv";

import { buildChapterContext, type ChapterDraftView } from "@/lib/agent/chapterContext";
import { chatCompletionWithRetry } from "@/lib/llm/client";
import { buildCriticPrompt, type CriticResult } from "@/lib/llm/prompts/critic";
import { buildChapterRevisionPrompt } from "@/lib/llm/prompts/chapterRevision";
import { getGenerationPolicy } from "@/lib/llm/generationPolicy";
import { collectAiWritingTraceHits } from "@/lib/llm/prompts/humanStyle";
import type { CriticIssue } from "@/lib/agent/contracts";
import { BibleDraftSchema, NovelProfileSchema, type BibleDraft, type NovelProfile } from "@/lib/validation/schemas";

loadEnv({ path: ".env" });
loadEnv();

const ROOT = process.cwd();
const FIXTURE_DIR = path.join(ROOT, "scripts", "fixtures", "eval-novels");
const REPORT_DIR = path.join(ROOT, "docs", "evals");

// Causal-cue vocabulary used to detect whether a logic_chain revision actually
// added the "goal -> obstacle -> action -> result" connective tissue the issue
// asked for. Counting these before/after is a coarse but honest signal.
const CAUSAL_CUES = ["因为", "所以", "于是", "因此", "为了", "导致", "使得", "结果", "意味着", "这才", "正因为", "只有", "否则", "一旦"];

interface NovelFixture {
  id: string;
  profile: NovelProfile;
  bible: BibleDraft;
}

/**
 * A chapter deliberately written to trip the critic, plus the issue types a
 * human reviewer would expect to be flagged. The gap between expected and
 * actually-reported is the "critic recall" — the Day 4 finding that the critic
 * under-reports prose / logic problems.
 */
interface BuggyChapter {
  fixtureId: string;
  chapterIndex: number;
  title: string;
  content: string;
  expectedIssueTypes: CriticIssue["type"][];
  note: string;
}

interface IssueOutcome {
  type: CriticIssue["type"];
  severity: CriticIssue["severity"];
  description: string;
  verifiable: boolean;
  addressed: boolean;
  signal: string;
}

interface ChapterResult {
  fixtureId: string;
  chapterIndex: number;
  title: string;
  expectedIssueTypes: CriticIssue["type"][];
  reportedIssueTypes: CriticIssue["type"][];
  criticCaughtExpected: CriticIssue["type"][];
  criticMissedExpected: CriticIssue["type"][];
  revised: boolean;
  charsBefore: number;
  charsAfter: number;
  aiTraceBefore: number;
  aiTraceAfter: number;
  causalBefore: number;
  causalAfter: number;
  issues: IssueOutcome[];
}

const BUGGY_CHAPTERS: BuggyChapter[] = [
  {
    fixtureId: "urban-suspense",
    chapterIndex: 2,
    title: "停职令",
    expectedIssueTypes: ["prose_quality"],
    note: "三连排比 + 句首重复 + 聊天机器人套话密集，prose_quality 应被 critic 命中。",
    content: [
      "他检查了储物柜、办公室、家里。",
      "他检查了抽屉、文件、记录。",
      "他检查了证物、签名、时间。",
      "如果你愿意，可以认为这是巧合。如果你愿意，也可以认为这是陷阱。",
      "林砚站起来。林砚坐下。林砚又站起来。",
      "这构成了一个问题，这构成了一种压力，这构成了一道无法回避的墙。",
    ].join("\n\n"),
  },
  {
    fixtureId: "urban-suspense",
    chapterIndex: 3,
    title: "白塔档案",
    expectedIssueTypes: ["logic_chain"],
    note: "事件堆叠无因果：主角直接得出结论，缺'目标->阻碍->行动->结果'链，logic_chain 应被命中。",
    content: [
      "林砚来到白塔医院。",
      "他看了档案。",
      "档案被删改了。",
      "他离开了医院。",
      "顾沉舟出现了。",
      "林砚回到车里。他知道凶手是谁了。他发动引擎。",
    ].join("\n\n"),
  },
  {
    fixtureId: "xuanhuan-seed",
    chapterIndex: 2,
    title: "黑牌入手",
    expectedIssueTypes: ["world_rule"],
    note: "正文写'剑魂可以随意转移给他人'，直接违背 Bible 的'剑魂认主不可逆'，world_rule 应被命中。",
    content: [
      "沈言握着黑牌，几在他脑海里冷笑。",
      "“这剑魂可以随便转给别人，”几说，“你想给谁就给谁，认主根本不算数。”",
      "沈言点头，把剑魂随手转给了路过的师兄。师兄接过剑魂，毫无障碍。",
      "他又把剑魂要了回来，像借还一件工具那样轻松。",
    ].join("\n\n"),
  },
];

async function readFixture(id: string): Promise<NovelFixture> {
  const raw = JSON.parse(await fs.readFile(path.join(FIXTURE_DIR, `${id}.json`), "utf-8")) as NovelFixture;
  return {
    id,
    profile: NovelProfileSchema.parse(raw.profile),
    bible: BibleDraftSchema.parse(raw.bible),
  };
}

function shouldUseRealLlm(): boolean {
  const mock = process.env.LLM_MOCK === "1" || process.env.LLM_MOCK === "true";
  return !mock && Boolean(process.env.DEEPSEEK_API_KEY);
}

function stripCodeFence(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

// Models sometimes emit the JSON object followed by trailing commentary ("Here is
// the analysis...{...}\n\nNote: ..."). JSON.parse chokes on that trailing text, so
// slice out the first balanced top-level object (string-aware) before parsing.
function extractFirstJsonObject(text: string): string {
  const start = text.indexOf("{");
  if (start === -1) return text;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return text.slice(start);
}

function parseCriticResult(raw: string): Partial<CriticResult> {
  const body = extractFirstJsonObject(stripCodeFence(raw));
  try {
    return JSON.parse(body) as Partial<CriticResult>;
  } catch {
    // Fallback for models that delimit JSON strings with full-width quotes.
    return JSON.parse(body.replace(/[“”]/g, '"').replace(/[‘’]/g, "'")) as Partial<CriticResult>;
  }
}

function aiTraceTotal(text: string): number {
  return collectAiWritingTraceHits(text).reduce((sum, hit) => sum + hit.count, 0);
}

function causalCueCount(text: string): number {
  return CAUSAL_CUES.reduce((sum, cue) => sum + (text.split(cue).length - 1), 0);
}

function buildContext(bible: BibleDraft, chapter: BuggyChapter) {
  const views: Array<ChapterDraftView & { summary?: { summary: string } | null }> = [];
  return buildChapterContext(bible, views, chapter.chapterIndex, { retrievalStatus: "empty" });
}

async function runCritic(fixture: NovelFixture, chapter: BuggyChapter): Promise<CriticResult> {
  const context = buildContext(fixture.bible, chapter);
  const isMystery = getGenerationPolicy(fixture.profile).isMystery;
  const result = await chatCompletionWithRetry(
    {
      route: "/scripts/eval-critic-revise/critic",
      agent: "critic",
      messages: buildCriticPrompt({
        context,
        chapterContent: chapter.content,
        chapterIndex: chapter.chapterIndex,
        isMystery,
      }),
      responseFormat: "json_object",
      temperature: 0,
      timeoutMs: 90_000,
    },
    0,
  );
  const parsed = parseCriticResult(result.content);
  return {
    consistent: Boolean(parsed.consistent),
    issues: Array.isArray(parsed.issues) ? parsed.issues : [],
  };
}

async function runRevision(fixture: NovelFixture, chapter: BuggyChapter, issues: CriticIssue[]): Promise<string> {
  const context = buildContext(fixture.bible, chapter);
  const result = await chatCompletionWithRetry(
    {
      route: "/scripts/eval-critic-revise/revise",
      agent: "writer",
      messages: buildChapterRevisionPrompt({ context, chapterContent: chapter.content, issues }),
      temperature: 0.5,
      timeoutMs: 120_000,
    },
    0,
  );
  // Revision output is prose, not JSON — only strip an accidental code fence.
  // (Do NOT normalize Chinese quotes here; that would mangle dialogue punctuation.)
  return stripCodeFence(result.content);
}

// Deterministic offline stand-ins so the plumbing runs under LLM_MOCK=1.
function fallbackCritic(chapter: BuggyChapter): CriticResult {
  const issues: CriticIssue[] = chapter.expectedIssueTypes.map((type) => ({
    type,
    severity: type === "world_rule" ? "critical" : type === "logic_chain" ? "major" : "minor",
    description: `[fallback] 预期问题类型 ${type}`,
    suggestion: "fallback 建议",
  }));
  return { consistent: issues.length === 0, issues };
}

function classifyOutcome(issue: CriticIssue, before: { ai: number; causal: number }, after: { ai: number; causal: number }, revised: boolean): IssueOutcome {
  let verifiable = false;
  let addressed = false;
  let signal = "";

  if (issue.type === "prose_quality" || issue.type === "tone") {
    verifiable = true;
    addressed = revised && after.ai < before.ai;
    signal = `AI 痕迹 ${before.ai} -> ${after.ai}`;
  } else if (issue.type === "logic_chain") {
    verifiable = true;
    addressed = revised && after.causal > before.causal;
    signal = `因果连接词 ${before.causal} -> ${after.causal}`;
  } else {
    verifiable = false;
    addressed = false;
    signal = "语义类问题，离线无法自动验证（仅记录是否发生改写）";
  }

  return {
    type: issue.type,
    severity: issue.severity,
    description: issue.description,
    verifiable,
    addressed,
    signal,
  };
}

async function evaluateChapter(fixture: NovelFixture, chapter: BuggyChapter, useRealLlm: boolean): Promise<ChapterResult> {
  const critic = useRealLlm ? await runCritic(fixture, chapter) : fallbackCritic(chapter);
  const reportedIssueTypes = [...new Set(critic.issues.map((i) => i.type))];
  const criticCaughtExpected = chapter.expectedIssueTypes.filter((t) => reportedIssueTypes.includes(t));
  const criticMissedExpected = chapter.expectedIssueTypes.filter((t) => !reportedIssueTypes.includes(t));

  const before = { ai: aiTraceTotal(chapter.content), causal: causalCueCount(chapter.content) };

  let revisedText = chapter.content;
  let revised = false;
  if (critic.issues.length > 0) {
    revisedText = useRealLlm ? await runRevision(fixture, chapter, critic.issues) : chapter.content;
    revised = revisedText.trim() !== chapter.content.trim();
  }

  const after = { ai: aiTraceTotal(revisedText), causal: causalCueCount(revisedText) };
  const issues = critic.issues.map((issue) => classifyOutcome(issue, before, after, revised));

  return {
    fixtureId: chapter.fixtureId,
    chapterIndex: chapter.chapterIndex,
    title: chapter.title,
    expectedIssueTypes: chapter.expectedIssueTypes,
    reportedIssueTypes,
    criticCaughtExpected,
    criticMissedExpected,
    revised,
    charsBefore: chapter.content.length,
    charsAfter: revisedText.length,
    aiTraceBefore: before.ai,
    aiTraceAfter: after.ai,
    causalBefore: before.causal,
    causalAfter: after.causal,
    issues,
  };
}

function renderMarkdown(results: ChapterResult[], mode: string): string {
  const expectedTotal = results.reduce((s, r) => s + r.expectedIssueTypes.length, 0);
  const caughtTotal = results.reduce((s, r) => s + r.criticCaughtExpected.length, 0);
  const verifiableIssues = results.flatMap((r) => r.issues).filter((i) => i.verifiable);
  const addressedIssues = verifiableIssues.filter((i) => i.addressed);

  const criticRecall = expectedTotal === 0 ? 0 : Math.round((caughtTotal / expectedTotal) * 1000) / 10;
  const reviseHitRate = verifiableIssues.length === 0 ? 0 : Math.round((addressedIssues.length / verifiableIssues.length) * 1000) / 10;

  const lines = [
    "# Critic → Revise 命中率",
    "",
    `- 生成时间：${new Date().toISOString()}`,
    `- 模式：${mode}`,
    "",
    "## 两个核心指标",
    "",
    `- **Critic recall（漏报率的反面）**：人类预期的 ${expectedTotal} 个问题类型里，critic 实际报出 ${caughtTotal} 个 = **${criticRecall}%**`,
    `- **Revise 命中率**：critic 报出的可验证问题 ${verifiableIssues.length} 个里，revise measurably 解决 ${addressedIssues.length} 个 = **${reviseHitRate}%**`,
    "",
    "> Critic recall 低 = critic 看不见问题（Day 9 改 critic 提示）。",
    "> Revise 命中率低 = critic 看见了但 revise 没改对（Day 9 改 revise 提示）。",
    "",
    "## 逐章结果",
    "",
    "| 章节 | 预期问题 | critic 报出 | 漏报 | 已改写 | AI痕迹 | 因果词 |",
    "|---|---|---|---|:---:|---|---|",
    ...results.map((r) =>
      `| ${r.fixtureId} 第${r.chapterIndex}章 | ${r.expectedIssueTypes.join(",")} | ${r.reportedIssueTypes.join(",") || "（无）"} | ${r.criticMissedExpected.join(",") || "无"} | ${r.revised ? "是" : "否"} | ${r.aiTraceBefore}→${r.aiTraceAfter} | ${r.causalBefore}→${r.causalAfter} |`,
    ),
    "",
    "## 逐问题判定",
    "",
    "| 章节 | 类型 | 严重度 | 可验证 | 已解决 | 信号 |",
    "|---|---|---|:---:|:---:|---|",
    ...results.flatMap((r) =>
      r.issues.map((i) =>
        `| ${r.fixtureId} 第${r.chapterIndex}章 | ${i.type} | ${i.severity} | ${i.verifiable ? "是" : "否"} | ${i.addressed ? "是" : "否"} | ${i.signal} |`,
      ),
    ),
    "",
  ];
  return lines.join("\n");
}

async function main() {
  const useRealLlm = shouldUseRealLlm();
  const mode = useRealLlm ? "real_llm" : "fixture_fallback";
  const fixtureCache = new Map<string, NovelFixture>();
  const results: ChapterResult[] = [];

  for (const chapter of BUGGY_CHAPTERS) {
    let fixture = fixtureCache.get(chapter.fixtureId);
    if (!fixture) {
      fixture = await readFixture(chapter.fixtureId);
      fixtureCache.set(chapter.fixtureId, fixture);
    }
    const result = await evaluateChapter(fixture, chapter, useRealLlm);
    results.push(result);
    console.log(
      `[eval:critic-revise] ${chapter.fixtureId} 第${chapter.chapterIndex}章: 预期 ${chapter.expectedIssueTypes.join(",")} / 报出 ${result.reportedIssueTypes.join(",") || "无"} / 改写 ${result.revised}`,
    );
  }

  await fs.mkdir(REPORT_DIR, { recursive: true });
  await fs.writeFile(path.join(REPORT_DIR, "critic-revise-hit-rate.md"), `${renderMarkdown(results, mode)}\n`, "utf-8");
  await fs.writeFile(path.join(REPORT_DIR, "critic-revise-hit-rate.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), mode, results }, null, 2)}\n`, "utf-8");

  const expectedTotal = results.reduce((s, r) => s + r.expectedIssueTypes.length, 0);
  const caughtTotal = results.reduce((s, r) => s + r.criticCaughtExpected.length, 0);
  console.log(`[eval:critic-revise] critic recall ${caughtTotal}/${expectedTotal}; wrote docs/evals/critic-revise-hit-rate.md`);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[eval:critic-revise] failed: ${message}`);
  process.exit(1);
});
