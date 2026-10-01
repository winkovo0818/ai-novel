/** Run against a dedicated, migrated local test database. Creates and drops an isolated schema. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const raw = process.env.RELIABILITY_DATABASE_URL;
if (!raw) throw new Error("RELIABILITY_DATABASE_URL is required (dedicated local test database)");
const url = new URL(raw);
if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Reliability smoke only accepts a local database");
const schema = `reliability_${randomUUID().replaceAll("-", "")}`;
const admin = new PrismaClient({ datasources: { db: { url: raw } } });
url.searchParams.set("schema", schema);
process.env.DATABASE_URL = url.toString();
process.env.JOB_GENERATE_CHAPTER_TIMEOUT_MS = "1200000";
process.env.JOB_INDEX_TIMEOUT_MS = "50";
let client: PrismaClient | undefined;
try {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for (const table of ["ChapterDraft", "BackgroundJob"]) {
    await admin.$executeRawUnsafe(`CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
  }
  client = (await import("../lib/db")).prisma;
  const chapter = await client.chapterDraft.create({ data: { novel_id: "test", chapter_index: 1, title: "old" } });
  const writes = await Promise.allSettled(["a", "b"].map(content => client!.chapterDraft.update({
    where: { id: chapter.id, version: 0 }, data: { content, version: { increment: 1 } },
  })));
  assert.equal(writes.filter(r => r.status === "fulfilled").length, 1);
  assert.equal((await client.chapterDraft.findUniqueOrThrow({ where: { id: chapter.id } })).version, 1);
  console.log("PASS: concurrent saves allow exactly one writer");
  const queue = await import("../lib/jobs/queue");
  const { createJobExecution } = await import("../lib/jobs/execution");
  for (let i = 0; i < 8; i++) await queue.enqueueJob({ type: "generate_chapter", novelId: "test", payload: {} });
  const claims = await Promise.all(Array.from({ length: 8 }, () => queue.claimNextJob({ type: "generate_chapter" })));
  assert.equal(claims.filter(Boolean).length, 1);
  assert.equal(await client.backgroundJob.count({ where: { status: "running" } }), 1);
  console.log("PASS: concurrent queue claim respects the global type limit");
  const claimed = claims.find(Boolean)!;
  await client.backgroundJob.update({ where: { id: claimed.id }, data: { started_at: new Date(Date.now() - 6 * 60_000), updated_at: new Date(Date.now() - 6 * 60_000) } });
  assert.equal(await queue.sweepStaleRunningJobs("test"), 0);
  console.log("PASS: a five-minute TTL does not reclaim a chapter inside its execution budget");
  await client.backgroundJob.update({ where: { id: claimed.id }, data: {
    started_at: new Date(Date.now() - 90 * 60_000), updated_at: new Date(Date.now() - 90 * 60_000),
  } });
  assert.equal(await queue.sweepStaleRunningJobs("test"), 1);
  await assert.rejects(createJobExecution(claimed, new AbortController().signal).assertActive(), /expired|replaced/);
  console.log("PASS: reclaimed work cannot reuse an earlier execution lease");
  let cancelled = false;
  queue.registerHandler("index_chapter", async (_payload, execution) => {
    await new Promise<void>(resolve => execution!.signal.addEventListener("abort", () => { cancelled = true; resolve(); }, { once: true }));
    await execution!.assertActive();
  });
  await queue.enqueueJob({ type: "index_chapter", novelId: "test", payload: {} });
  assert.equal(await queue.runNextJob({ type: "index_chapter" }), "pending");
  assert.equal(cancelled, true);
  assert.equal(await client.backgroundJob.count({ where: { status: "done" } }), 0);
  console.log("PASS: timed out work is cancelled and cannot finish its job");
} finally {
  await client?.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
}
