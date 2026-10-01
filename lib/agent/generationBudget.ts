import type { NovelGenerationRun } from "@prisma/client";
import { generationPolicy } from "./generationPolicy";

const DAY_MS = 86_400_000;
const SHANGHAI_OFFSET_MS = 8 * 3_600_000;

/** Fixed calendar timezone, independent of the server's timezone. */
export function generationBudgetDay(now = new Date()) {
  return new Date(now.getTime() + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);
}

export function nextGenerationBudgetReset(now = new Date()) {
  return new Date((Math.floor((now.getTime() + SHANGHAI_OFFSET_MS) / DAY_MS) + 1) * DAY_MS - SHANGHAI_OFFSET_MS);
}

export function generationDailySpend(run: Pick<NovelGenerationRun, "cost_day" | "daily_cost_cny_spent">, now = new Date()) {
  return run.cost_day === generationBudgetDay(now) ? run.daily_cost_cny_spent : 0;
}

export function generationBudgetPause(run: NovelGenerationRun, now = new Date(), postprocessing = false) {
  if (!postprocessing && run.cost_cap_cny != null && run.cost_cny_spent >= run.cost_cap_cny) {
    return { pause_reason: "total_budget", resume_after: null, last_error: "生成费用达到累计上限，请提高预算后恢复" };
  }
  const cap = generationPolicy(run.config).daily_cost_cap_cny;
  if (cap != null && generationDailySpend(run, now) >= cap) {
    return { pause_reason: "daily_budget", resume_after: nextGenerationBudgetReset(now), last_error: "本任务今日预算已用尽，将在北京时间零点后继续" };
  }
  return null;
}
