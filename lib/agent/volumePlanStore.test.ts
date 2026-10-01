import { beforeEach, describe, expect, it, vi } from "vitest";
import seed from "@/scripts/fixtures/eval-novels/xuanhuan-seed.json";
import { BibleDraftSchema } from "@/lib/validation/schemas";
const m = vi.hoisted(() => ({ first: vi.fn(), prior: vi.fn(), winner: vi.fn(), save: vi.fn(), outline: vi.fn(), run: vi.fn(), runLock: vi.fn(), bibleLock: vi.fn(), plan: vi.fn(), progress: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { novelVolumePlan: { findFirst: m.first, findMany: m.prior }, novelOutlineChapter: { findMany: m.outline },
  $transaction: async (fn: (tx: unknown) => unknown) => fn({ novelGenerationRun: { findUnique: m.run, updateMany: m.runLock }, bibleDraft: { updateMany: m.bibleLock }, novelVolumePlan: { findUnique: m.winner, upsert: m.save } }) } }));
vi.mock("./storyMemory", () => ({ readRecentStoryProgress: m.progress }));
vi.mock("./volumePlan", async original => ({ ...await original<typeof import("./volumePlan")>(), planVolume: m.plan }));
import { readVolumeArc, ensureVolumeArc } from "./volumePlanStore";
import { VolumePlanSchema } from "./volumePlan";
const plan = VolumePlanSchema.parse({ name: "追索旧案", theme: "主动调查并承担代价", goal: "取得可验证的旧案证据并保护证人", central_conflict: "调查行动与宗门利益发生直接冲突", character_change: "主角从被动逃避转为主动承担责任", climax: "各方势力交锋中主角保护证人并揭露证据", resolution: "本卷解决证据可信度与证人安全问题", next_hook: "证据引出新的幕后势力和具体冲突" });
const row = { volume_index: 0, start_chapter: 1, end_chapter: 80, planned_after_chapter: 0, content: plan };
const input = { novelId: "n", runId: "r", bible: BibleDraftSchema.parse(seed.bible), bibleUpdatedAt: new Date(1), currentChapter: 0, chapter: 1, total: 10, continuous: true, model: "chosen" };
beforeEach(() => { vi.resetAllMocks(); m.first.mockResolvedValue(null); m.prior.mockResolvedValue([]); m.outline.mockResolvedValue([]); m.progress.mockResolvedValue([]); m.plan.mockResolvedValue(plan); m.run.mockResolvedValue({ status: "planning", total_chapters: 10 }); m.runLock.mockResolvedValue({ count: 1 }); m.bibleLock.mockResolvedValue({ count: 1 }); m.winner.mockResolvedValue(null); });
describe("durable volume plans", () => {
  it("reads and validates saved plans", async () => { expect(await readVolumeArc("n", 1)).toBeUndefined(); m.first.mockResolvedValue(row); expect((await readVolumeArc("n", 1))?.plan).toEqual(plan); m.first.mockResolvedValue({ ...row, content: {} }); await expect(readVolumeArc("n", 1)).rejects.toThrow(); });
  it("reuses a sufficient plan without another model call", async () => { m.first.mockResolvedValue(row); expect((await ensureVolumeArc(input)).end_chapter).toBe(80); expect(m.plan).not.toHaveBeenCalled(); });
  it("extends a finite plan and includes actual prose, prior plans, and the selected model", async () => {
    m.first.mockResolvedValue({ ...row, end_chapter: 8 }); m.outline.mockResolvedValue([{ chapter_index: 2 }, { chapter_index: 1 }]); m.prior.mockResolvedValue([row]); m.progress.mockResolvedValue([{ chapter_index: 2, excerpt: "已发生事实" }]);
    const result = await ensureVolumeArc(input); expect(result.end_chapter).toBe(80); expect(m.plan.mock.calls[0][0]).toMatchObject({ model: "chosen", recentOutline: [{ chapter_index: 1 }, { chapter_index: 2 }], recentProgress: [{ excerpt: "已发生事实" }], previousPlans: [plan] }); expect(m.save.mock.calls[0][0].create).toMatchObject({ novel_id: "n", source_bible_updated_at: new Date(1) });
  });
  it("keeps the concurrent winner rather than overwriting its paid-for plan", async () => { m.winner.mockResolvedValue({ ...row, content: { ...plan, name: "先存卷计划" } }); const result = await ensureVolumeArc(input); expect(result.plan.name).toBe("先存卷计划"); expect(m.save).not.toHaveBeenCalled(); });
  it("extends a shorter concurrent plan", async () => { m.winner.mockResolvedValue({ ...row, end_chapter: 8 }); await ensureVolumeArc(input); expect(m.save).toHaveBeenCalled(); });
  it.each([null, { status: "paused", total_chapters: 10 }, { status: "planning", total_chapters: 20 }])("rejects a changed run %j", async run => { m.run.mockResolvedValue(run); await expect(ensureVolumeArc(input)).rejects.toThrow("已暂停"); expect(m.save).not.toHaveBeenCalled(); });
  it("rejects a changed run lock or Bible watermark", async () => { m.runLock.mockResolvedValueOnce({ count: 0 }); await expect(ensureVolumeArc(input)).rejects.toThrow("任务状态"); m.bibleLock.mockResolvedValue({ count: 0 }); await expect(ensureVolumeArc(input)).rejects.toThrow("设定已改变"); expect(m.save).not.toHaveBeenCalled(); });
  it("honors lease and cancellation before commit", async () => {
    const controller = new AbortController(); const active = vi.fn().mockRejectedValueOnce(new Error("lease expired")); const execution = { signal: controller.signal, assertActive: active };
    await expect(ensureVolumeArc(input, execution)).rejects.toThrow("lease expired"); expect(m.save).not.toHaveBeenCalled();
    active.mockResolvedValue(undefined); controller.abort(new Error("cancelled")); await expect(ensureVolumeArc(input, execution)).rejects.toThrow("cancelled");
    m.winner.mockResolvedValue(row); await expect(ensureVolumeArc(input, execution)).rejects.toThrow("cancelled");
  });
});
