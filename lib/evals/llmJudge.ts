import { z } from "zod";
import { parseFirstJsonObject } from "@/lib/llm/extractJson";
import { JUDGE_DIMENSION_KEYS } from "@/lib/llm/prompts/judge";

/**
 * P2 LLM Judge 的解析与判定核心（纯函数，LLM 调用在 handler 侧注入）。
 * 解析 fail-closed：不可解析/维度不全返回 null，调用方按「评审未知」处理，
 * 不得当作「无问题」（与 Critic 两连失败模式同源）。
 */

export type JudgeDimension = (typeof JUDGE_DIMENSION_KEYS)[number];

const JudgeScoreSchema = z.object({
  key: z.string().min(1),
  score: z.number().min(0).max(10),
  evidence: z.string().max(120),
});

export const JudgeVerdictSchema = z.object({
  scores: z.array(JudgeScoreSchema),
  summary: z.string().min(1).max(200),
  confidence: z.enum(["high", "medium", "low"]),
});

export interface JudgeVerdict {
  scores: Array<{ key: string; score: number; evidence: string }>;
  summary: string;
  confidence: "high" | "medium" | "low";
}

export function parseJudgeVerdict(raw: string): JudgeVerdict | null {
  const parsed = JudgeVerdictSchema.safeParse(parseFirstJsonObject(raw));
  if (!parsed.success) return null;
  // 维度必须齐全且不重复——缺维度说明模型没按量表走，视同解析失败。
  const keys = new Set(parsed.data.scores.map((s) => s.key));
  if (keys.size !== parsed.data.scores.length) return null;
  for (const dimension of JUDGE_DIMENSION_KEYS) {
    if (!keys.has(dimension)) return null;
  }
  return parsed.data;
}

/** 7 个与启发式可比维度的均分（0-100），供标定相关性计算。 */
export function judgeComparablePercent(verdict: JudgeVerdict): number | null {
  const comparable = ["continuity", "logic", "character_consistency", "plot_progress", "world_rules", "ai_voice", "prose_readability"] as const;
  const byKey = new Map(verdict.scores.map((s) => [s.key, s.score]));
  const values = comparable.map((k) => byKey.get(k)).filter((v): v is number => v != null);
  if (values.length !== comparable.length) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 10; // 0-10 → 0-100
}

/** 3 个宏观结构维度（judge 专属）的均分，0-10。 */
export function judgeMacroAverage(verdict: JudgeVerdict): number | null {
  const macro = ["clue_payoff", "situation_change", "arc_progress"] as const;
  const byKey = new Map(verdict.scores.map((s) => [s.key, s.score]));
  const values = macro.map((k) => byKey.get(k)).filter((v): v is number => v != null);
  if (values.length !== macro.length) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}
