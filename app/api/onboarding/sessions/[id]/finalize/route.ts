import { jsonError } from "@/lib/http/json";
import { prisma } from "@/lib/db";
import { authorizeOnboardingSession } from "@/lib/auth/onboardingAccess";
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

  const access = await authorizeOnboardingSession(id);
  if (!access.ok) {
    return jsonError(access.code, access.message, false, access.status);
  }
  const { userId, session } = access;

  const submittedDraft = BibleDraftSchema.safeParse(parsed.data.bible_draft);
  const draftResult = submittedDraft.success
    ? submittedDraft
    : BibleDraftSchema.safeParse(session.bible_draft);
  if (!draftResult.success) {
    return jsonError("INVALID_INPUT", "Bible draft is missing or invalid", true, 400);
  }

  try {
    const draft = draftResult.data;
    const moderation = await moderateContent({
      route: "/api/onboarding/sessions/:id/finalize",
      text: stringifyForModeration(draft),
      userId,
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
      const existing = await tx.novel.findUnique({
        where: { session_id: session.id },
      });
      if (existing) {
        await tx.onboardingSession.update({
          where: { id },
          data: { status: "finalized", bible_draft: draft },
        });
        return existing;
      }

      const created = await tx.novel.create({
        data: {
          user_id: userId,
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
