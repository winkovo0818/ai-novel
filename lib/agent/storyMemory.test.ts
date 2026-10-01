import { beforeEach, describe, expect, it, vi } from "vitest";
import seed from "@/scripts/fixtures/eval-novels/xuanhuan-seed.json";
import { BibleDraftSchema } from "@/lib/validation/schemas";
import type { Prisma } from "@prisma/client";
const m = vi.hoisted(() => ({ checkpoint: vi.fn(), saveCheckpoint: vi.fn(), records: vi.fn(), close: vi.fn(), create: vi.fn(), outline: vi.fn(), saveOutline: vi.fn(), deleteOutline: vi.fn(), lock: vi.fn(), bible: vi.fn(), chapter: vi.fn(), sources: vi.fn() }));
const tx = vi.hoisted(() => ({ storyMemoryCheckpoint: { findUnique: m.checkpoint, findUniqueOrThrow: m.checkpoint, upsert: m.saveCheckpoint }, storyMemoryRecord: { findMany: m.records, updateMany: m.close, createMany: m.create },
  novelOutlineChapter: { findMany: m.outline, upsert: m.saveOutline, deleteMany: m.deleteOutline }, bibleDraft: { updateMany: m.lock, findUniqueOrThrow: m.bible }, chapterDraft: { findFirst: m.chapter, findMany: m.sources } }));
vi.mock("@/lib/db", () => ({ prisma: { ...tx, $transaction: async (fn: (tx: unknown) => unknown) => fn(tx) } }));
import { memoryHash, memoryKey, memoryEntries, latestDoneChapter, syncStoryMemory, ensureStoryMemory, readStoryMemory, loadStoryMemory, mergeRecalledState, readRecentStoryProgress } from "./storyMemory";
const bible = BibleDraftSchema.parse(seed.bible);
const db = tx as unknown as Prisma.TransactionClient;
const sync = (state = bible, kind: "generated_chapter" | "bible_edit" | "baseline" | "outline_planner" = "generated_chapter", index = 2) => syncStoryMemory(db, "n", state, new Date(2), { kind, chapterIndex: index, chapterId: "ch", chapterVersion: 4 });
const outlineHash = memoryHash(bible.outline.volume_1.chapters.map(c => ({ chapter_index: c.index, volume_index: 0, title: c.title, summary: c.summary })));
const checkpoint = (extra = {}) => ({ bible_updated_at: new Date(1), baseline_chapter: 0, latest_chapter: 1, revision: 1, outline_hash: outlineHash, ...extra });
const fact = (category = "characters", value: Record<string, unknown> = { name: "沈言", current_goal: "旧目标" }, extra = {}) => ({ id: "f", category, value, memory_key: memoryKey(category as never, value), content_hash: memoryHash(value), source_chapter_id: null,
  valid_from_chapter: 1, valid_to_chapter: null, ...extra });
