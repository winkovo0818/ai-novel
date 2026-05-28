import { prisma } from "@/lib/db";
import { adminGuardResponse } from "@/lib/auth/admin";
import { jsonOk } from "@/lib/http/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const blocked = await adminGuardResponse();
  if (blocked) return blocked;

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const perPage = Math.min(200, Math.max(1, Number(url.searchParams.get("perPage") ?? "50")));
  const route = url.searchParams.get("route") || undefined;
  const agent = url.searchParams.get("agent") || undefined;
  const status = url.searchParams.get("status") || undefined;

  const where: Record<string, unknown> = {};
  if (route) where.route = route;
  if (agent) where.agent = agent;
  if (status) where.status = status;

  const [rows, total, summary, byUser, byNovel, byAgent, byModel] = await Promise.all([
    prisma.llmUsage.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        user_id: true,
        novel_id: true,
        route: true,
        agent: true,
        model: true,
        token_in: true,
        token_out: true,
        cost_cny: true,
        status: true,
        error_code: true,
        took_ms: true,
        created_at: true,
      },
    }),
    prisma.llmUsage.count({ where }),
    prisma.llmUsage.aggregate({
      where,
      _sum: { token_in: true, token_out: true, cost_cny: true },
      _count: true,
    }),
    prisma.llmUsage.groupBy({
      by: ["user_id"],
      where,
      _sum: { token_in: true, token_out: true, cost_cny: true },
      _count: true,
      orderBy: { _sum: { cost_cny: "desc" } },
      take: 10,
    }),
    prisma.llmUsage.groupBy({
      by: ["novel_id"],
      where,
      _sum: { token_in: true, token_out: true, cost_cny: true },
      _count: true,
      orderBy: { _sum: { cost_cny: "desc" } },
      take: 10,
    }),
    prisma.llmUsage.groupBy({
      by: ["agent", "status"],
      where,
      _sum: { token_in: true, token_out: true, cost_cny: true },
      _count: true,
      orderBy: { _sum: { cost_cny: "desc" } },
    }),
    prisma.llmUsage.groupBy({
      by: ["model"],
      where,
      _sum: { token_in: true, token_out: true, cost_cny: true },
      _count: true,
      orderBy: { _sum: { cost_cny: "desc" } },
      take: 10,
    }),
  ]);

  const userIds = byUser.map((row) => row.user_id);
  const novelIds = byNovel.map((row) => row.novel_id).filter((id): id is string => Boolean(id));
  const [users, novels] = await Promise.all([
    userIds.length === 0
      ? Promise.resolve([])
      : prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true, name: true },
        }),
    novelIds.length === 0
      ? Promise.resolve([])
      : prisma.novel.findMany({
          where: { id: { in: novelIds } },
          select: { id: true, title: true, user_id: true },
        }),
  ]);
  const userLookup = new Map(users.map((user) => [user.id, user]));
  const novelLookup = new Map(novels.map((novel) => [novel.id, novel]));
  const agentLookup = new Map<
    string,
    {
      agent: string | null;
      calls: number;
      failures: number;
      tokenIn: number;
      tokenOut: number;
      costCny: number;
    }
  >();
  for (const row of byAgent) {
    const key = row.agent ?? "unknown";
    const current = agentLookup.get(key) ?? {
      agent: row.agent,
      calls: 0,
      failures: 0,
      tokenIn: 0,
      tokenOut: 0,
      costCny: 0,
    };
    current.calls += row._count;
    current.failures += row.status === "err" ? row._count : 0;
    current.tokenIn += row._sum.token_in ?? 0;
    current.tokenOut += row._sum.token_out ?? 0;
    current.costCny += row._sum.cost_cny ?? 0;
    agentLookup.set(key, current);
  }

  return jsonOk({
    rows,
    total,
    page,
    perPage,
    totalPages: Math.ceil(total / perPage),
    summary: {
      totalCalls: summary._count,
      totalTokenIn: summary._sum.token_in ?? 0,
      totalTokenOut: summary._sum.token_out ?? 0,
      totalCostCny: summary._sum.cost_cny ?? 0,
    },
    aggregates: {
      byUser: byUser.map((row) => {
        const user = userLookup.get(row.user_id);
        return {
          userId: row.user_id,
          email: user?.email ?? null,
          name: user?.name ?? null,
          calls: row._count,
          tokenIn: row._sum.token_in ?? 0,
          tokenOut: row._sum.token_out ?? 0,
          costCny: row._sum.cost_cny ?? 0,
        };
      }),
      byNovel: byNovel.map((row) => {
        const novel = row.novel_id ? novelLookup.get(row.novel_id) : undefined;
        return {
          novelId: row.novel_id,
          title: novel?.title ?? null,
          userId: novel?.user_id ?? null,
          calls: row._count,
          tokenIn: row._sum.token_in ?? 0,
          tokenOut: row._sum.token_out ?? 0,
          costCny: row._sum.cost_cny ?? 0,
        };
      }),
      byAgent: Array.from(agentLookup.values())
        .map((row) => ({
          ...row,
          failureRate: row.calls === 0 ? 0 : row.failures / row.calls,
        }))
        .sort((a, b) => b.costCny - a.costCny)
        .slice(0, 10),
      byModel: byModel.map((row) => ({
        model: row.model,
        calls: row._count,
        tokenIn: row._sum.token_in ?? 0,
        tokenOut: row._sum.token_out ?? 0,
        costCny: row._sum.cost_cny ?? 0,
      })),
    },
  });
}
