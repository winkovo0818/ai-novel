import { prisma } from "@/lib/db";
import { moderateContent, stringifyForModeration } from "@/lib/moderation/moderate";
import {
  BibleDraftSchema,
  FinalizeRequestSchema,
  FinalizeResponseSchema,
} from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = FinalizeRequestSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError("INVALID_INPUT", "Invalid finalize request", false, 400);
  }

  const session = await prisma.onboardingSession.findUnique({ where: { id } });
  if (!session) {
    return jsonError("SESSION_NOT_FOUND", "Onboarding session not found", false, 404);
  }

  const draftResult = BibleDraftSchema.safeParse(parsed.data.bible_draft ?? session.bible_draft);
  if (!draftResult.success) {
    return jsonError("INVALID_INPUT", "Bible draft is missing or invalid", true, 400);
  }

  try {
    const draft = draftResult.data;
    const moderation = await moderateContent({
      route: "/api/onboarding/sessions/:id/finalize",
      text: stringifyForModeration(draft),
    });
    if (!moderation.allowed) {
      return jsonError(
        moderation.code ?? "INTERNAL",
        moderation.reason ?? "Bible draft blocked by moderation",
        false,
        400,
      );
    }

    const novel = await prisma.$transaction(async (tx) => {
      const created = await tx.novel.create({
        data: {
          user_id: session.user_id,
          title: session.title?.trim() || draft.meta.suggested_title,
          profile: parsed.data.profile,
          session_id: session.id,
          bible: {
            create: {
              content: draft,
            },
          },
        },
      });

      await tx.onboardingSession.update({
        where: { id },
        data: { status: "finalized", bible_draft: draft },
      });

      return created;
    });

    const data = FinalizeResponseSchema.parse({
      novel_id: novel.id,
      editor_url: `/editor/${novel.id}`,
      action: parsed.data.action,
    });

    return Response.json({ ok: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return jsonError("INTERNAL", message, true, 500);
  }
}

function jsonError(code: string, message: string, retryable: boolean, status: number) {
  return Response.json({ ok: false, error: { code, message, retryable } }, { status });
}
