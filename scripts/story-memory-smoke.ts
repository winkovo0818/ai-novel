/** Uses a dedicated local database and a disposable schema; no model network calls. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import seed from "./fixtures/eval-novels/xuanhuan-seed.json";

const raw = process.env.RELIABILITY_DATABASE_URL;
if (!raw) throw new Error("RELIABILITY_DATABASE_URL is required");
const url = new URL(raw);
if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Smoke test only accepts a dedicated local database");
const schema = `memory_${randomUUID().replaceAll("-", "")}`;
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
  const { BibleDraftSchema } = await import("../lib/validation/schemas");
  const { ensureStoryMemory, syncStoryMemory, readStoryMemory } = await import("../lib/agent/storyMemory");
  const { ensureVolumeArc } = await import("../lib/agent/volumePlanStore");
  const bible = BibleDraftSchema.parse({ ...seed.bible, story_state: { characters: [{ name: "沈言", current_goal: "最初目标" }], plot_threads: [{ id: "old", title: "旧案", status: "open" }] } });
  const novel = await client.novel.create({ data: { title: "记忆验证", profile: seed.profile, bible: { create: { content: bible } } }, include: { bible: true } });
  await Promise.all(Array.from({ length: 4 }, () => ensureStoryMemory(novel.id, bible, novel.bible!.updated_at)));
  assert.equal((await client.storyMemoryCheckpoint.findUniqueOrThrow({ where: { novel_id: novel.id } })).revision, 1);
  assert.equal(await client.novelOutlineChapter.count({ where: { novel_id: novel.id } }), 8);
  console.log("PASS: concurrent lazy backfill persists one baseline and eight normalized outlines");
  let latestBible = bible;
  let firstChapterId = "";
  for (let index = 1; index <= 25; index++) {
    latestBible = BibleDraftSchema.parse({ ...bible, story_state: { characters: [{ name: "沈言", current_goal: `目标${index}` }],
      timeline: Array.from({ length: Math.min(20, index) }, (_, i) => ({ chapter_index: Math.max(1, index - 19) + i, event: `事件${Math.max(1, index - 19) + i}` })),
      plot_threads: [{ id: "old", title: "旧案", status: "open" }, ...Array.from({ length: index }, (_, i) => ({ id: `p${i + 1}`, title: `新线索${i + 1}`, status: "open", introduced_in: i + 1 }))] } });
    const nextBible = latestBible;
    await client.$transaction(async tx => {
      const chapter = await tx.chapterDraft.create({ data: { novel_id: novel.id, chapter_index: index, content: `正文${index}`, title: `章节${index}`, status: "done" } });
      if (index === 1) firstChapterId = chapter.id;
      const saved = await tx.bibleDraft.update({ where: { novel_id: novel.id }, data: { content: nextBible } });
      await syncStoryMemory(tx, novel.id, nextBible, saved.updated_at, { kind: "generated_chapter", chapterIndex: index, chapterId: chapter.id, chapterVersion: chapter.version });
    });
  }
  assert.equal(await client.storyMemoryRecord.count({ where: { novel_id: novel.id, category: "timeline", valid_to_chapter: null } }), 25);
  const early = await readStoryMemory(novel.id, 1);
  assert.equal(early.state.characters?.[0].current_goal, "目标1");
  assert.deepEqual(early.state.timeline?.map(t => t.chapter_index), [1]);
  const latest = await readStoryMemory(novel.id, 25);
  assert.equal(latest.state.characters?.[0].current_goal, "目标25");
  assert.equal(latest.state.timeline?.length, 20);
  assert.ok(!latest.state.plot_threads?.some(t => t.title === "旧案"));
  const targeted = await readStoryMemory(novel.id, 25, [{ kind: "plot_threads", title: "旧案" }]);
  assert.ok(targeted.state.plot_threads?.some(t => t.title === "旧案"));
  console.log("PASS: all 25 events survive the short Bible window; temporal queries and old target recall are bounded");
  await client.chapterDraft.update({ where: { id: firstChapterId }, data: { version: { increment: 1 }, content: "编辑后的正文" } });
  const stale = await readStoryMemory(novel.id, 1);
  assert.ok(stale.stale_records >= 1); assert.equal(stale.state.characters?.length ?? 0, 0);
  console.log("PASS: editing source prose invalidates its remembered facts");
  const before = await client.bibleDraft.findUniqueOrThrow({ where: { novel_id: novel.id } });
  const revisionBefore = (await client.storyMemoryCheckpoint.findUniqueOrThrow({ where: { novel_id: novel.id } })).revision;
  await assert.rejects(client.$transaction(async tx => {
    const changed = { ...latestBible, story_state: { characters: [{ name: "沈言", current_goal: "不得提交" }] } };
    const chapter = await tx.chapterDraft.create({ data: { novel_id: novel.id, chapter_index: 26, title: "回滚章节", content: "不得提交", status: "done" } });
    const saved = await tx.bibleDraft.update({ where: { novel_id: novel.id }, data: { content: changed } });
    await syncStoryMemory(tx, novel.id, changed, saved.updated_at, { kind: "generated_chapter", chapterIndex: 26, chapterId: chapter.id, chapterVersion: chapter.version });
    throw new Error("simulated commit failure");
  }), /simulated commit failure/);
  assert.deepEqual((await client.bibleDraft.findUniqueOrThrow({ where: { novel_id: novel.id } })).content, before.content);
  assert.equal((await client.storyMemoryCheckpoint.findUniqueOrThrow({ where: { novel_id: novel.id } })).revision, revisionBefore);
  assert.equal(await client.chapterDraft.count({ where: { novel_id: novel.id, chapter_index: 26 } }), 0);
  console.log("PASS: chapter, Bible, and memory revisions roll back together");
  const currentFact = await client.storyMemoryRecord.findFirstOrThrow({ where: { novel_id: novel.id, category: "characters", valid_to_chapter: null } });
  await assert.rejects(client.storyMemoryRecord.create({ data: { novel_id: novel.id, category: currentFact.category, memory_key: currentFact.memory_key, value: currentFact.value as Prisma.InputJsonValue, content_hash: currentFact.content_hash, revision: 1000, valid_from_chapter: 25, source_kind: "baseline", source_bible_updated_at: new Date() } }), error => (error as {code?: string}).code === "P2002");
  console.log("PASS: the partial unique constraint prevents duplicate current memory versions");
  const run = await client.novelGenerationRun.create({ data: { novel_id: novel.id, user_id: "memory-smoke", config: { continuous: true }, status: "planning", total_chapters: 35, current_chapter: 25 } });
  const current = await client.bibleDraft.findUniqueOrThrow({ where: { novel_id: novel.id } });
  const arcInput = { novelId: novel.id, runId: run.id, bible: latestBible, bibleUpdatedAt: current.updated_at, currentChapter: 25, chapter: 26, total: 35, continuous: true };
  const plans = await Promise.all([ensureVolumeArc(arcInput), ensureVolumeArc(arcInput)]);
  assert.deepEqual(plans[0], plans[1]); assert.equal(await client.novelVolumePlan.count({ where: { novel_id: novel.id } }), 1);
  const calls = await client.llmUsage.count({ where: { novel_id: novel.id, route: "/agent/plan_volume" } });
  assert.deepEqual(await ensureVolumeArc(arcInput), plans[0]);
  assert.equal(await client.llmUsage.count({ where: { novel_id: novel.id, route: "/agent/plan_volume" } }), calls);
  console.log("PASS: concurrent planners preserve one durable winner; retries reuse it without another model call");
  const legacy = await client.novel.create({ data: { title: "旧作品", profile: seed.profile, bible: { create: { content: seed.bible } } }, include: { bible: true } });
  await client.chapterDraft.create({ data: { novel_id: legacy.id, chapter_index: 80, title: "旧章节", content: "旧正文", status: "done" } });
  await ensureStoryMemory(legacy.id, BibleDraftSchema.parse(seed.bible), legacy.bible!.updated_at);
  assert.equal((await readStoryMemory(legacy.id, 79)).historical_available, false);
  assert.equal((await readStoryMemory(legacy.id, 80)).historical_available, true);
  console.log("PASS: legacy backfill reports its baseline instead of inventing earlier history");
} finally {
  await client?.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
}
