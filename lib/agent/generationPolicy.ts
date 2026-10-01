import { z } from "zod";

export const GenerationPolicySchema = z.object({
  continuous: z.boolean().default(false),
  planning_window: z.number().int().min(1).max(20).default(10),
  stop_after_chapter: z.number().int().positive().max(2_147_483_647).optional(),
  daily_cost_cap_cny: z.number().finite().positive().optional(),
  unlimited_budget: z.boolean().optional(),
  model: z.string().min(1).max(120).optional(),
  /**
   * Per-chapter cap on state-diff items (validateStateDiff). Default mirrors
   * DEFAULT_MAX_STATE_CHANGES. Raising it unblocks real acceptance runs whose
   * chapters legitimately touch many facts — the cap still exists to stop
   * full-state regurgitation, so it is bounded (5–40).
   */
  max_state_changes: z.number().int().min(5).max(40).default(15),
});

/** Legacy runs did not persist a policy. Malformed policies fail closed. */
export function generationPolicy(config: unknown) {
  return GenerationPolicySchema.parse(config ?? {});
}

export function nextPlanningTarget(current: number, window: number) {
  const target = current + window;
  if (!Number.isSafeInteger(target) || target > 2_147_483_647) throw new Error("章节编号已达到数据库上限");
  return target;
}
