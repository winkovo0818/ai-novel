/**
 * Docs/code drift guard.
 *
 * Runs in the verify chain after lint/typecheck/test and asserts that the
 * numbers floating around in README.md / docs/STATUS.md / docs/HEALTH.md
 * still match the filesystem. This is the cheapest way to catch the kind
 * of "STATUS says 489 tests, HEALTH says 394" drift that the 2026-05-12
 * project review surfaced.
 *
 * What it actually checks (kept intentionally small):
 *
 *   1. Filesystem ground truth — counts every API route, page, migration,
 *      Prisma model, .test.ts file, plus the useChapterEditor.ts line count.
 *   2. STATUS.md + HEALTH.md must mention those counts and they must match.
 *   3. README.md must NOT inline volatile numbers ("\d+ tests", "\d+ files")
 *      nor mention "next-intl" (the i18n stack was removed in 2026-05-11).
 *
 * We don't run vitest here — verify already did. The test-file count is the
 * stable proxy: adding a test file requires touching the same PR that
 * adjusts STATUS/HEALTH, so a missed update fails this script next push.
 *
 * Exit 0 = all checks pass; 1 = drift detected (CI fails the verify step).
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

interface Check {
  name: string;
  expected: string | number;
  actual: string | number;
  source: string;
  ok: boolean;
}

const REPO_ROOT = resolve(__dirname, "..");

function walk(dir: string, files: string[] = []): string[] {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git" || entry.name === "coverage") {
      continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (entry.isFile()) {
      files.push(full.replace(/\\/g, "/"));
    }
  }
  return files;
}

function lineCount(file: string): number {
  const text = readFileSync(file, "utf-8");
  // Match wc -l semantics: count terminating newlines.
  const matches = text.match(/\n/g);
  return matches ? matches.length : 0;
}

function readDoc(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), "utf-8");
}

function extractNumber(text: string, pattern: RegExp): number | null {
  const m = text.match(pattern);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function check(name: string, expected: string | number, actual: string | number, source: string): Check {
  return { name, expected, actual, source, ok: String(expected) === String(actual) };
}

// ── Filesystem ground truth ──────────────────────────────────────────────
const allFiles = walk(REPO_ROOT);
const relFiles = allFiles.map((p) => p.replace(REPO_ROOT.replace(/\\/g, "/") + "/", ""));

const apiRoutes = relFiles.filter((p) => p.startsWith("app/api/") && p.endsWith("/route.ts")).length;
const pages = relFiles.filter((p) => p.startsWith("app/") && p.endsWith("/page.tsx")).length;
const migrations = relFiles.filter((p) => p.startsWith("prisma/migrations/") && p.endsWith("/migration.sql")).length;
const testFiles = relFiles.filter(
  (p) => (p.startsWith("app/") || p.startsWith("lib/") || p.startsWith("scripts/")) && p.endsWith(".test.ts"),
).length;
const editorLines = lineCount(resolve(REPO_ROOT, "app/(app)/editor/[novelId]/useChapterEditor.ts"));
const schemaText = readDoc("prisma/schema.prisma");
const prismaModels = (schemaText.match(/^model\s+\w+\s*{/gm) ?? []).length;

// ── Documents under check ────────────────────────────────────────────────
const status = readDoc("docs/STATUS.md");
const health = readDoc("docs/HEALTH.md");
const readme = readDoc("README.md");

const checks: Check[] = [];

// STATUS §一 line: "**68 files / 489 tests**"
checks.push(
  check(
    "STATUS §一 test files",
    testFiles,
    extractNumber(status, /\*\*(\d+)\s*files\s*\/\s*\d+\s*tests\*\*/) ?? "missing",
    "docs/STATUS.md",
  ),
);

// STATUS 代码规模 row: "38 个 API route · 21 个 page.tsx · 22 条 Prisma migration · 15 个 Prisma model"
checks.push(
  check(
    "STATUS 代码规模 API route",
    apiRoutes,
    extractNumber(status, /(\d+)\s*个\s*API\s*route/) ?? "missing",
    "docs/STATUS.md",
  ),
);
checks.push(
  check(
    "STATUS 代码规模 page.tsx",
    pages,
    extractNumber(status, /(\d+)\s*个\s*page\.tsx/) ?? "missing",
    "docs/STATUS.md",
  ),
);
checks.push(
  check(
    "STATUS 代码规模 Prisma migration",
    migrations,
    extractNumber(status, /(\d+)\s*条\s*Prisma\s*migration/) ?? "missing",
    "docs/STATUS.md",
  ),
);
checks.push(
  check(
    "STATUS 代码规模 Prisma model",
    prismaModels,
    extractNumber(status, /(\d+)\s*个\s*Prisma\s*model/) ?? "missing",
    "docs/STATUS.md",
  ),
);

