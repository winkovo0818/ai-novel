import { prisma } from "@/lib/db";
import { errorMessage, logError, logWarn } from "@/lib/observability/logger";

export interface UsageLogEntry {
  userId: string;
  novelId?: string;
  route: string;
  agent?: string;
  model: string;
  tokenIn: number;
  tokenOut: number;
  costCny: number;
  status: "ok" | "err";
  errorCode?: string;
  /** Round-trip latency in milliseconds. */
  tookMs?: number;
}

export async function logUsage(entry: UsageLogEntry): Promise<void> {
  try {
    await prisma.llmUsage.create({
      data: {
        user_id: entry.userId,
        novel_id: entry.novelId,
        route: entry.route,
        agent: entry.agent,
        model: entry.model,
        token_in: entry.tokenIn,
        token_out: entry.tokenOut,
        cost_cny: entry.costCny,
        status: entry.status,
        error_code: entry.errorCode,
        took_ms: entry.tookMs,
      },
    });
  } catch (err) {
    logError("usage.persist_failed", {
      user_id: entry.userId,
      novel_id: entry.novelId,
      route: entry.route,
      agent: entry.agent,
      status: entry.status,
      error: errorMessage(err),
    });
  }
}

export interface UsageSummary {
  totalCalls: number;
  totalTokenIn: number;
  totalTokenOut: number;
  totalCostCny: number;
  byRoute: Record<string, { calls: number; tokenIn: number; tokenOut: number; costCny: number }>;
  byAgent: Record<string, { calls: number; tokenIn: number; tokenOut: number; costCny: number }>;
}

export async function getUserUsage(
  userId: string,
  since: Date,
): Promise<UsageSummary> {
  const rows = await prisma.llmUsage.findMany({
    where: { user_id: userId, created_at: { gte: since } },
    select: {
      route: true,
      agent: true,
      token_in: true,
      token_out: true,
      cost_cny: true,
    },
  });

  const summary: UsageSummary = {
    totalCalls: rows.length,
    totalTokenIn: 0,
    totalTokenOut: 0,
    totalCostCny: 0,
    byRoute: {},
    byAgent: {},
  };

  for (const row of rows) {
    summary.totalTokenIn += row.token_in;
    summary.totalTokenOut += row.token_out;
    summary.totalCostCny += row.cost_cny;

    const routeKey = row.route;
    if (!summary.byRoute[routeKey]) {
      summary.byRoute[routeKey] = { calls: 0, tokenIn: 0, tokenOut: 0, costCny: 0 };
    }
    summary.byRoute[routeKey].calls++;
    summary.byRoute[routeKey].tokenIn += row.token_in;
    summary.byRoute[routeKey].tokenOut += row.token_out;
    summary.byRoute[routeKey].costCny += row.cost_cny;

    const agentKey = row.agent ?? "unknown";
    if (!summary.byAgent[agentKey]) {
      summary.byAgent[agentKey] = { calls: 0, tokenIn: 0, tokenOut: 0, costCny: 0 };
    }
    summary.byAgent[agentKey].calls++;
    summary.byAgent[agentKey].tokenIn += row.token_in;
    summary.byAgent[agentKey].tokenOut += row.token_out;
    summary.byAgent[agentKey].costCny += row.cost_cny;
  }

  return summary;
}

const DEFAULT_DAILY_COST_LIMIT_CNY = 50;
const DEFAULT_MONTHLY_COST_LIMIT_CNY = 500;
const DEFAULT_DAILY_CALL_LIMIT = 200;
const DEFAULT_MONTHLY_CALL_LIMIT = 5000;
const DEFAULT_SINGLE_REQUEST_COST_LIMIT_CNY = 10;
const DEFAULT_COST_ESTIMATE_CHARS_PER_TOKEN = 2;
const DEFAULT_COST_ESTIMATE_OUTPUT_TOKENS = 4096;

function positiveNumberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getQuotaLimits() {
  return {
    dailyLimitCny: positiveNumberEnv("DAILY_COST_LIMIT_CNY", DEFAULT_DAILY_COST_LIMIT_CNY),
    monthlyLimitCny: positiveNumberEnv("MONTHLY_COST_LIMIT_CNY", DEFAULT_MONTHLY_COST_LIMIT_CNY),
    dailyCallLimit: Math.floor(positiveNumberEnv("DAILY_CALL_LIMIT", DEFAULT_DAILY_CALL_LIMIT)),
    monthlyCallLimit: Math.floor(positiveNumberEnv("MONTHLY_CALL_LIMIT", DEFAULT_MONTHLY_CALL_LIMIT)),
    singleRequestLimitCny: positiveNumberEnv(
      "SINGLE_REQUEST_COST_LIMIT_CNY",
      DEFAULT_SINGLE_REQUEST_COST_LIMIT_CNY,
    ),
  };
}

function getQuotaResetTimes(now: Date) {
  return {
    nextDailyResetAt: new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
    ).toISOString(),
    nextMonthlyResetAt: new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      1,
    ).toISOString(),
  };
}

export function estimateLlmRequestCostCny(input: {
  inputChars: number;
  outputTokenBudget?: number;
}): number {
  const charsPerToken = positiveNumberEnv(
    "LLM_COST_ESTIMATE_CHARS_PER_TOKEN",
    DEFAULT_COST_ESTIMATE_CHARS_PER_TOKEN,
  );
  const outputTokens = input.outputTokenBudget ?? positiveNumberEnv(
    "LLM_COST_ESTIMATE_OUTPUT_TOKENS",
    DEFAULT_COST_ESTIMATE_OUTPUT_TOKENS,
  );
  const tokenIn = Math.ceil(Math.max(0, input.inputChars) / charsPerToken);
  const tokenOut = Math.max(0, outputTokens);
  return (tokenIn * 0.001 + tokenOut * 0.002) / 1000;
}

export function estimateLlmMessagesCostCny(
  messages: Array<{ content: string }>,
  outputTokenBudget?: number,
): number {
  return estimateLlmRequestCostCny({
    inputChars: messages.reduce((sum, message) => sum + message.content.length, 0),
    outputTokenBudget,
  });
}

export type QuotaFailureMode = "allow" | "block";

export function getQuotaFailureMode(): QuotaFailureMode {
  const env = process.env.QUOTA_FAILURE_MODE;
  if (env === "allow" || env === "block") return env;
  return process.env.NODE_ENV === "production" ? "block" : "allow";
}

export interface QuotaCheck {
  allowed: boolean;
  reason?: string;
  code?: "QUOTA_EXCEEDED" | "QUOTA_CHECK_FAILED";
  limitType?:
    | "daily_cost"
    | "monthly_cost"
    | "daily_calls"
    | "monthly_calls"
    | "single_request_cost"
    | "quota_check_failed";
  dailyCostCny: number;
  monthlyCostCny: number;
  dailyLimitCny: number;
  monthlyLimitCny: number;
  dailyCalls: number;
  monthlyCalls: number;
  dailyCallLimit: number;
  monthlyCallLimit: number;
  singleRequestLimitCny: number;
  estimatedCostCny?: number;
  nextDailyResetAt: string;
  nextMonthlyResetAt: string;
}

export interface QuotaCheckOptions {
  estimatedCostCny?: number;
  now?: Date;
}

