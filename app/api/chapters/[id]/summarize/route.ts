import { jsonError } from "@/lib/http/json";
import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { isRateLimited } from "@/lib/auth/rateLimit";
import { chatCompletion } from "@/lib/llm/client";
import { checkQuota } from "@/lib/llm/usage";
import { buildSummarizePrompt } from "@/lib/llm/prompts/summarize";
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
    include: { novel: { select: { user_id: true } } },
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

  if (isRateLimited(userId, "/api/chapters/:id/summarize")) {
    return jsonError("RATE_LIMITED", "Too many requests, please try again later", false, 429);
  }

  const quota = await checkQuota(userId);
  if (!quota.allowed) {
    return jsonError(quota.code ?? "QUOTA_EXCEEDED", quota.reason ?? "Usage quota exceeded", false, 429);
  }

  if (!chapter.content.trim()) {
    return jsonError("EMPTY_CONTENT", "Chapter has no content to summarize", false, 400);
  }

  try {
    const result = await chatCompletion({
      route: "/api/chapters/:id/summarize",
      agent: "summarizer",
      userId,
      novelId: chapter.novel_id,
      messages: buildSummarizePrompt(chapter.chapter_index, chapter.title, chapter.content),
      temperature: 0,
      timeoutMs: 15_000,
    });

    const summary = result.content.trim();

    await prisma.chapterSummary.upsert({
      where: { chapter_id: id },
      create: { chapter_id: id, summary },
      update: { summary },
    });

    return Response.json({ ok: true, data: { summary } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Summarization failed";
    return jsonError("INTERNAL", message, true, 500);
  }
}