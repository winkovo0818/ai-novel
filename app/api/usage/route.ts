import { getRequiredUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getUserUsage, checkQuota, quotaErrorDetails } from "@/lib/llm/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RECORD_LIMIT = 200;
const DEFAULT_RECORD_LIMIT = 100;
const TREND_DAYS = 14;

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function trendStartFor(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - (TREND_DAYS - 1));
}

export async function GET(request: Request) {
  let userId: string;
  try {
    userId = await getRequiredUserId();
  } catch {
    return Response.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Login required" } }, { status: 401 });
  }

  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const trendStart = trendStartFor(now);
  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? DEFAULT_RECORD_LIMIT);
  const limit = Math.min(MAX_RECORD_LIMIT, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : DEFAULT_RECORD_LIMIT));

  const [dailyUsage, monthlyUsage, quota, records, trendRows, monthlyStatusRows] = await Promise.all([
    getUserUsage(userId, dayStart),
    getUserUsage(userId, monthStart),
    checkQuota(userId),
    prisma.llmUsage.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "desc" },
      take: limit,
      select: {
        id: true,
        novel_id: true,
        agent: true,
        route: true,
        model: true,
        status: true,
        error_code: true,
        token_in: true,
        token_out: true,
        cost_cny: true,
        took_ms: true,
        created_at: true,
      },
    }),
    prisma.llmUsage.findMany({
      where: { user_id: userId, created_at: { gte: trendStart } },
      select: {
        status: true,
        token_in: true,
        token_out: true,
        cost_cny: true,
        created_at: true,
      },
    }),
    prisma.llmUsage.groupBy({
      by: ["status"],
      where: { user_id: userId, created_at: { gte: monthStart } },
      _count: true,
    }),
  ]);

  const trend = Array.from({ length: TREND_DAYS }, (_, index) => {
    const date = new Date(trendStart);
    date.setDate(trendStart.getDate() + index);
    return {
      date: dateKey(date),
      calls: 0,
      failures: 0,
      tokenIn: 0,
      tokenOut: 0,
      costCny: 0,
    };
  });
  const trendByDate = new Map(trend.map((item) => [item.date, item]));
  for (const row of trendRows) {
    const bucket = trendByDate.get(dateKey(row.created_at));
    if (!bucket) continue;
    bucket.calls++;
    bucket.failures += row.status === "err" ? 1 : 0;
    bucket.tokenIn += row.token_in;
    bucket.tokenOut += row.token_out;
    bucket.costCny += row.cost_cny;
  }

  const monthlyStatus = monthlyStatusRows.reduce(
    (acc, row) => {
      if (row.status === "ok") acc.ok += row._count;
      if (row.status === "err") acc.err += row._count;
      return acc;
    },
    { ok: 0, err: 0 },
  );
  const monthlyStatusTotal = monthlyStatus.ok + monthlyStatus.err;

  return Response.json({
    ok: true,
    data: {
      daily: dailyUsage,
      monthly: monthlyUsage,
      quota: {
        allowed: quota.allowed,
        reason: quota.reason,
        code: quota.code,
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
        nextDailyResetAt: quota.nextDailyResetAt,
        nextMonthlyResetAt: quota.nextMonthlyResetAt,
        details: quotaErrorDetails(quota),
      },
      monthlyStatus: {
        ...monthlyStatus,
        failureRate: monthlyStatusTotal === 0 ? 0 : monthlyStatus.err / monthlyStatusTotal,
      },
      records: records.map((row) => ({
        id: row.id,
        novel_id: row.novel_id,
        agent: row.agent,
        route: row.route,
        model: row.model,
        status: row.status,
        error_code: row.error_code,
        token_in: row.token_in,
        token_out: row.token_out,
        cost_cny: row.cost_cny,
        took_ms: row.took_ms,
        created_at: row.created_at.toISOString(),
      })),
      trend,
    },
  });
}
