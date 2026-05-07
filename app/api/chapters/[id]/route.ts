import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { UpdateChapterDraftRequestSchema } from "@/lib/validation/schemas";
import { getOptionalUserId } from "@/utils/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = UpdateChapterDraftRequestSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError("INVALID_INPUT", "Invalid chapter draft update", false, 400);
  }

  try {
    const existing = await prisma.chapterDraft.findUnique({
      where: { id },
      include: { novel: { select: { user_id: true } } },
    });
    if (!existing) {
      return jsonError("CHAPTER_NOT_FOUND", "Chapter draft not found", false, 404);
    }

    const userId = await getOptionalUserId();
    if (!canAccessOwnerResource(existing.novel.user_id, userId)) {
      return jsonError("CHAPTER_NOT_FOUND", "Chapter draft not found", false, 404);
    }

    const chapter = await prisma.chapterDraft.update({ where: { id }, data: parsed.data });

    return Response.json({ ok: true, data: chapter });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return jsonError("INTERNAL", message, true, 500);
  }
}

function jsonError(code: string, message: string, retryable: boolean, status: number) {
  return Response.json({ ok: false, error: { code, message, retryable } }, { status });
}
