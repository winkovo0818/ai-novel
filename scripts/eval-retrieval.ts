import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const FIXTURE_PATH = path.join(ROOT, "scripts", "fixtures", "retrieval-cases.json");
const REPORT_DIR = path.join(ROOT, "docs", "evals");

interface RetrievalMemoryFixture {
  id: string;
  source: string;
  chapter_index: number;
  text: string;
}

interface RetrievalCaseFixture {
  id: string;
  description: string;
  query: string;
  expected_memory_ids: string[];
  memories: RetrievalMemoryFixture[];
}

interface RetrievalCaseResult {
  id: string;
  description: string;
  expected: string[];
  top3: string[];
  top5: string[];
  recallAt3: number;
  recallAt5: number;
  missedAt5: string[];
}

interface RetrievalReport {
  generatedAt: string;
  cases: RetrievalCaseResult[];
  summary: {
    cases: number;
    recallAt3: number;
    recallAt5: number;
    missedAt5: string[];
  };
}

function tokenize(text: string): string[] {
  const tokens = new Set<string>();
  const normalized = text.toLowerCase().replace(/[，。！？、,.!?\s]+/g, " ");
  for (const part of normalized.split(/\s+/)) {
    if (!part) continue;
    if (part.length >= 2) tokens.add(part);
    const chars = Array.from(part).filter((char) => /\p{Script=Han}/u.test(char));
    for (let index = 0; index < chars.length - 1; index++) {
      tokens.add(`${chars[index]}${chars[index + 1]}`);
    }
  }
  return [...tokens].filter((token) => !["一个", "一名", "需要", "是否", "自己", "相关"].includes(token));
}

function scoreMemory(queryTokens: string[], memory: RetrievalMemoryFixture): number {
  const memoryTokens = new Set(tokenize(memory.text));
  const overlap = queryTokens.filter((token) => memoryTokens.has(token)).length;
  const phraseBonus = queryTokens.some((token) => token.length >= 4 && memory.text.includes(token)) ? 2 : 0;
  const sourceBonus = memory.source.startsWith("chapter:") ? 0.1 : 0;
  return overlap + phraseBonus + sourceBonus;
}

function evaluateCase(input: RetrievalCaseFixture): RetrievalCaseResult {
  const queryTokens = tokenize(input.query);
  const ranked = input.memories
    .map((memory) => ({ memory, score: scoreMemory(queryTokens, memory) }))
    .sort((a, b) => b.score - a.score || a.memory.chapter_index - b.memory.chapter_index)
    .map((item) => item.memory.id);

  const top3 = ranked.slice(0, 3);
  const top5 = ranked.slice(0, 5);
  const expected = input.expected_memory_ids;
  const hitAt3 = expected.filter((id) => top3.includes(id));
  const hitAt5 = expected.filter((id) => top5.includes(id));

  return {
    id: input.id,
    description: input.description,
    expected,
    top3,
    top5,
    recallAt3: expected.length === 0 ? 1 : hitAt3.length / expected.length,
    recallAt5: expected.length === 0 ? 1 : hitAt5.length / expected.length,
    missedAt5: expected.filter((id) => !top5.includes(id)),
  };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function renderMarkdown(report: RetrievalReport): string {
  const lines = [
    "# Retrieval 召回评估",
    "",
    `- 生成时间：${report.generatedAt}`,
    `- Cases：${report.summary.cases}`,
    `- Recall@3：${report.summary.recallAt3.toFixed(3)}`,
    `- Recall@5：${report.summary.recallAt5.toFixed(3)}`,
    `- Missed@5：${report.summary.missedAt5.length ? report.summary.missedAt5.join(", ") : "无"}`,
    "",
    "| Case | Recall@3 | Recall@5 | Top3 | Missed@5 |",
    "|---|---:|---:|---|---|",
    ...report.cases.map((item) =>
      [
        `| ${item.id}`,
        item.recallAt3.toFixed(3),
        item.recallAt5.toFixed(3),
        item.top3.join(", "),
        item.missedAt5.length ? item.missedAt5.join(", ") : "无",
      ].join(" | ") + " |",
    ),
    "",
  ];

  return lines.join("\n");
}

async function main() {
  const raw = await fs.readFile(FIXTURE_PATH, "utf-8");
  const cases = JSON.parse(raw) as RetrievalCaseFixture[];
  const results = cases.map(evaluateCase);
  const report: RetrievalReport = {
    generatedAt: new Date().toISOString(),
    cases: results,
    summary: {
      cases: results.length,
      recallAt3: average(results.map((item) => item.recallAt3)),
      recallAt5: average(results.map((item) => item.recallAt5)),
      missedAt5: results.flatMap((item) => item.missedAt5.map((id) => `${item.id}:${id}`)),
    },
  };

  await fs.mkdir(REPORT_DIR, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(REPORT_DIR, "retrieval-latest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf-8"),
    fs.writeFile(path.join(REPORT_DIR, "retrieval-latest.md"), `${renderMarkdown(report)}\n`, "utf-8"),
  ]);

  console.log(`[eval:retrieval] recall@3=${report.summary.recallAt3.toFixed(3)} recall@5=${report.summary.recallAt5.toFixed(3)}`);
  console.log("[eval:retrieval] wrote docs/evals/retrieval-latest.md and docs/evals/retrieval-latest.json");

  if (report.summary.recallAt5 < 1) process.exit(1);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[eval:retrieval] failed: ${message}`);
  process.exit(1);
});
