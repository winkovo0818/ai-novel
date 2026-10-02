import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { BibleDraftSchema, StoryStateV1Schema, getVolumes, type BibleDraft, type StoryStateV1 } from "@/lib/validation/schemas";

export const MEMORY_CATEGORIES = ["characters", "locations", "items", "timeline", "relationships", "plot_threads", "foreshadowing", "active_constraints"] as const;
export type MemoryCategory = typeof MEMORY_CATEGORIES[number];
type Entry = { category: MemoryCategory; memory_key: string; value: Prisma.InputJsonObject; content_hash: string };
export function memoryHash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export function memoryKey(category: MemoryCategory, value: Record<string, unknown>) {
  const identity = category === "timeline" ? [value.chapter_index, value.event]
    : category === "relationships" ? [value.from, value.to]
    : value.name ?? value.title ?? value.clue ?? value.fact;
  return memoryHash(typeof identity === "string" ? identity.normalize("NFKC").trim() : identity);
}
export function memoryEntries(state?: StoryStateV1): Entry[] {
  const entries: Entry[] = [];
  for (const category of MEMORY_CATEGORIES) for (const value of state?.[category] ?? []) {
    const clean = JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
    entries.push({ category, memory_key: memoryKey(category, clean), value: clean, content_hash: memoryHash(clean) });
  }
  return entries;
}
export async function latestDoneChapter(novelId: string, db: Prisma.TransactionClient = prisma) {
  const last = await db.chapterDraft.findFirst({ where: { novel_id: novelId, status: "done", content: { not: "" } }, orderBy: { chapter_index: "desc" }, select: { chapter_index: true } });
  return last?.chapter_index ?? 0;
}

export interface MemorySource {
  kind: "baseline" | "bible_edit" | "generated_chapter" | "outline_planner";
  chapterIndex: number;
  chapterId?: string;
  chapterVersion?: number;
}

/** Caller holds the Bible row lock. Records, checkpoint, and Bible must commit together. */
export async function syncStoryMemory(tx: Prisma.TransactionClient, novelId: string, bible: BibleDraft, bibleUpdatedAt: Date, source: MemorySource) {
  const checkpoint = await tx.storyMemoryCheckpoint.findUnique({ where: { novel_id: novelId } });
  const snapshotHash = memoryHash(bible);
  if (checkpoint?.bible_updated_at.getTime() === bibleUpdatedAt.getTime() && checkpoint.snapshot_hash === snapshotHash) return false;
  const revision = (checkpoint?.revision ?? 0) + 1;
  if (source.kind === "generated_chapter" && source.chapterIndex < (checkpoint?.latest_chapter ?? 0)) throw new Error("现有记忆包含后续章节，请先校准历史改写后的剧情状态");
  const index = Math.max(source.chapterIndex, checkpoint?.latest_chapter ?? 0);
  // 2026-10 第三轮跑批实测：state-diff 偶尔对同一实体产出两条更新，story_state
  // 数组出现同名条目，createMany 以相同 (novel_id, category, memory_key, revision)
  // 撞唯一约束、整章事务回滚。按 key 去重（保留最后一条，即最新状态）。
  const entries = [...new Map(memoryEntries(bible.story_state).map(e => [`${e.category}:${e.memory_key}`, e])).values()];
  const automatic = source.kind === "generated_chapter" || source.kind === "outline_planner";
  const existing = await tx.storyMemoryRecord.findMany({ where: { novel_id: novelId, valid_to_chapter: null,
    ...(automatic ? { OR: entries.map(e => ({ category: e.category, memory_key: e.memory_key })) } : {}) } });
  const byKey = new Map(existing.map(r => [`${r.category}:${r.memory_key}`, r]));
  const changed = entries.filter(e => {
    const old = byKey.get(`${e.category}:${e.memory_key}`);
    return !old || old.content_hash !== e.content_hash || (!automatic && old.source_chapter_id != null);
  });
  const keys = new Set(entries.map(e => `${e.category}:${e.memory_key}`));
  const close = existing.filter(r => changed.some(e => e.category === r.category && e.memory_key === r.memory_key)
    || (!automatic && r.category !== "timeline" && !keys.has(`${r.category}:${r.memory_key}`)));
  if (close.length) await tx.storyMemoryRecord.updateMany({ where: { id: { in: close.map(r => r.id) }, valid_to_chapter: null }, data: { valid_to_chapter: index } });
  if (changed.length) await tx.storyMemoryRecord.createMany({ data: changed.map(e => ({ ...e, novel_id: novelId, revision,
    valid_from_chapter: index, source_kind: source.kind, source_chapter_id: source.chapterId ?? null,
    source_chapter_version: source.chapterVersion ?? null, source_bible_updated_at: bibleUpdatedAt })) });

  const outline = getVolumes(bible).flatMap((v, volume_index) => v.chapters.map(c => ({ chapter_index: c.index, volume_index, title: c.title, summary: c.summary })));
  const outlineHash = memoryHash(outline);
  if (checkpoint?.outline_hash !== outlineHash) {
    const stored = await tx.novelOutlineChapter.findMany({ where: { novel_id: novelId }, select: { chapter_index: true, content_hash: true } });
    const hashes = new Map(stored.map(c => [c.chapter_index, c.content_hash]));
    for (const chapter of outline) {
      const hash = memoryHash(chapter);
      if (hashes.get(chapter.chapter_index) === hash) continue;
      await tx.novelOutlineChapter.upsert({ where: { novel_id_chapter_index: { novel_id: novelId, chapter_index: chapter.chapter_index } },
        create: { ...chapter, novel_id: novelId, content_hash: hash, source_kind: source.kind },
        update: { ...chapter, content_hash: hash, source_kind: source.kind } });
    }
    await tx.novelOutlineChapter.deleteMany({ where: { novel_id: novelId, chapter_index: { notIn: outline.map(c => c.chapter_index) } } });
  }
  await tx.storyMemoryCheckpoint.upsert({ where: { novel_id: novelId },
    create: { novel_id: novelId, bible_updated_at: bibleUpdatedAt, baseline_chapter: index, latest_chapter: index, revision, snapshot_hash: snapshotHash, outline_hash: outlineHash },
    update: { bible_updated_at: bibleUpdatedAt, latest_chapter: index, revision, snapshot_hash: snapshotHash, outline_hash: outlineHash } });
  return true;
}

