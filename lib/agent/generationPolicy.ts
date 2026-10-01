import { z } from "zod";

export const GenerationPolicySchema = z.object({
  continuous: z.boolean().default(false),
  planning_window: z.number().int().min(1).max(20).default(10),
  stop_after_chapter: z.number().int().positive().max(2_147_483_647).optional(),
  daily_cost_cap_cny: z.number().finite().positive().optional(),
  unlimited_budget: z.boolean().optional(),
  model: z.string().min(1).max(120).optional(),
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
