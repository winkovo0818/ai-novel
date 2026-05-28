import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { checkAdmin } from "@/lib/auth/admin";
import { getRequiredUserId } from "@/lib/auth/session";
import { jsonError, jsonOk } from "@/lib/http/json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const novel = await prisma.novel.findUnique({
      where: { id },
      select: { id: true, user_id: true, deleted_at: true },
    });
    if (!novel) {
      return jsonError("NOVEL_NOT_FOUND", "Novel not found", false, 404);
    }

    let userId: string;
    try {
      userId = await getRequiredUserId();
    } catch {
      return jsonError("UNAUTHORIZED", "Login required", false, 401);
    }

    const isOwner = canAccessOwnerResource(novel.user_id, userId);
    const adminResult = await checkAdmin();
    const isAdmin = adminResult.ok;
    if (!isOwner && !isAdmin) {
      return jsonError("NOVEL_NOT_FOUND", "Novel not found", false, 404);
    }
    if (!novel.deleted_at) {
      return jsonOk({ id: novel.id, restored: false });
    }

    const restored = await prisma.novel.update({
      where: { id },
      data: { deleted_at: null },
      select: { id: true },
    });

    return jsonOk({ id: restored.id, restored: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return jsonError("INTERNAL", message, true, 500);
  }
}
