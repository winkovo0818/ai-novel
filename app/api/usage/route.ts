import { getRequiredUserId } from "@/utils/supabase/auth";
import { getUserUsage, checkQuota } from "@/lib/llm/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let userId: string;
  try {
    userId = await getRequiredUserId();
  } catch {
    return Response.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Login required" } }, { status: 401 });
  }

  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [dailyUsage, monthlyUsage, quota] = await Promise.all([
    getUserUsage(userId, dayStart),
    getUserUsage(userId, monthStart),
    checkQuota(userId),
  ]);

  return Response.json({
    ok: true,
    data: {
      daily: dailyUsage,
      monthly: monthlyUsage,
      quota: {
        allowed: quota.allowed,
        reason: quota.reason,
        dailyCostCny: quota.dailyCostCny,
        monthlyCostCny: quota.monthlyCostCny,
        dailyLimitCny: quota.dailyLimitCny,
        monthlyLimitCny: quota.monthlyLimitCny,
      },
    },
  });
}