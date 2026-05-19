import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/db";
import { adminGuardResponse } from "@/lib/auth/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_AGENTS = new Set([
  "writer", "critic", "state_updater", "outline",
  "summarizer", "tiered_summarizer", "consistency",
  "logline", "questions", "bible",
]);

const ALLOWED_STATUSES = new Set(["ok", "err"]);

export async function GET(request: Request) {
  const guard = await adminGuardResponse();
  if (guard) return guard;

  const url = new URL(request.url);
  const agent = url.searchParams.get("agent") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const limitRaw = Number(url.searchParams.get("limit") ?? "100");
  const limit = Math.min(Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 100), 500);

  const rows = await prisma.llmUsage.findMany({
    where: {
      ...(agent && ALLOWED_AGENTS.has(agent) ? { agent } : {}),
      ...(status && ALLOWED_STATUSES.has(status) ? { status } : {}),
    },
    orderBy: { created_at: "desc" },
    take: limit,
  });

  return jsonOk({
    records: rows.map((row) => ({
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
  });
}
