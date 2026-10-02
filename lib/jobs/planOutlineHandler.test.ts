import { beforeEach, describe, expect, it, vi } from "vitest";
import seed from "@/scripts/fixtures/eval-novels/xuanhuan-seed.json";
import { getLlmCallContext } from "@/lib/llm/callContext";

const mocks = vi.hoisted(() => ({ novel: vi.fn(), run: vi.fn(), latest: vi.fn(), lock: vi.fn(), bible: vi.fn(), update: vi.fn(), job: vi.fn(), plan: vi.fn(), cost: vi.fn(), memory: vi.fn(), sync: vi.fn(), arc: vi.fn(), outline: vi.fn(), review: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {
  novel: { findUnique: mocks.novel }, novelOutlineChapter: { findMany: mocks.outline }, novelGenerationRun: { updateMany: mocks.lock },
  $transaction: async (fn: (tx: unknown) => unknown) => fn({ novelGenerationRun: { updateMany: mocks.lock, findUniqueOrThrow: mocks.latest, update: mocks.update },
    bibleDraft: { update: mocks.bible }, backgroundJob: { create: mocks.job } }),
} }));
vi.mock("@/lib/agent/generationRun", () => ({ getRun: mocks.run, addCost: mocks.cost, markNeedsReview: mocks.review }));
vi.mock("@/lib/agent/planOutline", () => ({ planOutline: mocks.plan }));
vi.mock("@/lib/agent/storyMemory", () => ({ loadStoryMemory: mocks.memory, syncStoryMemory: mocks.sync, readRecentStoryProgress: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/agent/volumePlanStore", () => ({ ensureVolumeArc: mocks.arc }));
import { handlePlanOutline } from "./planOutlineHandler";
const row = (extra = {}) => ({ id: "r", novel_id: "n", user_id: "u", status: "planning", current_chapter: 0, total_chapters: 30,
  config: { continuous: false, planning_window: 10, model: "chosen" }, cost_cap_cny: 5, cost_cny_spent: 0, ...extra });
const payload = { novel_id: "n", run_id: "r", target_chapters: 30 };
const planned = (target = 18) => ({ ...seed.bible, outline: { volume_1: { ...seed.bible.outline.volume_1,
  chapters: Array.from({ length: target }, (_, i) => ({ index: i + 1, title: "规划章节", summary: "新的章节梗概：承接已有剧情，推进核心冲突，并留下后续悬念。" })) } } });
beforeEach(() => {
  vi.resetAllMocks(); mocks.memory.mockResolvedValue({ state: {}, stale_records: 0 }); mocks.outline.mockResolvedValue([]);
  mocks.arc.mockResolvedValue({ volume_index: 0, start_chapter: 1, end_chapter: 80, planned_after_chapter: 0, plan: {} });
  mocks.bible.mockResolvedValue({ updated_at: new Date(1) }); mocks.run.mockResolvedValue(row()); mocks.latest.mockResolvedValue(row()); mocks.lock.mockResolvedValue({ count: 1 });
  mocks.novel.mockResolvedValue({ id: "n", user_id: "u", profile: seed.profile, bible: { content: seed.bible, updated_at: new Date(0) } });
  mocks.plan.mockResolvedValue({ bible: planned(), addedChapters: 10 });
});
describe("durable outline planning", () => {
  it("plans at most a window and commits the next planning job with the Bible", async () => {
    await handlePlanOutline(payload);
    expect(mocks.plan.mock.calls[0][0]).toMatchObject({ targetChapters: 18, finalChapter: 30, model: "chosen" });
    expect(mocks.bible.mock.calls[0][0].where).toEqual({ novel_id: "n", updated_at: new Date(0) });
    expect(mocks.update.mock.calls[0][0].data.status).toBe("planning");
    expect(mocks.job.mock.calls[0][0].data).toMatchObject({ type: "plan_outline", payload: { target_chapters: 30 } });
  });
  it("starts the next unfinished chapter after coverage is complete", async () => {
    mocks.run.mockResolvedValue(row({ total_chapters: 18, current_chapter: 4 })); mocks.latest.mockResolvedValue(row({ current_chapter: 4 }));
    await handlePlanOutline({ ...payload, target_chapters: 18 });
    expect(mocks.job.mock.calls[0][0].data).toMatchObject({ type: "generate_chapter", payload: { chapter_index: 5 } });
  });
  it("does not rewrite an already sufficient outline", async () => {
    mocks.run.mockResolvedValue(row({ total_chapters: 8 })); mocks.plan.mockResolvedValue({ bible: seed.bible, addedChapters: 0 });
    await handlePlanOutline({ ...payload, target_chapters: 8 }); expect(mocks.bible).not.toHaveBeenCalled();
  });
  it("preserves a completed planning batch when its call uses the last budget", async () => {
    mocks.latest.mockResolvedValue(row({ cost_cny_spent: 5.1 })); await handlePlanOutline(payload);
    expect(mocks.bible).toHaveBeenCalled(); expect(mocks.update.mock.calls[0][0].data.status).toBe("paused"); expect(mocks.job).not.toHaveBeenCalled();
  });
  it("pauses before spending when the budget was already exhausted", async () => {
    mocks.run.mockResolvedValue(row({ cost_cny_spent: 5 })); await handlePlanOutline(payload);
    expect(mocks.plan).not.toHaveBeenCalled(); expect(mocks.lock.mock.calls[0][0].data.status).toBe("paused");
  });
  it.each(["paused", "cancelled", "running"])("does no work for a %s run", async status => {
    mocks.run.mockResolvedValue(row({ status })); await handlePlanOutline(payload); expect(mocks.plan).not.toHaveBeenCalled();
  });
  it("ignores an old target left by a previous planning cycle", async () => {
    await handlePlanOutline({ ...payload, target_chapters: 20 }); expect(mocks.plan).not.toHaveBeenCalled();
  });
  it("does not commit a result if the user paused during planning", async () => {
    mocks.lock.mockResolvedValue({ count: 0 }); await handlePlanOutline(payload); expect(mocks.bible).not.toHaveBeenCalled(); expect(mocks.job).not.toHaveBeenCalled();
  });
  it("checks the lease before committing", async () => {
    const execution = { signal: new AbortController().signal, assertActive: vi.fn().mockRejectedValue(new Error("lease lost")) };
    await expect(handlePlanOutline(payload, execution)).rejects.toThrow("lease lost"); expect(mocks.bible).not.toHaveBeenCalled();
  });
  it("checks run state and attributes model costs to the run inside the call", async () => {
    mocks.plan.mockImplementation(async () => {
      const context = getLlmCallContext()!; expect(context).toMatchObject({ userId: "u", novelId: "n", enforceQuota: true });
      await context.beforeCall!(); await context.onCost!(0.1); return { bible: planned(), addedChapters: 10 };
    });
    await handlePlanOutline(payload); expect(mocks.cost).toHaveBeenCalledWith("r", 0.1);
    // G4：规划读取 current+1（seed 线索 introduced_in=1 在 current=0 时不可见的 off-by-one）
    expect(mocks.memory).toHaveBeenCalledWith(expect.anything(), expect.anything(), 1);
  });
  it.each(["paused", "cap", "changed"])("stops a call when the run becomes %s", async change => {
    mocks.plan.mockImplementation(async () => {
      mocks.run.mockResolvedValue(row(change === "cap" ? { cost_cny_spent: 5 } : change === "changed" ? { total_chapters: 40 } : { status: "paused" }));
      await getLlmCallContext()!.beforeCall!();
    });
    await expect(handlePlanOutline(payload)).rejects.toThrow(); expect(mocks.bible).not.toHaveBeenCalled();
  });
  it("lets the queue retry a failed model response without advancing", async () => {
    mocks.plan.mockRejectedValue(new Error("incomplete outline")); await expect(handlePlanOutline(payload)).rejects.toThrow("incomplete outline");
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.job).not.toHaveBeenCalled();
  });
  it.each([null, {}, { ...payload, target_chapters: 1.5 }])("rejects malformed payload %j", async p => { await expect(handlePlanOutline(p)).rejects.toThrow("Invalid"); });
  it.each([null, row({ novel_id: "other" })])("rejects a missing or foreign run", async run => { mocks.run.mockResolvedValue(run); await expect(handlePlanOutline(payload)).rejects.toThrow("Planning run"); });
  it.each([null, { user_id: "other", bible: {} }, { user_id: "u", deleted_at: new Date(), bible: {} }])("rejects unavailable novels", async novel => {
    mocks.novel.mockResolvedValue(novel); await expect(handlePlanOutline(payload)).rejects.toThrow("not available");
  });
});


describe("planning memory safety", () => {
  it.each([{ stale_records: 1 }, { historical_available: false }])("pauses unsafe history before any planner call %j", async extra => {
    mocks.memory.mockResolvedValue({ state: {}, stale_records: 0, ...extra });
    await handlePlanOutline(payload);
    expect(mocks.review).toHaveBeenCalledWith("r", expect.stringContaining("校准"));
    expect(mocks.plan).not.toHaveBeenCalled(); expect(mocks.arc).not.toHaveBeenCalled(); expect(mocks.job).not.toHaveBeenCalled();
  });
});
