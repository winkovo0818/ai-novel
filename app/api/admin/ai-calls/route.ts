import { prisma } from "@/lib/db";
import { adminGuardResponse } from "@/lib/auth/admin";
import { jsonOk, jsonError } from "@/lib/http/json";

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

  const [rows, total] = await Promise.all([
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
  ]);

  const summary = await prisma.llmUsage.aggregate({
    where,
    _sum: { token_in: true, token_out: true, cost_cny: true },
    _count: true,
  });

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
  });
}