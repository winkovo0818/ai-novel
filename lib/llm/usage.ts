import { prisma } from "@/lib/db";

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
      },
    });
  } catch (err) {
    console.error("[usage] failed to persist usage log:", err instanceof Error ? err.message : err);
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

const DAILY_COST_LIMIT_CNY = Number(process.env.DAILY_COST_LIMIT_CNY) || 50;
const MONTHLY_COST_LIMIT_CNY = Number(process.env.MONTHLY_COST_LIMIT_CNY) || 500;
const DAILY_CALL_LIMIT = Number(process.env.DAILY_CALL_LIMIT) || 200;
const MONTHLY_CALL_LIMIT = Number(process.env.MONTHLY_CALL_LIMIT) || 5000;

export interface QuotaCheck {
  allowed: boolean;
  reason?: string;
  dailyCostCny: number;
  monthlyCostCny: number;
  dailyLimitCny: number;
  monthlyLimitCny: number;
}

export async function checkQuota(userId: string): Promise<QuotaCheck> {
  let dailyCost = 0;
  let monthlyCost = 0;
  let dailyCalls = 0;
  let monthlyCalls = 0;

  try {
    const now = new Date();
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
    // If quota check fails (e.g. table doesn't exist yet), allow the request
    console.error("[usage] quota check failed, allowing request:", err instanceof Error ? err.message : err);
    return {
      allowed: true,
      dailyCostCny: 0,
      monthlyCostCny: 0,
      dailyLimitCny: DAILY_COST_LIMIT_CNY,
      monthlyLimitCny: MONTHLY_COST_LIMIT_CNY,
    };
  }

  if (dailyCost >= DAILY_COST_LIMIT_CNY) {
    return {
      allowed: false,
      reason: `Daily cost limit reached (¥${dailyCost.toFixed(2)} / ¥${DAILY_COST_LIMIT_CNY})`,
      dailyCostCny: dailyCost,
      monthlyCostCny: monthlyCost,
      dailyLimitCny: DAILY_COST_LIMIT_CNY,
      monthlyLimitCny: MONTHLY_COST_LIMIT_CNY,
    };
  }

  if (monthlyCost >= MONTHLY_COST_LIMIT_CNY) {
    return {
      allowed: false,
      reason: `Monthly cost limit reached (¥${monthlyCost.toFixed(2)} / ¥${MONTHLY_COST_LIMIT_CNY})`,
      dailyCostCny: dailyCost,
      monthlyCostCny: monthlyCost,
      dailyLimitCny: DAILY_COST_LIMIT_CNY,
      monthlyLimitCny: MONTHLY_COST_LIMIT_CNY,
    };
  }

  if (dailyCalls >= DAILY_CALL_LIMIT) {
    return {
      allowed: false,
      reason: `Daily call limit reached (${dailyCalls} / ${DAILY_CALL_LIMIT})`,
      dailyCostCny: dailyCost,
      monthlyCostCny: monthlyCost,
      dailyLimitCny: DAILY_COST_LIMIT_CNY,
      monthlyLimitCny: MONTHLY_COST_LIMIT_CNY,
    };
  }

  if (monthlyCalls >= MONTHLY_CALL_LIMIT) {
    return {
      allowed: false,
      reason: `Monthly call limit reached (${monthlyCalls} / ${MONTHLY_CALL_LIMIT})`,
      dailyCostCny: dailyCost,
      monthlyCostCny: monthlyCost,
      dailyLimitCny: DAILY_COST_LIMIT_CNY,
      monthlyLimitCny: MONTHLY_COST_LIMIT_CNY,
    };
  }

  return {
    allowed: true,
    dailyCostCny: dailyCost,
    monthlyCostCny: monthlyCost,
    dailyLimitCny: DAILY_COST_LIMIT_CNY,
    monthlyLimitCny: MONTHLY_COST_LIMIT_CNY,
  };
}