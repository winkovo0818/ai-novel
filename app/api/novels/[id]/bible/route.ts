import { jsonError } from "@/lib/http/json";
import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { moderateContent, stringifyForModeration } from "@/lib/moderation/moderate";
import { BibleUpdateRequestSchema } from "@/lib/validation/schemas";
import { getRequiredUserId } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "/api/novels/:id/bible";

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

  // P0-4: Bible content is later concatenated into chapter generation prompts,
  // so an unmoderated PATCH was a prompt-injection / banned-content vector —
  // a user could plant "Ignore previous instructions" into a character's
  // personality field and have it ride along into every subsequent draft.
  // Run the same moderation the chapter PATCH uses; stringifyForModeration
  // flattens the structured Bible into a single payload so all sub-fields
  // (characters/world/outline/beats) get scanned at once.
  const moderation = await moderateContent({
    route: ROUTE,
    text: stringifyForModeration(parsed.data.content),
    userId,
    novelId: id,
  });
  if (!moderation.allowed) {
    return jsonError(
      moderation.code ?? "MODERATION_BLOCKED",
      moderation.reason ?? "Content blocked by moderation",
      false,
      400,
    );
  }

  const updated = await prisma.bibleDraft.update({
    where: { novel_id: id },
    data: { content: parsed.data.content as object },
  });

  return Response.json({ ok: true, data: updated });
}
