import { checkAdmin } from "@/lib/auth/admin";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http/json";
import { UpdateModerationReviewSchema } from "@/lib/validation/moderationAudit";
import { recordAdminAudit } from "@/lib/admin/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const admin = await checkAdmin();
  if (!admin.ok) {
    if (admin.reason === "UNAUTHORIZED") {
      return jsonError("UNAUTHORIZED", "Login required", false, 401);
    }
    return jsonError("FORBIDDEN", "Admin access required", false, 403);
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = UpdateModerationReviewSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return jsonError(
      "INVALID_INPUT",
      parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
      false,
      400,
    );
  }

  try {
    const updated = await prisma.moderationAudit.update({
      where: { id },
      data: {
        review_status: parsed.data.review_status,
        review_note: parsed.data.review_note?.trim() || null,
        reviewed_by: admin.userId,
        reviewed_at: new Date(),
      },
      select: {
        id: true,
        review_status: true,
        review_note: true,
        reviewed_by: true,
        reviewed_at: true,
      },
    });
    await recordAdminAudit({
      actorUserId: admin.userId,
      action: "moderation_audit.review",
      targetType: "moderation_audit",
      targetId: id,
      metadata: {
        review_status: parsed.data.review_status,
        has_review_note: !!parsed.data.review_note?.trim(),
      },
    });
    return jsonOk(updated);
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === "P2025") {
      return jsonError("AUDIT_NOT_FOUND", "Moderation audit not found", false, 404);
    }
    return jsonError("INTERNAL", "Failed to update moderation audit", true, 500);
  }
}
