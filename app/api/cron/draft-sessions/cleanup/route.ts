import { cleanupExpiredDraftSessions } from "@/lib/agent/draftSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/draft-sessions/cleanup
 *
 * Vercel Cron invokes this once per day. `CRON_SECRET` is required so the
 * cleanup endpoint cannot be called anonymously outside the scheduler.
 */
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return Response.json(
      { error: "cron endpoint disabled (CRON_SECRET unset)" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const presented = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
    return Response.json(
      { error: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const deleted = await cleanupExpiredDraftSessions();
    return Response.json(
      { ok: true, deleted },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "draft_session_cleanup_failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
