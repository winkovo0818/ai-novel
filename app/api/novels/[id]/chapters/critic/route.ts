import { jsonError } from "@/lib/http/json";
import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { isRateLimited } from "@/lib/auth/rateLimit";
import { checkQuota } from "@/lib/llm/usage";
import { chatCompletionWithRetry } from "@/lib/llm/client";
import { buildCriticPrompt } from "@/lib/llm/prompts/critic";
import { buildChapterContext } from "@/lib/agent/chapterContext";
import { BibleDraftSchema, NovelProfileSchema } from "@/lib/validation/schemas";
import { getRequiredUserId } from "@/utils/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);

  if (!body || typeof body.chapter_index !== "number" || typeof body.content !== "string") {
    return jsonError("INVALID_INPUT", "Invalid critic request: need chapter_index and content", false, 400);
  }

  const novel = await prisma.novel.findUnique({
    where: { id },
    include: {
      bible: true,
      chapters: { orderBy: { chapter_index: "asc" }, include: { summary: true } },
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

  if (await isRateLimited(userId, "/api/novels/:id/chapters/critic")) {
    return jsonError("RATE_LIMITED", "Too many requests, please try again later", false, 429);
  }

  const quota = await checkQuota(userId);
  if (!quota.allowed) {
    return jsonError("QUOTA_EXCEEDED", quota.reason ?? "Usage quota exceeded", false, 429);
  }

  const bible = BibleDraftSchema.safeParse(novel.bible.content);
  const profile = NovelProfileSchema.safeParse(novel.profile);
  if (!bible.success || !profile.success) {
    return jsonError("INVALID_INPUT", "Novel Bible or profile is invalid", false, 400);
  }

  if (!body.content.trim()) {
    return jsonError("EMPTY_CONTENT", "No content to criticize", false, 400);
  }

  const chapterContext = buildChapterContext(bible.data, novel.chapters, body.chapter_index);

  try {
    const result = await chatCompletionWithRetry(
      {
        route: "/api/novels/:id/chapters/critic",
        agent: "critic",
        userId,
        novelId: id,
        messages: buildCriticPrompt({
          context: chapterContext,
          chapterContent: body.content,
          chapterIndex: body.chapter_index,
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
      const cleaned = result.content
        .replace(/```json\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      parsed = JSON.parse(cleaned);
    }

    // Normalize the response
    const data = parsed as Record<string, unknown>;
    const issues = Array.isArray(data.issues) ? data.issues : [];
    const consistent = data.consistent === true || issues.length === 0;

    return Response.json({
      ok: true,
      data: {
        consistent,
        issues: issues.map((issue: Record<string, unknown>) => ({
          type: String(issue.type ?? "tone"),
          severity: String(issue.severity ?? "minor"),
          description: String(issue.description ?? ""),
          suggestion: issue.suggestion ? String(issue.suggestion) : undefined,
        })),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Critic check failed";
    return jsonError("INTERNAL", message, true, 500);
  }
}