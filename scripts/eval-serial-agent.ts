/** Real continuous-agent evaluation. No provider calls without --execute. */
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { Command } from "commander";
import { mkdir, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import seed from "./fixtures/eval-novels/xuanhuan-seed.json";

dotenv.config({ quiet: true });
const options = new Command().option("--execute", "Call real providers")
  .option("--resume <run-id>", "Continue the same evaluation after explicit review/configuration")
  .option("--chapters <count>", "Exact stop chapter", "100")
  .option("--model <name>", "Use an enabled configured model")
  .option("--cost-cap <cny>", "Cumulative task budget")
  .option("--unlimited-budget", "Explicitly disable the cumulative task cap")
  .option("--max-state-changes <count>", "Per-chapter state-diff item cap (5-40, default 15)")
  .option("--output <directory>", "Export directory", "artifacts/serial-agent")
  .parse().opts<{execute?: boolean;resume?: string;chapters: string;model?: string;costCap?: string;unlimitedBudget?: boolean;maxStateChanges?: string;output: string}>();
const raw = process.env.SERIAL_DATABASE_URL;
if (!raw || !["localhost", "127.0.0.1"].includes(new URL(raw).hostname)) {
  throw new Error("SERIAL_DATABASE_URL must name a dedicated local database; production is read only");
}
const sourceUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL = raw;
process.env.DIRECT_URL = raw;
const { StartRequestSchema } = await import("../lib/agent/autoGeneration");
const requested = StartRequestSchema.parse({ continuous: true, planning_window: 10,
  stop_after_chapter: Number(options.chapters), model: options.model,
  unlimited_budget: options.unlimitedBudget === true,
  cost_cap_cny: options.costCap == null ? undefined : Number(options.costCap),
  max_state_changes: options.maxStateChanges == null ? undefined : Number(options.maxStateChanges),
  checkpoint_mode: "on_fail", revision_rounds: 2, quality_floor: 85 });
if (!options.execute) {
  console.log(JSON.stringify({preflight: true, provider_calls: 0, config: requested,
    target_database_host: new URL(raw).hostname, next: "Add --execute to create an independent real evaluation novel"}, null, 2));
  process.exit(0);
}
if (process.env.LLM_MOCK === "1" || process.env.LLM_MOCK === "true") throw new Error("Real evaluation rejects LLM_MOCK");
// Copy only the selected provider configuration. Never print/export credentials.
const source = sourceUrl ? new PrismaClient({datasources: {db: {url: sourceUrl}}}) : undefined;
let selected: Awaited<ReturnType<PrismaClient["llmModel"]["findFirst"]>> = null;
let embedding: Awaited<ReturnType<PrismaClient["embeddingModel"]["findFirst"]>> = null;
try {
  if (source) {
    selected = await source.llmModel.findFirst({where: options.model ? {model: options.model, is_enabled: true} : {is_default: true, is_enabled: true}, orderBy: {created_at: "asc"}});
    embedding = await source.embeddingModel.findFirst({where: {is_default: true, is_enabled: true}, orderBy: {created_at: "asc"}});
  }
} finally { await source?.$disconnect(); }
const { prisma } = await import("../lib/db");
if (selected) {
  await prisma.llmModel.updateMany({where: {is_default: true, NOT: {provider: selected.provider, model: selected.model}}, data: {is_default: false}});
  await prisma.llmModel.upsert({where: {provider_model: {provider: selected.provider, model: selected.model}},
    create: {name: selected.name, provider: selected.provider, model: selected.model, base_url: selected.base_url, api_key: selected.api_key, is_default: true},
    update: {base_url: selected.base_url, api_key: selected.api_key, is_default: true, is_enabled: true}});
}
if (embedding) {
  await prisma.embeddingModel.updateMany({where: {is_default: true, NOT: {provider: embedding.provider, model: embedding.model}}, data: {is_default: false}});
  await prisma.embeddingModel.upsert({where: {provider_model: {provider: embedding.provider, model: embedding.model}},
    create: {name: embedding.name, provider: embedding.provider, model: embedding.model, base_url: embedding.base_url, api_key: embedding.api_key, dim: embedding.dim, is_default: true},
    update: {base_url: embedding.base_url, api_key: embedding.api_key, dim: embedding.dim, is_default: true, is_enabled: true}});
}
const {startGeneration, resumeGeneration} = await import("../lib/agent/autoGeneration");
const {runNextJob, sweepStaleRunningJobs} = await import("../lib/jobs/queue");
const {reconcileGenerationRuns} = await import("../lib/agent/generationScheduling");
const {wakeScheduledGenerationRuns} = await import("../lib/agent/generationWake");
const {reconcileGenerationAlerts} = await import("../lib/agent/generationAlerts");
await import("../lib/jobs/handlers");
let runId = options.resume;
let output = "";
async function snapshot() {
  const run = await prisma.novelGenerationRun.findUniqueOrThrow({where: {id: runId!}});
  const novel = await prisma.novel.findUniqueOrThrow({where: {id: run.novel_id}, include: {bible: true,
    chapters: {orderBy: {chapter_index: "asc"}, include: {summary: true}}, volume_plans: true}});
  const usage = await prisma.llmUsage.findMany({where: {novel_id: novel.id}, orderBy: {created_at: "asc"}});
  const jobs = await prisma.backgroundJob.findMany({where: {novel_id: novel.id}, orderBy: {created_at: "asc"}});
  const records = await prisma.storyMemoryRecord.findMany({where: {novel_id: novel.id}});
  const checkpoint = await prisma.storyMemoryCheckpoint.findUnique({where: {novel_id: novel.id}});
  const outline = await prisma.novelOutlineChapter.findMany({where: {novel_id: novel.id}});
  const report = {exported_at: new Date().toISOString(), run, novel, usage, jobs, memory_records: records, memory_checkpoint: checkpoint, outline,
    result: {accepted_chapters: novel.chapters.filter(c => c.status === "done").length,
      target_chapters: (run.config as Record<string, unknown>).stop_after_chapter, cost_estimate_cny: usage.reduce((n,u) => n + u.cost_cny, 0),
      literary_review: "pending", note: "Automated gates do not substitute for reading and long-range literary review"}};
  await writeFile(resolve(output, "report.json.tmp"), JSON.stringify(report, null, 2));
  await rename(resolve(output, "report.json.tmp"), resolve(output, "report.json"));
  await writeFile(resolve(output, "novel.md"), `# ${novel.title}\n\n` + novel.chapters.map(c => `## 第 ${c.chapter_index} 章 ${c.title ?? ""}（${c.status}）\n\n${c.content}\n`).join("\n"));
  console.log(JSON.stringify({run_id: run.id, status: run.status, accepted: report.result.accepted_chapters,
    cost_estimate_cny: report.result.cost_estimate_cny, reason: run.last_error, resume_after: run.resume_after}));
  return run;
}
try {
  if (!runId) {
    const user = await prisma.user.create({data: {email: `serial-eval-${randomUUID()}@example.test`}});
    const novel = await prisma.novel.create({data: {user_id: user.id, title: `逆魂纪·真实百章验收 ${new Date().toISOString()}`,
      profile: seed.profile, bible: {create: {content: seed.bible}}}, include: {bible: true}});
    runId = (await startGeneration(novel, user.id, {...requested, model: selected?.model ?? requested.model}, "serial-evaluation")).id;
  } else {
    const prior = await prisma.novelGenerationRun.findUniqueOrThrow({where: {id: runId}});
    if ((prior.config as Record<string, unknown>)?.source !== "serial-evaluation") throw new Error("Only evaluation runs can be resumed by this harness");
    const resumed = await resumeGeneration(prior.novel_id, prior.id);
    if ("error" in resumed) throw new Error(resumed.error);
  }
  output = resolve(options.output, runId);
  await mkdir(output, {recursive: true});
  await writeFile(resolve(output, "review.md"), "# 人工阅读记录\n\n待检查：人物知识与能力是否越界、跨卷冲突是否推进、线索是否按期限回收、是否重复解决相同冲突、语言与节奏是否符合预期。\n\n逐章记录：章节 / 引文 / 问题 / 严重程度 / 修复建议。\n", {flag: "wx"}).catch(error => {if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;});
  let run = await snapshot();
  await sweepStaleRunningJobs(run.novel_id);
  while (true) {
    await wakeScheduledGenerationRuns(run.novel_id);
    await reconcileGenerationRuns(run.novel_id);
    const next = await runNextJob({novelId: run.novel_id});
    await reconcileGenerationAlerts(run.novel_id);
    run = await snapshot();
    if (next == null) break; // Export review/failure/resource waits; never bypass a gate.
    if (["needs_review", "failed", "cancelled", "paused", "completed"].includes(run.status)) {
      // Drain already queued summaries/indexing without generating another chapter.
      while (await runNextJob({novelId: run.novel_id, type: ["summarize_chapter", "index_chapter", "refresh_summaries"]}) != null) await snapshot();
      await snapshot(); break;
    }
  }
  console.log(`Artifacts: ${output}`);
} finally { await prisma.$disconnect(); }
