import { prisma } from "@/lib/db";
import { adminGuardResponse } from "@/lib/auth/admin";
import { jsonError, jsonOk } from "@/lib/http/json";
import { RoleSchema } from "@/lib/validation/userRole";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAdminAudit } from "@/lib/admin/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string; role: string }>;
}

/**
 * Revoke a role. Idempotent: deleting a row that doesn't exist is treated
 * as success (Prisma P2025 swallowed) — UI can re-issue without surprises.
 *
 * No self-protection guard (D-04): the env allowlist (D-02) is the
 * permanent escape hatch if every admin row is removed.
 */
export async function DELETE(_request: Request, context: RouteContext) {
  const denied = await adminGuardResponse();
  if (denied) return denied;

  const { id, role } = await context.params;
  const parsed = RoleSchema.safeParse(role);
  if (!parsed.success) {
    return jsonError("INVALID_ROLE", `Role '${role}' is not allowed`, false, 400);
  }
  if (parsed.data === "admin") {
    const dbAdminCount = await prisma.userRole.count({ where: { role: "admin" } });
    if (dbAdminCount <= 1) {
      return jsonError(
        "LAST_ADMIN",
        "不能移除最后一个数据库 admin。请先授予另一个管理员，或确认 env allowlist 兜底后再调整数据库角色。",
        false,
        409,
      );
    }
  }

  try {
    await prisma.userRole.delete({
      where: { user_id_role: { user_id: id, role: parsed.data } },
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2025") {
      return jsonOk({ user_id: id, role: parsed.data, deleted: false });
    }
    throw err;
  }
  const actor = await getCurrentUser();
  await recordAdminAudit({
    actorUserId: actor?.id ?? null,
    action: "user_role.revoke",
    targetType: "user",
    targetId: id,
    metadata: { role: parsed.data },
  });

  return jsonOk({ user_id: id, role: parsed.data, deleted: true });
}
