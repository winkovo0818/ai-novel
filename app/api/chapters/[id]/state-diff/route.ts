import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { chatCompletionWithRetry } from "@/lib/llm/client";
import { buildStateDiffPrompt } from "@/lib/llm/prompts/stateDiff";
import { BibleDraftSchema, StateDiffSchema } from "@/lib/validation/schemas";
import { getRequiredUserId } from "@/utils/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  const chapter = await prisma.chapterDraft.findUnique({
    where: { id },
    include: { novel: { include: { bible: true } } },
  });

  if (!chapter) {
    return jsonError("CHAPTER_NOT_FOUND", "Chapter not found", false, 404);
  }

  let userId: string;
  try {
    userId = await getRequiredUserId();
  } catch {
    return jsonError("UNAUTHORIZED", "Login required", false, 401);
  }

  if (!canAccessOwnerResource(chapter.novel.user_id, userId)) {
    return jsonError("CHAPTER_NOT_FOUND", "Chapter not found", false, 404);
  }

  if (!chapter.novel.bible) {
    return jsonError("BIBLE_NOT_FOUND", "Novel Bible not found", false, 404);
  }

  const bible = BibleDraftSchema.safeParse(chapter.novel.bible.content);
  if (!bible.success) {
    return jsonError("INVALID_BIBLE", "Novel Bible is invalid", false, 500);
  }

  if (!chapter.content.trim()) {
    return jsonError("EMPTY_CONTENT", "Chapter has no content to analyze", false, 400);
  }

  try {
    const result = await chatCompletionWithRetry(
      {
        route: "/api/chapters/:id/state-diff",
        messages: buildStateDiffPrompt({
          bible: bible.data,
          storyState: bible.data.story_state,
          chapterIndex: chapter.chapter_index,
          chapterTitle: chapter.title,
          chapterContent: chapter.content,
        }),
        temperature: 0,
        responseFormat: "json_object",
        timeoutMs: 20_000,
      },
      1,
    );

    let parsed: unknown;
    try {
      parsed = JSON.parse(result.content.trim());
    } catch {
      // Some providers may wrap the JSON in markdown fences; strip them.
      const cleaned = result.content
        .replace(/```json\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      parsed = JSON.parse(cleaned);
    }

    const diff = StateDiffSchema.safeParse(parsed);
    if (!diff.success) {
      return jsonError("INVALID_DIFF", "LLM returned an invalid state diff", true, 500);
    }

    return Response.json({ ok: true, data: diff.data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "State diff generation failed";
    return jsonError("INTERNAL", message, true, 500);
  }
}

function jsonError(code: string, message: string, retryable: boolean, status: number) {
  return Response.json({ ok: false, error: { code, message, retryable } }, { status });
}
