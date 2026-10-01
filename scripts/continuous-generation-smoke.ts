/** Dedicated local database only. Clone tables into an isolated schema and drop it afterwards. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import seed from "./fixtures/eval-novels/xuanhuan-seed.json";

const raw = process.env.RELIABILITY_DATABASE_URL;
if (!raw) throw new Error("RELIABILITY_DATABASE_URL is required");
const url = new URL(raw);
if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Smoke test only accepts a dedicated local database");
const schema = `continuous_${randomUUID().replaceAll("-", "")}`;
const admin = new PrismaClient({ datasources: { db: { url: raw } } });
url.searchParams.set("schema", schema);
process.env.DATABASE_URL = url.toString();
process.env.LLM_MOCK = "1";
process.env.EDGEFN_API_KEY = "";
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
  const { StartRequestSchema, startGeneration, resumeGeneration } = await import("../lib/agent/autoGeneration");
  const { reconcileGenerationRuns } = await import("../lib/agent/generationScheduling");
  const { runNextJob } = await import("../lib/jobs/queue");
  await import("../lib/jobs/handlers");
  const user = await client.user.create({ data: { email: "continuous-smoke@example.test" } });
  const bible = { ...seed.bible, outline: { volume_1: { ...seed.bible.outline.volume_1, chapters: Array.from({ length: 80 }, (_, i) => ({
    ...seed.bible.outline.volume_1.chapters[0], index: i + 1, title: `旧章${i + 1}`,
  })) } } };
  const novel = await client.novel.create({ data: { user_id: user.id, title: "持续连载验证", profile: seed.profile,
    bible: { create: { content: bible } } }, include: { bible: true } });
  await client.chapterDraft.createMany({ data: Array.from({ length: 80 }, (_, i) => ({ novel_id: novel.id, chapter_index: i + 1, title: `旧章${i + 1}`, content: "已完成的历史正文", status: "done" })) });
  const config = StartRequestSchema.parse({ continuous: true, cost_cap_cny: 5, revision_rounds: 0 });
  const started = await startGeneration(novel, user.id, config);
  assert.equal(started.status, "planning"); assert.equal(started.total_chapters, 90);
  assert.equal(await client.backgroundJob.count({ where: { novel_id: novel.id, type: "plan_outline", status: "pending" } }), 1);
  console.log("PASS: start persists a planning job after 80 completed chapters");
  assert.equal(await runNextJob({ novelId: novel.id, type: "plan_outline" }), "done");
  let run = await client.novelGenerationRun.findUniqueOrThrow({ where: { id: started.id } });
  assert.equal(run.status, "running");
  const planned = await client.bibleDraft.findUniqueOrThrow({ where: { novel_id: novel.id } });
  assert.equal((planned.content as typeof bible & { outline: { volumes: Array<{ chapters: unknown[] }> } }).outline.volumes[0].chapters.length, 10);
  console.log("PASS: real planner job creates a second volume and atomically queues chapter 81");
  await Promise.all(Array.from({ length: 4 }, () => resumeGeneration(novel.id, run.id)));
  assert.equal(await client.backgroundJob.count({ where: { novel_id: novel.id, type: "generate_chapter", status: "pending" } }), 1);
  await client.backgroundJob.deleteMany({ where: { novel_id: novel.id, type: "generate_chapter", status: "pending" } });
  await Promise.all(Array.from({ length: 4 }, () => reconcileGenerationRuns(novel.id)));
  assert.equal(await client.backgroundJob.count({ where: { novel_id: novel.id, type: "generate_chapter", status: "pending" } }), 1);
  console.log("PASS: concurrent resume and crash recovery enqueue exactly one successor");
  assert.equal(await runNextJob({ novelId: novel.id, type: "generate_chapter" }), "done");
  run = await client.novelGenerationRun.findUniqueOrThrow({ where: { id: run.id } });
  assert.equal(run.status, "needs_review"); assert.equal(run.current_chapter, 80);
  const draft = await client.chapterDraft.findUniqueOrThrow({ where: { novel_id_chapter_index: { novel_id: novel.id, chapter_index: 81 } } });
  assert.equal(draft.status, "draft"); assert.ok(draft.content.trim());
  assert.equal((await client.chapterDraft.findUniqueOrThrow({ where: { novel_id_chapter_index: { novel_id: novel.id, chapter_index: 80 } } })).content, "已完成的历史正文");
  console.log("PASS: actual chapter pipeline preserves history and pauses a low-quality mock draft");
  await client.chapterDraft.update({ where: { id: draft.id }, data: { status: "done" } });
  await client.chapterDraft.createMany({ data: Array.from({ length: 9 }, (_, i) => ({ novel_id: novel.id, chapter_index: i + 82, title: "人工审核章节", content: "人工审核通过的正文", status: "done" })) });
  const resumed = await resumeGeneration(novel.id, run.id);
  assert.ok(!("error" in resumed)); assert.equal(resumed.status, "planning"); assert.equal(resumed.total_chapters, 100);
  assert.equal(await runNextJob({ novelId: novel.id, type: "plan_outline" }), "done");
  assert.equal((await client.novelGenerationRun.findUniqueOrThrow({ where: { id: run.id } })).current_chapter, 90);
  console.log("PASS: human approval advances the horizon and rolls into the next planning cycle");
  const job = await client.backgroundJob.findFirstOrThrow({ where: { novel_id: novel.id, type: "generate_chapter", status: "pending" } });
  await client.backgroundJob.update({ where: { id: job.id }, data: { status: "failed", attempts: 2, last_error: "simulated exhausted provider failure" } });
  await reconcileGenerationRuns(novel.id);
  assert.equal((await client.novelGenerationRun.findUniqueOrThrow({ where: { id: run.id } })).status, "failed");
  assert.ok(!("error" in await resumeGeneration(novel.id, run.id)));
  console.log("PASS: exhausted retries surface failure and explicit resume restarts the correct stage");
  const another = await client.novel.create({ data: { user_id: user.id, title: "并发启动验证", profile: seed.profile, bible: { create: { content: seed.bible } } }, include: { bible: true } });
  const starts = await Promise.allSettled(Array.from({ length: 4 }, () => startGeneration(another, user.id, config)));
  assert.equal(starts.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(await client.novelGenerationRun.count({ where: { novel_id: another.id } }), 1);
  console.log("PASS: concurrent starts persist one run and one durable intent");
} finally {
  await client?.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
}
