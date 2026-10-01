import { describe, expect, it } from "vitest";
import type { NovelGenerationRun } from "@prisma/client";
import { generationBudgetDay, nextGenerationBudgetReset, generationDailySpend, generationBudgetPause } from "./generationBudget";
const now = new Date("2026-10-01T15:59:59.999Z");
const run = (extra: Partial<NovelGenerationRun> = {}): NovelGenerationRun => ({
  id: "r", novel_id: "n", user_id: "u", status: "running", total_chapters: 10, current_chapter: 0,
  revision_rounds: 2, quality_floor: 85, checkpoint_mode: "on_fail", pause_reason: null, resume_after: null,
  last_error: null, created_at: new Date(), updated_at: new Date(), last_progress_at: new Date(), config: { daily_cost_cap_cny: 2 }, cost_cap_cny: 10, cost_cny_spent: 3, cost_day: "2026-10-01", daily_cost_cny_spent: 2, ...extra });
describe("calendar generation budgets", () => {
  it("uses Shanghai midnight across UTC day and year boundaries", () => {
    expect(generationBudgetDay(now)).toBe("2026-10-01"); expect(nextGenerationBudgetReset(now).toISOString()).toBe("2026-10-01T16:00:00.000Z");
    expect(generationBudgetDay(new Date("2026-12-31T16:00:00Z"))).toBe("2027-01-01");
    expect(nextGenerationBudgetReset(new Date("2026-12-31T16:00:00Z")).toISOString()).toBe("2027-01-01T16:00:00.000Z");
  });
  it("reports zero for yesterday or legacy rows without resetting cumulative spend", () => { expect(generationDailySpend(run({ cost_day: null }), now)).toBe(0); expect(generationDailySpend(run(), now)).toBe(2); expect(generationDailySpend(run(), new Date(now.getTime() + 1))).toBe(0); });
  it("schedules daily waits but never schedules total-budget waits", () => {
    expect(generationBudgetPause(run(), now)).toMatchObject({ pause_reason: "daily_budget", resume_after: nextGenerationBudgetReset(now) });
    expect(generationBudgetPause(run({ cost_cny_spent: 10 }), now)).toMatchObject({ pause_reason: "total_budget", resume_after: null });
  });
  it("keeps legacy policies and spending below limits running", () => { expect(generationBudgetPause(run({ config: {} }), now)).toBeNull(); expect(generationBudgetPause(run({ daily_cost_cny_spent: 1 }), now)).toBeNull(); expect(generationBudgetPause(run({ cost_cap_cny: null, config: {} }), now)).toBeNull(); });
  it("resets the daily threshold when the calendar day changes", () => { expect(generationBudgetPause(run(), new Date(now.getTime() + 1))).toBeNull(); });
  it("accounts for postprocessing under daily budgets while retaining existing cumulative semantics", () => { expect(generationBudgetPause(run({ cost_cny_spent: 10 }), now, true)?.pause_reason).toBe("daily_budget"); });
});
