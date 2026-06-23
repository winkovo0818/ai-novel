/**
 * Auto-pilot launcher: 一次配置 → 后台无人值守生成整本小说。
 *
 * 流程：建 run → 前置补全大纲到目标章数（planOutline）→ 入队第 1 章
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
import { addCost, createRun, getRun, markCompleted, markRunning } from "../lib/agent/generationRun";
import { planOutline } from "../lib/agent/planOutline";
import { enqueueJob, sweepStaleRunningJobs } from "../lib/jobs/queue";
import { BibleDraftSchema, NovelProfileSchema } from "../lib/validation/schemas";

const USAGE =
  "用法: npm run auto:generate -- --novel <id> --chapters <N> [--rounds R] [--floor F] [--cost-cap C] [--user U] [--checkpoint none|on_fail|per_volume]\n" +
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

/** Fresh run: plan the outline, then kick off chapter 1. */
async function startRun(args: Record<string, string>): Promise<void> {
  const novelId = args.novel;
  if (!novelId) throw new Error(USAGE);

  const totalChapters = optionalNumber(args.chapters, "--chapters");
  if (totalChapters === undefined || !Number.isInteger(totalChapters) || totalChapters < 1) {
    throw new Error("--chapters 必须是正整数");
  }
  if (totalChapters > 80) {
    throw new Error("本期单卷上限 80 章；更大规模需要分卷规划（暂未支持）");
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

  const run = await createRun({
    novelId,
    userId,
    totalChapters,
    revisionRounds,
    qualityFloor,
    costCapCny,
    checkpointMode,
    config: { source: "cli" },
  });
  console.log(`[auto-generate] 已创建 run ${run.id}（小说 ${novelId}，目标 ${totalChapters} 章，checkpoint=${checkpointMode}）`);

  // 前置补全大纲：超出种子的章节必须有真实标题/摘要，否则逐章会失锚（spike 教训）。
  const planned = await planOutline({
    novelId,
    bible: bible.data,
    profile: profile.data,
    targetChapters: totalChapters,
  });
  if (planned.addedChapters > 0) {
    await prisma.bibleDraft.update({ where: { novel_id: novelId }, data: { content: planned.bible } });
    await addCost(run.id, planned.cost.cny);
    console.log(
      `[auto-generate] 大纲补全 +${planned.addedChapters} 章（花费 ${planned.cost.cny.toFixed(4)} 元，模型 ${planned.model}）`,
    );
  } else {
    console.log(`[auto-generate] 现有大纲已覆盖 ${totalChapters} 章，跳过补全`);
  }

  await markRunning(run.id);
  await enqueueJob({
    type: "generate_chapter",
    payload: { novel_id: novelId, chapter_index: 1, run_id: run.id },
    novelId,
  });

  console.log(`[auto-generate] 已入队第 1 章。请确保 worker 在运行：npm run jobs:worker`);
  console.log(`[auto-generate] 断点续跑：npm run auto:generate -- --resume ${run.id}`);
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

  const inflight = await prisma.backgroundJob.findFirst({
    where: { novel_id: run.novel_id, type: "generate_chapter", status: { in: ["pending", "running"] } },
  });
  if (inflight) {
    console.log(`[auto-generate] run ${runId} 已有在途 generate_chapter job（${inflight.status}），worker 会自动接上，无需重复入队`);
    return;
  }

  const nextChapter = run.current_chapter + 1;
  if (nextChapter > run.total_chapters) {
    await markCompleted(run.id);
    console.log(`[auto-generate] run ${runId} 已完成全部 ${run.total_chapters} 章，标记 completed`);
    return;
  }

  await markRunning(run.id);
  await enqueueJob({
    type: "generate_chapter",
    payload: { novel_id: run.novel_id, chapter_index: nextChapter, run_id: run.id },
    novelId: run.novel_id,
  });
  console.log(`[auto-generate] run ${runId} 从第 ${nextChapter} 章续跑（已入队）。请确保 worker 在运行：npm run jobs:worker`);
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