/** A conditional no-op update locks the exact Bible snapshot without changing its timestamp. */
export async function ensureStoryMemory(novelId: string, bible: BibleDraft, bibleUpdatedAt: Date) {
  const snapshotHash = memoryHash(bible);
  const cached = await prisma.storyMemoryCheckpoint.findUnique({ where: { novel_id: novelId } });
  if (cached?.bible_updated_at.getTime() === bibleUpdatedAt.getTime() && cached.snapshot_hash === snapshotHash) return;
  await prisma.$transaction(async tx => {
    const locked = await tx.bibleDraft.updateMany({ where: { novel_id: novelId, updated_at: bibleUpdatedAt }, data: { updated_at: bibleUpdatedAt } });
    if (!locked.count) throw new Error("作品设定已改变，请重新读取");
    const latest = await tx.bibleDraft.findUniqueOrThrow({ where: { novel_id: novelId } });
    if (memoryHash(BibleDraftSchema.parse(latest.content)) !== snapshotHash) throw new Error("作品设定内容已改变，请重新读取");
    const checkpoint = await tx.storyMemoryCheckpoint.findUnique({ where: { novel_id: novelId } });
    const chapter = await latestDoneChapter(novelId, tx);
    await syncStoryMemory(tx, novelId, bible, bibleUpdatedAt, { kind: checkpoint ? "bible_edit" : "baseline", chapterIndex: chapter });
  }, { timeout: 30_000 });
}

