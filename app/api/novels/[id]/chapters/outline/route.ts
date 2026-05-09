import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { isRateLimited } from "@/lib/auth/rateLimit";
import { checkQuota } from "@/lib/llm/usage";
import { chatCompletionWithRetry } from "@/lib/llm/client";
import { buildBeatSheetPrompt } from "@/lib/llm/prompts/beatSheet";
import { buildChapterContext } from "@/lib/agent/chapterContext";
import {
  BibleDraftSchema,
  BeatSheetResponseSchema,
  GenerateBeatSheetRequestSchema,
} from "@/lib/validation/schemas";
import { getRequiredUserId } from "@/utils/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "/api/novels/:id/chapters/outline";
interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = GenerateBeatSheetRequestSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError("INVALID_INPUT", "Invalid beat sheet request", false, 400);
  }

  const novel = await prisma.novel.findUnique({
    where: { id },
    include: {
      bible: true,
      chapters: { orderBy: { chapter_index: "asc" }, include: { summary: true } },
      volume_summaries: { orderBy: { volume_index: "asc" } },
      novel_summary: true,
    },
  });

  if (!novel || !novel.bible) {
    return jsonError("NOVEL_NOT_FOUND", "Novel or Bible draft not found", false, 404);
  }

  let userId: string;
  try {
    userId = await getRequiredUserId();
  } catch {
    return jsonError("UNAUTHORIZED", "Login required", false, 401);
  }

  if (isRateLimited(userId, ROUTE)) {
    return jsonError("RATE_LIMITED", "Too many requests, please try again later", false, 429);
  }

  const quota = await checkQuota(userId);
  if (!quota.allowed) {
    return jsonError("QUOTA_EXCEEDED", quota.reason ?? "Usage quota exceeded", false, 429);
  }

  if (!canAccessOwnerResource(novel.user_id, userId)) {
    return jsonError("NOVEL_NOT_FOUND", "Novel not found", false, 404);
  }

  const bible = BibleDraftSchema.safeParse(novel.bible.content);
  if (!bible.success) {
    return jsonError("INVALID_INPUT", "Novel Bible is invalid", false, 400);
  }

  const input = parsed.data;

  const chapterContext = buildChapterContext(bible.data, novel.chapters, input.chapter_index);

  const previousSummary = chapterContext.previousSummaries.length > 0
    ? chapterContext.previousSummaries[chapterContext.previousSummaries.length - 1].summary
    : undefined;

  try {
    const result = await chatCompletionWithRetry(
      {
        route: ROUTE,
        agent: "outline",
        userId,
        novelId: id,
        messages: buildBeatSheetPrompt({
          bible: bible.data,
          chapterIndex: input.chapter_index,
          chapterTitle: input.chapter_title,
          chapterSummary: chapterContext.outline.summary,
          previousChapterSummary: previousSummary,
          storyState: bible.data.story_state,
          chapterGoal: input.chapter_goal,
        }),
        temperature: 0.7,
        responseFormat: "json_object",
        timeoutMs: 20_000,
      },
      1,
    );

    let parsed: unknown;
    try {
      parsed = JSON.parse(result.content.trim());
    } catch {
      const cleaned = result.content
        .replace(/```json\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      parsed = JSON.parse(cleaned);
    }

    const beatSheet = BeatSheetResponseSchema.safeParse(parsed);
    if (!beatSheet.success) {
      return jsonError("INVALID_BEAT_SHEET", "LLM returned an invalid beat sheet", true, 500);
    }

    return Response.json({ ok: true, data: beatSheet.data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Beat sheet generation failed";
    return jsonError("INTERNAL", message, true, 500);
  }
}

function jsonError(code: string, message: string, retryable: boolean, status: number) {
  return Response.json({ ok: false, error: { code, message, retryable } }, { status });
}