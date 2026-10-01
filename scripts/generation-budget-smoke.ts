/** Uses a dedicated local database and a disposable schema; no model network calls. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import seed from "./fixtures/eval-novels/xuanhuan-seed.json";

const raw = process.env.RELIABILITY_DATABASE_URL;
if (!raw) throw new Error("RELIABILITY_DATABASE_URL is required");
const url = new URL(raw);
if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Smoke test only accepts a dedicated local database");
const schema = `budget_${randomUUID().replaceAll("-", "")}`;
const admin = new PrismaClient({ datasources: { db: { url: raw } } });
url.searchParams.set("schema", schema);
process.env.DATABASE_URL = url.toString();
process.env.LLM_MOCK = "1";
process.env.QUOTA_FAILURE_MODE = "allow";
process.env.MODERATION_FAILURE_MODE = "allow";
let client: PrismaClient | undefined;
try {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const tables = await admin.$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  for (const { tablename } of tables) {
    if (!/^[a-zA-Z_][a-zA-Z_0-9]*$/.test(tablename)) throw new Error("Unexpected table name");
    await admin.$executeRawUnsafe(`CREATE TABLE "${schema}"."${tablename}" (LIKE public."${tablename}" INCLUDING ALL)`);
  }
  client = (await import("../lib/db")).prisma;
  const { addCost } = await import("../lib/agent/generationRun");
  const { generationBudgetDay, nextGenerationBudgetReset } = await import("../lib/agent/generationBudget");
  const { generationCallContext } = await import("../lib/agent/generationExecution");
  const { registerHandler, runNextJob } = await import("../lib/jobs/queue");
  const { wakeScheduledGenerationRuns } = await import("../lib/agent/generationWake");
  const { reconcileGenerationAlerts } = await import("../lib/agent/generationAlerts");
  const user = await client.user.create({data: {email: "budget-smoke@example.test"}});
  const novel = await client.novel.create({data: {user_id: user.id, title: "预算与自动唤醒验证", profile: seed.profile,
    bible: {create: {content: seed.bible}}}});
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86_400_000);
  let run = await client.novelGenerationRun.create({data: {novel_id: novel.id, user_id: user.id, status: "running", total_chapters: 1,
    config: {continuous: true, unlimited_budget: true, daily_cost_cap_cny: 2}}});
  await Promise.all(Array.from({length: 20}, () => addCost(run.id, 0.1, yesterday)));
  await Promise.all(Array.from({length: 20}, () => addCost(run.id, 0.1, now)));
  await addCost(run.id, 0.1, yesterday);
  run = await client.novelGenerationRun.findUniqueOrThrow({where: {id: run.id}});
  assert.ok(Math.abs(run.cost_cny_spent - 4.1) < 1e-8);
  assert.ok(Math.abs(run.daily_cost_cny_spent - 2) < 1e-8);
  assert.equal(run.cost_day, generationBudgetDay(now));
  console.log("PASS: row locks preserve concurrent day reset and reject late receipt counter resets");
  let actualCalls = 0;
  registerHandler("generate_chapter", async () => {
    await generationCallContext({runId: run.id, novelId: novel.id, userId: user.id, phase: "running"}).beforeCall?.();
    actualCalls++;
  });
  const job = await client.backgroundJob.create({data: {novel_id: novel.id, type: "generate_chapter",
    payload: {novel_id: novel.id, run_id: run.id, chapter_index: 1}}});
  assert.equal(await runNextJob({novelId: novel.id, type: "generate_chapter"}), "pending");
  const parked = await client.backgroundJob.findUniqueOrThrow({where: {id: job.id}});
  assert.equal(parked.attempts, 0); assert.equal(parked.available_at?.getTime(), nextGenerationBudgetReset(now).getTime());
  assert.equal(actualCalls, 0); assert.equal(await runNextJob({novelId: novel.id}), null);
  console.log("PASS: daily budget parks a job until midnight without provider calls or retry consumption");
  const tomorrow = nextGenerationBudgetReset(now);
  await Promise.all(Array.from({length: 4}, () => wakeScheduledGenerationRuns(novel.id, tomorrow)));
  run = await client.novelGenerationRun.findUniqueOrThrow({where: {id: run.id}});
  assert.equal(run.status, "running"); assert.equal(run.resume_after, null);
  assert.equal(await client.backgroundJob.count({where: {novel_id: novel.id, type: "generate_chapter", status: "pending"}}), 1);
  console.log("PASS: concurrent due wakeups resume one durable successor");
  await client.novelGenerationRun.update({where: {id: run.id}, data: {status: "paused", pause_reason: "manual", resume_after: null}});
  assert.equal(await wakeScheduledGenerationRuns(novel.id, tomorrow), 0);
  await client.novelGenerationRun.update({where: {id: run.id}, data: {status: "needs_review", last_error: "第1章需要复核"}});
  await Promise.all(Array.from({length: 4}, () => reconcileGenerationAlerts(novel.id)));
  const alert = await client.novelGenerationAlert.findFirstOrThrow({where: {run_id: run.id, resolved_at: null}});
  assert.equal(await client.novelGenerationAlert.count({where: {run_id: run.id, resolved_at: null}}), 1);
  await client.novelGenerationAlert.update({where: {id: alert.id}, data: {read_at: now}});
  await reconcileGenerationAlerts(novel.id);
  assert.ok((await client.novelGenerationAlert.findUniqueOrThrow({where: {id: alert.id}})).read_at);
  await client.novelGenerationRun.update({where: {id: run.id}, data: {status: "completed"}});
  await reconcileGenerationAlerts(novel.id);
  assert.equal(await client.novelGenerationAlert.count({where: {run_id: run.id, resolved_at: null}}), 0);
  console.log("PASS: manual pauses do not wake; concurrent alert sweeps deduplicate and preserve acknowledgement");
} finally {
  await client?.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
}
