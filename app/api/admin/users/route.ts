import { prisma } from "@/lib/db";
import { adminGuardResponse } from "@/lib/auth/admin";
import { jsonOk } from "@/lib/http/json";

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
 * Returns local Auth.js users joined with their Prisma `user_roles` rows.
 */
export async function GET(request: Request) {
  const denied = await adminGuardResponse();
  if (denied) return denied;

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const perPage = Math.min(200, Math.max(1, Number(url.searchParams.get("perPage") ?? "50") || 50));

  const users = await prisma.user.findMany({
    orderBy: { created_at: "desc" },
    skip: (page - 1) * perPage,
    take: perPage,
    select: {
      id: true,
      email: true,
      created_at: true,
    },
  });

  const userIds = users.map((u) => u.id);
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

  const rows: AdminUserRow[] = users.map((u) => ({
    id: u.id,
    email: u.email ?? null,
    created_at: u.created_at.toISOString(),
    last_sign_in_at: null,
    roles: rolesByUser.get(u.id) ?? [],
  }));

  return jsonOk({ users: rows, page, perPage });
}
