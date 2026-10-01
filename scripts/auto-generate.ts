/**
 * Auto-pilot launcher: 一次配置 → 后台无人值守生成整本小说。
 *
 * 流程：建 run → 入队分批大纲规划（plan_outline）→ 入队下一章
 * generate_chapter job。后续逐章自链由 handler 负责，worker（npm run
 * jobs:worker）实际执行。被中断后用 --resume <runId> 从断点续跑。
 *
 * 用法：
 *   npm run auto:generate -- --novel <id> --chapters 40 [--rounds 2] [--floor 85] [--cost-cap 5] [--user <id>]
 *   npm run auto:generate -- --resume <runId>
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { prisma } from "../lib/db";
import { getRun } from "../lib/agent/generationRun";
import { startGeneration, resumeGeneration, StartRequestSchema } from "../lib/agent/autoGeneration";
import { sweepStaleRunningJobs } from "../lib/jobs/queue";
import { BibleDraftSchema, NovelProfileSchema } from "../lib/validation/schemas";

const USAGE =
  "用法: npm run auto:generate -- --novel <id> --chapters <N> [--rounds R] [--floor F] [--cost-cap C] [--user U] [--checkpoint none|on_fail|per_volume]\n" +
  "      npm run auto:generate -- --novel <id> --continuous --plan-ahead 10 (--cost-cap 5 | --unlimited-budget) [--daily-cost-cap 2] [--stop-after 100]\n" +
  "      npm run auto:generate -- --resume <runId>\n" +
  "  --checkpoint none: 质量门失败只记录不挂起（用于评估/验证，不降标准）；默认 on_fail（失败挂起待人工）";

const CHECKPOINT_MODES = ["none", "on_fail", "per_volume"] as const;
type CheckpointMode = (typeof CHECKPOINT_MODES)[number];

function parseCheckpointMode(value: string | undefined): CheckpointMode {
  if (!value) return "on_fail";
  if ((CHECKPOINT_MODES as readonly string[]).includes(value)) return value as CheckpointMode;
  throw new Error(`--checkpoint 必须是 ${CHECKPOINT_MODES.join("/")} 之一，得到: ${value}`);
}

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = "true";
    }
  }
  return args;
}

function optionalNumber(value: string | undefined, label: string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${label} 不是合法数字: ${value}`);
  return n;
}

/** Fresh run: persist planning intent and return without a model call. */
async function startRun(args: Record<string, string>): Promise<void> {
  const novelId = args.novel;
  if (!novelId) throw new Error(USAGE);

  const totalChapters = optionalNumber(args.chapters, "--chapters");
  if (args.continuous !== "true" && (totalChapters === undefined || !Number.isInteger(totalChapters) || totalChapters < 1)) {
    throw new Error("--chapters 必须是正整数");
  }
  if (totalChapters != null && totalChapters > 80) {
    throw new Error("固定章数模式上限 80 章；长期连载请使用 --continuous --cost-cap N");
  }

  const novel = await prisma.novel.findUnique({ where: { id: novelId }, include: { bible: true } });
  if (!novel || !novel.bible) throw new Error(`找不到小说或 Bible: ${novelId}`);

  const bible = BibleDraftSchema.safeParse(novel.bible.content);
  const profile = NovelProfileSchema.safeParse(novel.profile);
  if (!bible.success || !profile.success) throw new Error(`小说 ${novelId} 的 Bible/Profile 不合法，无法启动`);

  const revisionRounds = optionalNumber(args.rounds, "--rounds");
  const qualityFloor = optionalNumber(args.floor, "--floor");
  const costCapCny = optionalNumber(args["cost-cap"], "--cost-cap") ?? null;
  const userId = novel.user_id ?? args.user ?? "cli";
  const checkpointMode = parseCheckpointMode(args.checkpoint);

  const result = await startGeneration(novel, userId, StartRequestSchema.parse({
    total_chapters: totalChapters, revision_rounds: revisionRounds, quality_floor: qualityFloor,
    stop_after_chapter: optionalNumber(args["stop-after"], "--stop-after"),
    daily_cost_cap_cny: optionalNumber(args["daily-cost-cap"], "--daily-cost-cap"),
    cost_cap_cny: costCapCny ?? undefined, checkpoint_mode: checkpointMode,
    unlimited_budget: args["unlimited-budget"] === "true",
    continuous: args.continuous === "true", planning_window: optionalNumber(args["plan-ahead"], "--plan-ahead"), model: args.model,
  }), "cli");
  console.log(`[auto-generate] run ${result.id}：${result.status}，已提交后台规划`);
  console.log(`[auto-generate] 请确保 worker 在运行；续跑：npm run auto:generate -- --resume ${result.id}`);
}

/**
 * Resume an interrupted run: reclaim stale running jobs, and if nothing is
 * in-flight, re-enqueue from current_chapter + 1. Idempotent — safe to run
 * even if a job is still pending (it just reports and exits).
 */
async function resumeRun(runId: string): Promise<void> {
  const run = await getRun(runId);
  if (!run) throw new Error(`找不到 run: ${runId}`);
  if (run.status === "completed" || run.status === "cancelled") {
    console.log(`[auto-generate] run ${runId} 状态为 ${run.status}，无需续跑`);
    return;
  }

  // worker 被杀时 job 可能卡在 running；先按 TTL 回收为 pending。
  const swept = await sweepStaleRunningJobs(run.novel_id);
  if (swept > 0) console.log(`[auto-generate] 回收了 ${swept} 个滞留的 running job`);

  const result = await resumeGeneration(run.novel_id, run.id);
  if ("error" in result) throw new Error(result.error);
  console.log(`[auto-generate] run ${runId}：${result.status}，已完成 ${result.current_chapter} 章`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.resume && args.resume !== "true") {
    await resumeRun(args.resume);
    return;
  }
  await startRun(args);
}

function isDirectRun(): boolean {
  return Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
}

if (isDirectRun()) {
  main()
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[auto-generate] 失败: ${message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
