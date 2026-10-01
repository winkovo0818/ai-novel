import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NovelGenerationRun } from "@prisma/client";
import type { QuotaCheck } from "@/lib/llm/usage";
const m = vi.hoisted(() => ({ read: vi.fn(), update: vi.fn(), cost: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { novelGenerationRun: { updateMany: m.update } } }));
vi.mock("./generationRun", () => ({ getRun: m.read, addCost: m.cost }));
import { enforceGenerationBudget, generationCallContext } from "./generationExecution";
import { generationBudgetDay } from "./generationBudget";
import { JobDeferredError } from "@/lib/jobs/deferred";
const run = (extra: Partial<NovelGenerationRun> = {}): NovelGenerationRun => ({
  id: "r", novel_id: "n", user_id: "u", status: "running", total_chapters: 10, current_chapter: 0,
  revision_rounds: 2, quality_floor: 85, checkpoint_mode: "on_fail", pause_reason: null, resume_after: null,
  last_error: null, created_at: new Date(), updated_at: new Date(), last_progress_at: new Date(), config: { daily_cost_cap_cny: 2 }, cost_cap_cny: 10, cost_cny_spent: 3, cost_day: generationBudgetDay(), daily_cost_cny_spent: 2, ...extra });
const context = (phase: "running" | "planning" | "postprocessing" = "running") => generationCallContext({ runId: "r", novelId: "n", userId: "u", phase });
beforeEach(() => { vi.resetAllMocks(); m.update.mockResolvedValue({ count: 1 }); m.read.mockResolvedValue(run({ daily_cost_cny_spent: 0 })); });
describe("generation resource waits", () => {
  it("durably pauses active generation and defers without a failed attempt", async () => { await expect(enforceGenerationBudget(run())).rejects.toBeInstanceOf(JobDeferredError); expect(m.update.mock.calls[0][0].data).toMatchObject({ status: "paused", pause_reason: "daily_budget" }); });
  it("does not overwrite review or completion status for postprocessing waits", async () => { await expect(enforceGenerationBudget(run({ status: "needs_review" }), true)).rejects.toBeInstanceOf(JobDeferredError); expect(m.update).not.toHaveBeenCalled(); });
  it("parks cumulative exhaustion until manual recovery", async () => { await expect(enforceGenerationBudget(run({ cost_cny_spent: 10 }))).rejects.toMatchObject({ retryAt: null }); });
  it("honors a concurrent pause/cancel before recording a wait", async () => { m.update.mockResolvedValue({ count: 0 }); await expect(enforceGenerationBudget(run())).rejects.toThrow("状态已改变"); });
  it("attributes costs and guards the lease even for non-run jobs", async () => {
    const active = vi.fn(); const controller = new AbortController(); const c = generationCallContext({ novelId: "n", phase: "postprocessing", execution: { assertActive: active, signal: controller.signal } });
    await c.beforeCall!(); expect(active).toHaveBeenCalled(); expect(c.onCost).toBeUndefined(); expect(m.read).not.toHaveBeenCalled();
    await context().onCost!(0.2); expect(m.cost).toHaveBeenCalledWith("r", 0.2);
  });
  it.each([null, run({ novel_id: "another" })])("rejects invalid run attribution %j", async value => { m.read.mockResolvedValue(value); await expect(context().beforeCall!()).rejects.toThrow("不属于"); });
  it("honors manual stops and resource waits before paid calls", async () => {
    m.read.mockResolvedValue(run({ status: "paused", pause_reason: "manual" })); await expect(context().beforeCall!()).rejects.toThrow("no longer");
    m.read.mockResolvedValue(run({ status: "paused", pause_reason: "quota", resume_after: new Date(Date.now() + 1000) })); await expect(context().beforeCall!()).rejects.toBeInstanceOf(JobDeferredError);
  });
  it("allows planning and postprocessing with appropriate state and budget checks", async () => { m.read.mockResolvedValue(run({ status: "planning", daily_cost_cny_spent: 0 })); await context("planning").beforeCall!(); await context("postprocessing").beforeCall!(); });
  it.each(["daily_cost", "daily_calls", "monthly_cost", "monthly_calls"])("waits for %s quota resets", async limitType => {
    const future = new Date(Date.now() + 60_000).toISOString();
    await expect(context().onQuotaBlocked!({ limitType, nextDailyResetAt: future, nextMonthlyResetAt: future } as QuotaCheck)).rejects.toBeInstanceOf(JobDeferredError);
    expect(m.update.mock.calls[0][0].data.pause_reason).toBe("quota");
  });
  it.each(["single_request_cost", "quota_check_failed", undefined])("does not auto-restart permanent quota failures %j", async limitType => { await context().onQuotaBlocked!({ limitType } as QuotaCheck); expect(m.update).not.toHaveBeenCalled(); });
  it.each(["invalid", "2020-01-01"])("rejects invalid or already expired reset times %s", async nextDailyResetAt => { await context().onQuotaBlocked!({ limitType: "daily_cost", nextDailyResetAt } as QuotaCheck); expect(m.update).not.toHaveBeenCalled(); });
});
