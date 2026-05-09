import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { isRateLimited } from "@/lib/auth/rateLimit";
import { chatCompletion } from "@/lib/llm/client";
import { buildConsistencyPrompt } from "@/lib/llm/prompts/consistency";
import { BibleDraftSchema, NovelProfileSchema } from "@/lib/validation/schemas";
import { getRequiredUserId } from "@/utils/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  const novel = await prisma.novel.findUnique({
    where: { id },
    include: {
      bible: true,
      chapters: { orderBy: { chapter_index: "asc" } },
    },
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

  if (isRateLimited(userId, "/api/novels/:id/consistency")) {
    return jsonError("RATE_LIMITED", "Too many requests, please try again later", false, 429);
  }

  const bible = BibleDraftSchema.safeParse(novel.bible.content);
  const profile = NovelProfileSchema.safeParse(novel.profile);
  if (!bible.success || !profile.success) {
    return jsonError("INVALID_INPUT", "Novel Bible or profile is invalid", false, 400);
  }

  const chaptersWithContent = novel.chapters.filter((c) => c.content.trim());
  if (chaptersWithContent.length < 2) {
    return jsonError("INSUFFICIENT_CHAPTERS", "Need at least 2 chapters with content to check consistency", false, 400);
  }

  try {
    const result = await chatCompletion({
      route: "/api/novels/:id/consistency",
      agent: "critic",
      userId,
      novelId: id,
      messages: buildConsistencyPrompt({
        bible: bible.data,
        profile: profile.data,
        chapters: chaptersWithContent.map((c) => ({
          index: c.chapter_index,
          title: c.title,
          content: c.content,
        })),
      }),
      temperature: 0,
      responseFormat: "json_object",
      timeoutMs: 30_000,
    });

    const parsed = JSON.parse(result.content);
    return Response.json({ ok: true, data: parsed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Consistency check failed";
    return jsonError("INTERNAL", message, true, 500);
  }
}

function jsonError(code: string, message: string, retryable: boolean, status: number) {
  return Response.json({ ok: false, error: { code, message, retryable } }, { status });
}
