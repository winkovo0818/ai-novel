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
   * DEFAULT_MAX_STATE_CHANGES — real-run calibration puts a normal chapter at
   * 17–24 items on deepseek-v4-flash, so 30 clears that with headroom while
   * still bounding full-state regurgitation. Hard range 5–40.
   */
  max_state_changes: z.number().int().min(5).max(40).default(30),
  /**
   * P2 LLM Judge：shadow（默认）只记录评分不判定——接入门槛为与人工标注的
   * Spearman ≥ 0.6 / 维度 MAE ≤ 2.0（见 OPTIMIZATION_PLAN_2026-10 P2.3），标定
   * 通过前禁止 enforce。enforce 在宏观结构均分 < 5 时并入质量门理由。
   */
  judge_mode: z.enum(["off", "shadow", "enforce"]).default("shadow"),
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
