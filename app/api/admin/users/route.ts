import { prisma } from "@/lib/db";
import { adminGuardResponse } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonError, jsonOk } from "@/lib/http/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AdminUserRow {
  id: string;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  roles: string[];
}

/**
 * Returns up to N users from Supabase auth.users, joined with their
 * Prisma `user_roles` rows. Pagination via ?page=&perPage= passes through
 * to Supabase admin API.
 */
export async function GET(request: Request) {
  const denied = await adminGuardResponse();
  if (denied) return denied;

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const perPage = Math.min(200, Math.max(1, Number(url.searchParams.get("perPage") ?? "50") || 50));

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

  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
  if (error) {
    return jsonError("SUPABASE_LIST_FAILED", error.message, true, 502);
  }

  const userIds = data.users.map((u) => u.id);
  const roles = userIds.length
    ? await prisma.userRole.findMany({
        where: { user_id: { in: userIds } },
        select: { user_id: true, role: true },
      })
    : [];

  const rolesByUser = new Map<string, string[]>();
  for (const r of roles) {
    const list = rolesByUser.get(r.user_id) ?? [];
    list.push(r.role);
    rolesByUser.set(r.user_id, list);
  }

  const rows: AdminUserRow[] = data.users.map((u) => ({
    id: u.id,
    email: u.email ?? null,
    created_at: u.created_at ?? null,
    last_sign_in_at: u.last_sign_in_at ?? null,
    roles: rolesByUser.get(u.id) ?? [],
  }));

  return jsonOk({ users: rows, page, perPage });
}