export interface MemoryTarget { kind: "plot_threads" | "foreshadowing"; title: string }
export async function readStoryMemory(novelId: string, atChapter: number, targets: readonly MemoryTarget[] = [], characterNames: readonly string[] = []) {
  const checkpoint = await prisma.storyMemoryCheckpoint.findUniqueOrThrow({ where: { novel_id: novelId } });
  const temporal: Prisma.StoryMemoryRecordWhereInput = { novel_id: novelId, valid_from_chapter: { lte: atChapter }, OR: [{ valid_to_chapter: null }, { valid_to_chapter: { gt: atChapter } }] };
  const batches = await Promise.all(MEMORY_CATEGORIES.map(category => prisma.storyMemoryRecord.findMany({
    where: { ...temporal, category, ...(["plot_threads", "foreshadowing"].includes(category) ? { value: { path: ["status"], not: "resolved" } } : {}) }, orderBy: [{ valid_from_chapter: "desc" }, { created_at: "desc" }, { id: "asc" }], take: category === "active_constraints" ? 40 : 20,
  })));
  const mandatory = targets.map(t => ({ category: t.kind, memory_key: memoryKey(t.kind, t.kind === "plot_threads" ? { title: t.title } : { clue: t.title }) }));
  // Keep old character facts and permanent identity/death constraints relevant to this cast.
  const relevant: Prisma.StoryMemoryRecordWhereInput[] = characterNames.slice(0, 8).flatMap(name => [
    { category: "characters", memory_key: memoryKey("characters", { name }) },
    { category: "active_constraints", value: { path: ["fact"], string_contains: name } },
  ]);
  const extra = mandatory.length + relevant.length ? await prisma.storyMemoryRecord.findMany({ where: { AND: [temporal, { OR: [...mandatory, ...relevant] }] },
    orderBy: [{ valid_from_chapter: "desc" }, { id: "asc" }], take: 80 }) : [];
  // Targets have their own bounded query: recent constraints must not crowd them out.
  const required = mandatory.length ? await prisma.storyMemoryRecord.findMany({ where: { AND: [temporal, { OR: mandatory }] }, take: 20 }) : [];
  const records = [...new Map([...batches.flat(), ...extra, ...required].map(r => [r.id, r])).values()];
  const sourceIds = [...new Set(records.flatMap(r => r.source_chapter_id ? [r.source_chapter_id] : []))];
  const sources = sourceIds.length ? await prisma.chapterDraft.findMany({ where: { novel_id: novelId, id: { in: sourceIds } }, select: { id: true, version: true, status: true } }) : [];
  const versions = new Map(sources.map(c => [c.id, c]));
  const stale = records.filter(r => r.source_chapter_id && (versions.get(r.source_chapter_id)?.version !== r.source_chapter_version || versions.get(r.source_chapter_id)?.status !== "done"));
  const invalid = new Set(stale.map(r => r.id));
  const valid = records.filter(r => {
    if (invalid.has(r.id)) return false;
    const value = r.value as Record<string, unknown>;
    const established = value.chapter_index ?? value.established_in ?? value.introduced_in;
    return typeof established !== "number" || established <= atChapter;
  });
  const state: Record<string, unknown[]> = {};
  for (const record of valid) {
    const value = record.value as Record<string, unknown>;
    (state[record.category] ??= []).push(value);
  }
  if (state.timeline) state.timeline.sort((a, b) => (a as {chapter_index: number}).chapter_index - (b as {chapter_index: number}).chapter_index);
  return { state: StoryStateV1Schema.parse(state), records: valid, stale_records: stale.length,
    baseline_chapter: checkpoint.baseline_chapter, latest_chapter: checkpoint.latest_chapter, historical_available: atChapter >= checkpoint.baseline_chapter };
}

export async function loadStoryMemory(novelId: string, row: { content: Prisma.JsonValue; updated_at: Date }, atChapter: number, targets: readonly MemoryTarget[] = []) {
  const bible = BibleDraftSchema.parse(row.content);
  await ensureStoryMemory(novelId, bible, row.updated_at);
  return readStoryMemory(novelId, atChapter, targets, bible.characters.map(c => c.name));
}

/** Restore recalled old facts to the compatibility snapshot before applying a new diff. */
export function mergeRecalledState(bible: BibleDraft, recalled: StoryStateV1): BibleDraft {
  const state: Record<string, unknown[]> = {};
  for (const category of MEMORY_CATEGORIES) {
    const all = [...(bible.story_state?.[category] ?? []), ...(recalled[category] ?? [])];
    if (all.length) state[category] = [...new Map(all.map(v => [memoryKey(category, v), v])).values()];
  }
  return { ...bible, story_state: StoryStateV1Schema.parse(state) };
}

export async function readRecentStoryProgress(novelId: string, atChapter: number) {
  const chapters = await prisma.chapterDraft.findMany({ where: { novel_id: novelId, status: "done", chapter_index: { lte: atChapter } },
    orderBy: { chapter_index: "desc" }, take: 3, select: { chapter_index: true, title: true, content: true } });
  return chapters.reverse().map(c => ({ chapter_index: c.chapter_index, title: c.title,
    excerpt: c.content.length <= 1800 ? c.content : `${c.content.slice(0, 600)}…${c.content.slice(-1200)}` }));
}
