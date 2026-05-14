import { prisma } from "@/lib/db";
import { adminGuardResponse } from "@/lib/auth/admin";
import { jsonOk } from "@/lib/http/json";
import {
  MODERATION_REVIEW_STATUSES,
  ModerationReviewStatusSchema,
} from "@/lib/validation/moderationAudit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REVIEW_STATUS_SET = new Set<string>(MODERATION_REVIEW_STATUSES);

export async function GET(request: Request) {
  const denied = await adminGuardResponse();
  if (denied) return denied;

  const url = new URL(request.url);
  const requestedStatus = url.searchParams.get("review_status") ?? "pending";
  const reviewStatus = REVIEW_STATUS_SET.has(requestedStatus) ? requestedStatus : "pending";
  const source = url.searchParams.get("source") || undefined;
  const action = url.searchParams.get("action") || undefined;
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get("perPage") ?? "50") || 50));

  const where = {
    review_status: ModerationReviewStatusSchema.parse(reviewStatus),
    ...(source ? { source } : {}),
    ...(action ? { action } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.moderationAudit.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        user_id: true,
        novel_id: true,
        route: true,
        source: true,
        action: true,
        outcome: true,
        mode: true,
        code: true,
        reason: true,
        matched_pattern: true,
        review_status: true,
        reviewed_by: true,
        reviewed_at: true,
        review_note: true,
        text_hash: true,
        text_chars: true,
        created_at: true,
      },
    }),
    prisma.moderationAudit.count({ where }),
  ]);

  return jsonOk({
    items,
    total,
    page,
    perPage,
    filters: { review_status: reviewStatus, source: source ?? null, action: action ?? null },
  });
}
