import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { checkAdmin } from "@/lib/auth/admin";
import { getRequiredUserId } from "@/lib/auth/session";
import { jsonError, jsonOk } from "@/lib/http/json";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const UpdateNovelSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  profile: z.record(z.unknown()).optional(),
});

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const novel = await prisma.novel.findUnique({
    where: { id },
    include: {
      bible: true,
      chapters: { orderBy: { chapter_index: "asc" } },
    },
  });

  if (!novel || novel.deleted_at) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "NOVEL_NOT_FOUND",
          message: "Novel not found",
          retryable: false,
        },
      },
      { status: 404 },
    );
  }

  let userId: string;
  try {
    userId = await getRequiredUserId();
  } catch {
    return Response.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Login required", retryable: false } },
      { status: 401 },
    );
  }
  if (!canAccessOwnerResource(novel.user_id, userId)) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "NOVEL_NOT_FOUND",
          message: "Novel not found",
          retryable: false,
        },
      },
      { status: 404 },
    );
  }

  return Response.json({ ok: true, data: novel });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const body = await request.json().catch(() => null);
    const parsed = UpdateNovelSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("INVALID_INPUT", parsed.error.issues.map((i) => i.message).join("; "), false, 400);
    }

    const novel = await prisma.novel.findUnique({
      where: { id },
      select: { id: true, user_id: true, deleted_at: true },
    });
    if (!novel || novel.deleted_at) {
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

    const data: Record<string, unknown> = {};
    if (parsed.data.title !== undefined) data.title = parsed.data.title;
    if (parsed.data.profile !== undefined) data.profile = parsed.data.profile;

    if (Object.keys(data).length === 0) {
      return jsonError("INVALID_INPUT", "No fields to update", false, 400);
    }

    const updated = await prisma.novel.update({
      where: { id },
      data,
      include: {
        bible: { select: { id: true } },
        chapters: { select: { id: true, status: true } },
      },
    });

    return jsonOk({
      id: updated.id,
      title: updated.title,
      profile: updated.profile,
      created_at: updated.created_at.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return jsonError("INTERNAL", message, true, 500);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const novel = await prisma.novel.findUnique({
      where: { id },
      select: { id: true, user_id: true, deleted_at: true },
    });

    if (!novel || novel.deleted_at) {
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

    await prisma.novel.update({
      where: { id },
      data: { deleted_at: new Date() },
      select: { id: true },
    });

    return Response.json({ ok: true, data: { deleted: true, recoverable: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return jsonError("INTERNAL", message, true, 500);
  }
}
