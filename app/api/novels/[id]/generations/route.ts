import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { getRequiredUserId } from "@/utils/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const ALLOWED_AGENTS = new Set([
  "writer",
  "critic",
  "state_updater",
  "outline",
  "summarizer",
  "tiered_summarizer",
  "consistency",
  "logline",
  "questions",
  "bible",
]);

const ALLOWED_STATUSES = new Set(["ok", "err"]);

/**
 * GET /api/novels/:id/generations
 *
 * Reuses the existing LlmUsage table (every chatCompletionWithRetry call
 * already writes a row via lib/llm/client.ts). No separate "generation"
 * table — usage rows already carry user_id/novel_id/agent/status/took_ms,
 * which is everything the history page needs.
 *
 * Query params:
 *   ?agent=writer  filter by agent (allow-listed)
 *   ?status=err    filter by status (ok | err)
 *   ?limit=50      cap results, default 50, max 200
 */
export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const novel = await prisma.novel.findUnique({
    where: { id },
    select: { id: true, user_id: true },
  });
  if (!novel) return jsonError("NOVEL_NOT_FOUND", "Novel not found", false, 404);

  let userId: string;
  try {
    userId = await getRequiredUserId();
  } catch {
    return jsonError("UNAUTHORIZED", "Login required", false, 401);
  }
  if (!canAccessOwnerResource(novel.user_id, userId)) {
    return jsonError("NOVEL_NOT_FOUND", "Novel not found", false, 404);
  }

  const url = new URL(request.url);
  const agent = url.searchParams.get("agent") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const limitRaw = Number(url.searchParams.get("limit") ?? "50");
  const limit = Math.min(Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50), 200);

  const rows = await prisma.llmUsage.findMany({
    where: {
      novel_id: id,
      user_id: userId,
      ...(agent && ALLOWED_AGENTS.has(agent) ? { agent } : {}),
      ...(status && ALLOWED_STATUSES.has(status) ? { status } : {}),
    },
    orderBy: { created_at: "desc" },
    take: limit,
  });

  return jsonOk({
    generations: rows.map((row) => ({
      id: row.id,
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
