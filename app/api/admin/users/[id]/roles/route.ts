import { prisma } from "@/lib/db";
import { checkAdmin } from "@/lib/auth/admin";
import { jsonError, jsonOk } from "@/lib/http/json";
import { GrantRoleSchema } from "@/lib/validation/userRole";
import { recordAdminAudit } from "@/lib/admin/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Grant a role to a user. Idempotent: re-granting the same role is a no-op. */
export async function POST(request: Request, context: RouteContext) {
  const admin = await checkAdmin();
  if (!admin.ok) {
    if (admin.reason === "UNAUTHORIZED") {
      return jsonError("UNAUTHORIZED", "Login required", false, 401);
    }
    return jsonError("FORBIDDEN", "Admin access required", false, 403);
  }

  const { id: targetUserId } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = GrantRoleSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return jsonError(
      "INVALID_INPUT",
      parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
      false,
      400,
    );
  }
  const { role } = parsed.data;

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true },
  });
  if (!targetUser) {
    return jsonError("USER_NOT_FOUND", "Target user does not exist", false, 404);
  }

  await prisma.userRole.upsert({
    where: { user_id_role: { user_id: targetUserId, role } },
    create: { user_id: targetUserId, role, granted_by: admin.userId },
    update: {},
  });
  await recordAdminAudit({
    actorUserId: admin.userId,
    action: "user_role.grant",
    targetType: "user",
    targetId: targetUserId,
    metadata: { role },
  });

  return jsonOk({ user_id: targetUserId, role, granted_by: admin.userId });
}
