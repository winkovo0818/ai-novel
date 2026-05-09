import { jsonError } from "@/lib/http/json";
import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { BibleUpdateRequestSchema } from "@/lib/validation/schemas";
import { getRequiredUserId } from "@/utils/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = BibleUpdateRequestSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError("INVALID_INPUT", "Invalid Bible update request", false, 400);
  }

  const novel = await prisma.novel.findUnique({
    where: { id },
    include: { bible: true },
  });

  if (!novel || !novel.bible) {
    return jsonError("NOVEL_NOT_FOUND", "Novel or Bible not found", false, 404);
  }

  let userId: string;
  try {
    userId = await getRequiredUserId();
  } catch {
    return jsonError("UNAUTHORIZED", "Login required", false, 401);
  }
  if (!canAccessOwnerResource(novel.user_id, userId)) {
    return jsonError("NOVEL_NOT_FOUND", "Novel not found", false, 404);
  }

  const updated = await prisma.bibleDraft.update({
    where: { novel_id: id },
    data: { content: parsed.data.content as object },
  });

  return Response.json({ ok: true, data: updated });
}