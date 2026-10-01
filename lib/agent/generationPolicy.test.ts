import { describe, expect, it } from "vitest";
import { generationPolicy, nextPlanningTarget } from "./generationPolicy";
describe("rolling generation policy", () => {
  it("keeps legacy runs finite", () => { expect(generationPolicy(undefined)).toEqual({ continuous: false, planning_window: 10 }); });
  it("does not accept a malformed policy", () => { expect(() => generationPolicy({ continuous: "true" })).toThrow(); });
  it("does not impose an 80 or 1000 chapter ceiling", () => { expect(nextPlanningTarget(1000, 10)).toBe(1010); });
  it("guards against database integer overflow", () => { expect(() => nextPlanningTarget(2_147_483_640, 10)).toThrow("数据库上限"); });
});

import { StartRequestSchema } from "./autoGeneration";
describe("explicit continuous budgets", () => {
  it("requires a chosen budget policy and quality checkpoint", () => {
    expect(StartRequestSchema.safeParse({continuous: true}).success).toBe(false);
    expect(StartRequestSchema.safeParse({continuous: true, unlimited_budget: true, checkpoint_mode: "none"}).success).toBe(false);
    expect(StartRequestSchema.safeParse({continuous: true, unlimited_budget: true, cost_cap_cny: 5}).success).toBe(false);
  });
  it("allows unlimited spend with an exact experimental stop and optional daily cap", () => {
    const config = StartRequestSchema.parse({continuous: true, unlimited_budget: true, stop_after_chapter: 100, daily_cost_cap_cny: 5});
    expect(config.stop_after_chapter).toBe(100); expect(config.cost_cap_cny).toBeUndefined();
  });
});
