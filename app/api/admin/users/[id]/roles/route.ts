import { prisma } from "@/lib/db";
import { checkAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonError, jsonOk } from "@/lib/http/json";
import { GrantRoleSchema } from "@/lib/validation/userRole";

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

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (err) {
    return jsonError(
      "ADMIN_NOT_CONFIGURED",
      err instanceof Error ? err.message : "Service role key missing",
      false,
      500,
    );
  }
  const { data, error } = await supabase.auth.admin.getUserById(targetUserId);
  if (error || !data.user) {
    return jsonError("USER_NOT_FOUND", "Target user does not exist", false, 404);
  }

  await prisma.userRole.upsert({
    where: { user_id_role: { user_id: targetUserId, role } },
    create: { user_id: targetUserId, role, granted_by: admin.userId },
    update: {},
  });

  return jsonOk({ user_id: targetUserId, role, granted_by: admin.userId });
}