export async function checkQuota(userId: string, options: QuotaCheckOptions = {}): Promise<QuotaCheck> {
  let dailyCost = 0;
  let monthlyCost = 0;
  let dailyCalls = 0;
  let monthlyCalls = 0;
  const now = options.now ?? new Date();
  const limits = getQuotaLimits();
  const resets = getQuotaResetTimes(now);
  const estimatedCostCny = typeof options.estimatedCostCny === "number"
    && Number.isFinite(options.estimatedCostCny)
    ? Math.max(0, options.estimatedCostCny)
    : undefined;
  const base = {
    dailyCostCny: dailyCost,
    monthlyCostCny: monthlyCost,
    dailyLimitCny: limits.dailyLimitCny,
    monthlyLimitCny: limits.monthlyLimitCny,
    dailyCalls,
    monthlyCalls,
    dailyCallLimit: limits.dailyCallLimit,
    monthlyCallLimit: limits.monthlyCallLimit,
    singleRequestLimitCny: limits.singleRequestLimitCny,
    estimatedCostCny,
    ...resets,
  };

  if (estimatedCostCny !== undefined && estimatedCostCny > limits.singleRequestLimitCny) {
    return {
      allowed: false,
      reason: `Single request cost estimate exceeds limit (¥${estimatedCostCny.toFixed(2)} / ¥${limits.singleRequestLimitCny})`,
      code: "QUOTA_EXCEEDED",
      limitType: "single_request_cost",
      ...base,
    };
  }

  try {
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [dailyUsage, monthlyUsage] = await Promise.all([
      prisma.llmUsage.aggregate({
        where: { user_id: userId, created_at: { gte: dayStart } },
        _sum: { cost_cny: true },
        _count: true,
      }),
      prisma.llmUsage.aggregate({
        where: { user_id: userId, created_at: { gte: monthStart } },
        _sum: { cost_cny: true },
        _count: true,
      }),
    ]);

    dailyCost = dailyUsage._sum.cost_cny ?? 0;
    monthlyCost = monthlyUsage._sum.cost_cny ?? 0;
    dailyCalls = dailyUsage._count;
    monthlyCalls = monthlyUsage._count;
  } catch (err) {
    const mode = getQuotaFailureMode();
    const message = errorMessage(err);
    if (mode === "block") {
      logError("usage.quota_check_failed", {
        user_id: userId,
        mode,
        error: message,
      });
      return {
        allowed: false,
        reason: "Usage quota service is temporarily unavailable, please try again later",
        code: "QUOTA_CHECK_FAILED",
        limitType: "quota_check_failed",
        ...base,
      };
    }
    logWarn("usage.quota_check_failed", {
      user_id: userId,
      mode,
      error: message,
    });
    return {
      allowed: true,
      ...base,
    };
  }

  const usage = {
    ...base,
    dailyCostCny: dailyCost,
    monthlyCostCny: monthlyCost,
    dailyCalls,
    monthlyCalls,
  };

  if (dailyCost >= limits.dailyLimitCny) {
    return {
      allowed: false,
      reason: `Daily cost limit reached (¥${dailyCost.toFixed(2)} / ¥${limits.dailyLimitCny})`,
      code: "QUOTA_EXCEEDED",
      limitType: "daily_cost",
      ...usage,
    };
  }

  if (monthlyCost >= limits.monthlyLimitCny) {
    return {
      allowed: false,
      reason: `Monthly cost limit reached (¥${monthlyCost.toFixed(2)} / ¥${limits.monthlyLimitCny})`,
      code: "QUOTA_EXCEEDED",
      limitType: "monthly_cost",
      ...usage,
    };
  }

  if (dailyCalls >= limits.dailyCallLimit) {
    return {
      allowed: false,
      reason: `Daily call limit reached (${dailyCalls} / ${limits.dailyCallLimit})`,
      code: "QUOTA_EXCEEDED",
      limitType: "daily_calls",
      ...usage,
    };
  }

  if (monthlyCalls >= limits.monthlyCallLimit) {
    return {
      allowed: false,
      reason: `Monthly call limit reached (${monthlyCalls} / ${limits.monthlyCallLimit})`,
      code: "QUOTA_EXCEEDED",
      limitType: "monthly_calls",
      ...usage,
    };
  }

  return {
    allowed: true,
    ...usage,
  };
}

export function quotaErrorDetails(quota: QuotaCheck) {
  return {
    reason: quota.reason,
    limitType: quota.limitType,
    dailyCostCny: quota.dailyCostCny,
    monthlyCostCny: quota.monthlyCostCny,
    dailyLimitCny: quota.dailyLimitCny,
    monthlyLimitCny: quota.monthlyLimitCny,
    dailyCalls: quota.dailyCalls,
    monthlyCalls: quota.monthlyCalls,
    dailyCallLimit: quota.dailyCallLimit,
    monthlyCallLimit: quota.monthlyCallLimit,
    singleRequestLimitCny: quota.singleRequestLimitCny,
    estimatedCostCny: quota.estimatedCostCny,
    nextDailyResetAt: quota.nextDailyResetAt,
    nextMonthlyResetAt: quota.nextMonthlyResetAt,
  };
}

export function quotaExceededResponse(quota: QuotaCheck): Response {
  const code = quota.code ?? "QUOTA_EXCEEDED";
  const checkFailed = code === "QUOTA_CHECK_FAILED";
  return Response.json(
    {
      ok: false,
      error: {
        code,
        message: quota.reason ?? "Usage quota exceeded",
        retryable: checkFailed,
        details: quotaErrorDetails(quota),
      },
    },
    { status: checkFailed ? 503 : 429 },
  );
}