beforeEach(() => { vi.resetAllMocks(); m.checkpoint.mockResolvedValue(checkpoint()); m.records.mockResolvedValue([]); m.outline.mockResolvedValue([]); m.sources.mockResolvedValue([]); m.lock.mockResolvedValue({ count: 1 }); m.bible.mockResolvedValue({ content: bible }); m.chapter.mockResolvedValue(null); });
describe("memory identities and projection", () => {
  it("retains stable identity while state changes, for every category", () => {
    expect(memoryKey("characters", { name: " 沈言 ", current_goal: "新目标" })).toBe(memoryKey("characters", { name: "沈言" }));
    expect(memoryKey("relationships", { from: "甲", to: "乙", notes: "更新" })).toBe(memoryKey("relationships", { from: "甲", to: "乙" }));
    expect(memoryKey("timeline", { chapter_index: 1, event: "获证", impact: "更新" })).toBe(memoryKey("timeline", { chapter_index: 1, event: "获证" }));
    expect(memoryEntries()).toEqual([]);
    expect(memoryEntries({ characters: [{ name: "甲" }], locations: [{ name: "井" }], items: [{ name: "剑" }], timeline: [{ chapter_index: 1, event: "获证" }], relationships: [{ from: "甲", to: "乙", status: "盟友" }],
      plot_threads: [{ id: "p", title: "旧案", status: "open" }], foreshadowing: [{ id: "f", clue: "信物", status: "planted" }], active_constraints: [{ fact: "甲已知道真相", established_in: 1, validity: "permanent" }] })).toHaveLength(8);
  });
  it("does not create another revision for an identical snapshot", async () => {
    m.checkpoint.mockResolvedValue(checkpoint({ bible_updated_at: new Date(2), snapshot_hash: memoryHash(bible) }));
    expect(await sync()).toBe(false); expect(m.records).not.toHaveBeenCalled();
  });
  it("closes an old value and records its chapter/version provenance", async () => {
    m.records.mockResolvedValue([fact()]); await sync({ ...bible, story_state: { characters: [{ name: "沈言", current_goal: "新目标" }] } });
    expect(m.close.mock.calls[0][0].data).toEqual({ valid_to_chapter: 2 });
    expect(m.create.mock.calls[0][0].data[0]).toMatchObject({ revision: 2, valid_from_chapter: 2, source_chapter_id: "ch", source_chapter_version: 4 });
    expect(m.saveOutline).not.toHaveBeenCalled();
  });
  it("archives events omitted by the Bible's short window", async () => {
    m.records.mockResolvedValue([fact("timeline", { chapter_index: 1, event: "早期事件" })]); await sync();
    expect(m.close).not.toHaveBeenCalled();
  });
  it("manual edits close removed facts while keeping archived timeline events", async () => {
    m.records.mockResolvedValue([fact(), fact("timeline", { chapter_index: 1, event: "早期事件" }, { id: "event" })]); await sync(bible, "bible_edit");
    expect(m.close.mock.calls[0][0].where.id.in).toEqual(["f"]);
  });
  it("a submitted Bible can re-anchor a fact whose source prose was edited", async () => {
    const value = { name: "沈言", current_goal: "新目标" };
    m.records.mockResolvedValue([fact("characters", value, { source_chapter_id: "edited" })]);
    await sync({ ...bible, story_state: { characters: [value] } }, "bible_edit"); expect(m.close).toHaveBeenCalled(); expect(m.create).toHaveBeenCalled();
  });
  it("backfills outline rows and only updates rows that changed", async () => {
    m.checkpoint.mockResolvedValue(null); const first = bible.outline.volume_1.chapters[0];
    m.outline.mockResolvedValue([{ chapter_index: 1, content_hash: memoryHash({ chapter_index: 1, volume_index: 0, title: first.title, summary: first.summary }) }]);
    await sync(bible, "baseline", 0); expect(m.saveOutline).toHaveBeenCalledTimes(7);
    expect(m.saveCheckpoint.mock.calls[0][0].create).toMatchObject({ baseline_chapter: 0, revision: 1 });
  });
  it("does not silently rewrite memory from chapters after the generation cursor", async () => {
    m.checkpoint.mockResolvedValue(checkpoint({ latest_chapter: 10 })); await expect(sync()).rejects.toThrow("后续章节"); expect(m.create).not.toHaveBeenCalled();
  });
  it("a manual edit after deletion does not move the logical snapshot backwards", async () => {
    m.checkpoint.mockResolvedValue(checkpoint({ latest_chapter: 10 })); m.records.mockResolvedValue([fact()]); await sync(bible, "bible_edit", 2);
    expect(m.close.mock.calls[0][0].data.valid_to_chapter).toBe(10);
  });
});
describe("snapshot refresh and temporal retrieval", () => {
  it("reads the last completed chapter or zero", async () => { expect(await latestDoneChapter("n")).toBe(0); m.chapter.mockResolvedValue({ chapter_index: 80 }); expect(await latestDoneChapter("n")).toBe(80); });
  it("returns immediately for a cached matching watermark", async () => {
    m.checkpoint.mockResolvedValue(checkpoint({ bible_updated_at: new Date(1), snapshot_hash: memoryHash(bible) })); await ensureStoryMemory("n", bible, new Date(1)); expect(m.lock).not.toHaveBeenCalled();
  });
  it("refreshes a valid new snapshot under its row lock", async () => { await ensureStoryMemory("n", bible, new Date(1)); expect(m.saveCheckpoint).toHaveBeenCalled(); });
  it("rejects a stale timestamp or a same-timestamp changed snapshot", async () => {
    m.lock.mockResolvedValueOnce({ count: 0 }); await expect(ensureStoryMemory("n", bible, new Date(1))).rejects.toThrow("已改变");
    m.bible.mockResolvedValue({ content: { ...bible, meta: { ...bible.meta, suggested_title: "另一部作品" } } });
    await expect(ensureStoryMemory("n", bible, new Date(1))).rejects.toThrow("内容已改变");
  });
  it("loads a baseline from a legacy Bible and returns the bounded memory view", async () => { m.checkpoint.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValue(checkpoint()); const view = await loadStoryMemory("n", { content: bible as unknown as Prisma.JsonValue, updated_at: new Date(1) }, 1); expect(view.state).toEqual({}); expect(m.saveCheckpoint).toHaveBeenCalled(); });
  it("uses temporal bounds and retrieves old mandatory targets separately", async () => {
    await readStoryMemory("n", 40, [{ kind: "plot_threads", title: "旧案" }], ["沈言"]);
    expect(m.records.mock.calls[0][0]).toMatchObject({ where: { valid_from_chapter: { lte: 40 }, OR: [{ valid_to_chapter: null }, { valid_to_chapter: { gt: 40 } }] }, take: 20 });
    expect(m.records.mock.calls.at(-1)![0].where.AND[1].OR[0].memory_key).toBe(memoryKey("plot_threads", { title: "旧案" }));
  });
  it("excludes stale source versions and explicitly marks pre-backfill history unavailable", async () => {
    m.checkpoint.mockResolvedValue(checkpoint({ baseline_chapter: 80 })); m.records.mockResolvedValueOnce([fact("characters", { name: "沈言" }, { source_chapter_id: "ch", source_chapter_version: 2 })]);
    m.sources.mockResolvedValue([{ id: "ch", version: 3, status: "done" }]); const view = await readStoryMemory("n", 79);
    expect(view.stale_records).toBe(1); expect(view.state).toEqual({}); expect(view.historical_available).toBe(false);
  });
  it("keeps valid sources, ignores future entries, and sorts timeline chronologically", async () => {
    m.records.mockResolvedValueOnce([fact("characters", { name: "沈言" }, { source_chapter_id: "ch", source_chapter_version: 2 }), fact("timeline", { chapter_index: 5, event: "后来" }, { id: "late" }), fact("timeline", { chapter_index: 3, event: "此前" }, { id: "early" }), fact("timeline", { chapter_index: 90, event: "未来" }, { id: "future" })]);
    m.sources.mockResolvedValue([{ id: "ch", version: 2, status: "done" }]); const view = await readStoryMemory("n", 10);
    expect(view.state.timeline?.map(t => t.chapter_index)).toEqual([3, 5]); expect(view.records).toHaveLength(3); expect(view.stale_records).toBe(0);
  });
  it("merges recalled facts without dropping unrelated compatibility state", () => {
    const result = mergeRecalledState({ ...bible, story_state: { characters: [{ name: "沈言", current_goal: "旧目标" }], locations: [{ name: "灶房" }] } }, { characters: [{ name: "沈言", current_goal: "新目标" }] });
    expect(result.story_state?.characters).toEqual([{ name: "沈言", current_goal: "新目标" }]); expect(result.story_state?.locations).toHaveLength(1);
    expect(mergeRecalledState(bible, {}).story_state).toEqual(bible.story_state);
  });
  it("bounds actual recent prose while retaining the chapter ending", async () => {
    m.sources.mockResolvedValue([{ chapter_index: 2, title: "新章", content: "短正文" }, { chapter_index: 1, title: "旧章", content: "前".repeat(1900) + "结尾" }]);
    const progress = await readRecentStoryProgress("n", 2); expect(progress[0].excerpt.endsWith("结尾")).toBe(true); expect(progress[0].excerpt.length).toBeLessThan(1900); expect(progress[1].excerpt).toBe("短正文");
  });
});