// STATUS migration 提要: "累计 migration（22 条）"
checks.push(
  check(
    "STATUS migration 累计",
    migrations,
    extractNumber(status, /累计\s*migration[（(]\s*(\d+)\s*条/) ?? "missing",
    "docs/STATUS.md",
  ),
);

// HEALTH §一: "**68 files / 489 tests**"
checks.push(
  check(
    "HEALTH §一 test files",
    testFiles,
    extractNumber(health, /\*\*(\d+)\s*files\s*\/\s*\d+\s*tests\*\*/) ?? "missing",
    "docs/HEALTH.md",
  ),
);

// HEALTH 规模行: "38 个 API route + 21 个 page.tsx"
checks.push(
  check(
    "HEALTH 规模 API route",
    apiRoutes,
    extractNumber(health, /(\d+)\s*个\s*API\s*route/) ?? "missing",
    "docs/HEALTH.md",
  ),
);
checks.push(
  check(
    "HEALTH 规模 page.tsx",
    pages,
    extractNumber(health, /(\d+)\s*个\s*page\.tsx/) ?? "missing",
    "docs/HEALTH.md",
  ),
);
checks.push(
  check(
    "HEALTH Prisma migrations",
    migrations,
    extractNumber(health, /(\d+)\s*条\s*\|\s*含/) ?? extractNumber(health, /Prisma\s*migrations\s*\|\s*(\d+)\s*条/) ?? "missing",
    "docs/HEALTH.md",
  ),
);

// HEALTH useChapterEditor 行数: "896 行" — checked twice (待办 + 下一步建议)
const editorLinesInHealth = [...health.matchAll(/useChapterEditor[\.\s]*[^\d]{0,15}(\d{3,4})\s*行/g)].map((m) => Number(m[1]));
if (editorLinesInHealth.length === 0) {
  checks.push(check("HEALTH useChapterEditor 行数", editorLines, "missing", "docs/HEALTH.md"));
} else {
  const allMatch = editorLinesInHealth.every((n) => n === editorLines);
  checks.push({
    name: "HEALTH useChapterEditor 行数",
    expected: editorLines,
    actual: editorLinesInHealth.join(" / "),
    source: "docs/HEALTH.md",
    ok: allMatch,
  });
}

// ── README: must not inline volatile numbers ─────────────────────────────
const readmeInlineTests = readme.match(/\d+\s*tests/i);
checks.push({
  name: "README 不应 inline 测试数",
  expected: "无 inline `\\d+ tests`",
  actual: readmeInlineTests ? `命中：${readmeInlineTests[0]}` : "未命中",
  source: "README.md",
  ok: !readmeInlineTests,
});

const readmeNextIntl = readme.match(/next-intl/i);
checks.push({
  name: "README 不应再提 next-intl",
  expected: "无 next-intl",
  actual: readmeNextIntl ? "仍提及" : "未提及",
  source: "README.md",
  ok: !readmeNextIntl,
});

// ── Report ───────────────────────────────────────────────────────────────
const failures = checks.filter((c) => !c.ok);
const tag = (ok: boolean) => (ok ? "PASS" : "FAIL");
console.log("");
console.log("docs-check — drift guard for README / STATUS / HEALTH vs filesystem");
console.log("─".repeat(80));
for (const c of checks) {
  console.log(`  [${tag(c.ok)}] ${c.name.padEnd(40)} expected=${c.expected}  actual=${c.actual}  (${c.source})`);
}
console.log("─".repeat(80));

if (failures.length === 0) {
  console.log(`✓ all ${checks.length} checks pass`);
  process.exit(0);
}

console.log(`✗ ${failures.length} of ${checks.length} checks failed`);
console.log("");
console.log("How to fix:");
console.log("  1. If the filesystem value is correct, update the doc to match.");
console.log("  2. If the doc value is correct, ask why the filesystem regressed.");
console.log("  3. Never fix this by deleting the docs-check call — that's how we drifted in the first place.");
process.exit(1);
