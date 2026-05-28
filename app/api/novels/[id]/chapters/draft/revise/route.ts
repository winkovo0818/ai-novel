import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { isRateLimited } from "@/lib/auth/rateLimit";
import { getRequiredUserId } from "@/lib/auth/session";
import { jsonError, jsonOk } from "@/lib/http/json";
import { checkQuota, estimateLlmMessagesCostCny, quotaExceededResponse } from "@/lib/llm/usage";
import { chatCompletionWithRetry } from "@/lib/llm/client";
import { buildChapterContext } from "@/lib/agent/chapterContext";
import {
  buildChapterRevisionPrompt,
  buildLocalChapterRevisionPrompt,
} from "@/lib/llm/prompts/chapterRevision";
import {
  BibleDraftSchema,
  NovelProfileSchema,
  ReviseDraftRequestSchema,
  type ReviseDraftRequest,
} from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "/api/novels/:id/chapters/draft/revise";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function stripCodeFence(value: string): string {
  return value.trim().replace(/^```(?:markdown|text)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function isCriticRevisionInput(
  input: ReviseDraftRequest,
): input is Extract<ReviseDraftRequest, { content: string }> {
  return "content" in input && "issues" in input;
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = ReviseDraftRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("INVALID_INPUT", "Invalid draft revision request", false, 400);
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
  if (await isRateLimited(userId, ROUTE)) {
    return jsonError("RATE_LIMITED", "Too many requests, please try again later", false, 429);
  }

  const bible = BibleDraftSchema.safeParse(novel.bible.content);
  const profile = NovelProfileSchema.safeParse(novel.profile);
  if (!bible.success || !profile.success) {
    return jsonError("INVALID_INPUT", "Novel Bible or profile is invalid", false, 400);
  }

  const input = parsed.data;
  const chapterContext = buildChapterContext(bible.data, novel.chapters, input.chapter_index);
  const messages = isCriticRevisionInput(input)
    ? buildChapterRevisionPrompt({
        context: chapterContext,
        chapterContent: input.content,
        issues: input.issues,
      })
    : buildLocalChapterRevisionPrompt({
        context: chapterContext,
        operation: input.operation,
        selectedText: input.selected_text,
        beforeContext: input.before_context,
        afterContext: input.after_context,
        title: input.title,
      });

  const quota = await checkQuota(userId, {
    estimatedCostCny: estimateLlmMessagesCostCny(messages, 8192),
  });
  if (!quota.allowed) {
    return quotaExceededResponse(quota);
  }

  try {
    const result = await chatCompletionWithRetry({
      route: ROUTE,
      agent: "writer",
      userId,
      novelId: id,
      messages,
      temperature: 0.55,
      // Same anti-AI-signature sampling as the writer route, slightly tamer
      // because revision is constrained by critic feedback and we don't want
      // the model to wander off-task.
      topP: 0.95,
      frequencyPenalty: 0.4,
      presencePenalty: 0.25,
      timeoutMs: 120_000,
    }, 0);

    const content = stripCodeFence(result.content);
    if (!content) {
      return jsonError("EMPTY_REVISION", "Model returned an empty revision", true, 502);
    }
    return jsonOk({
      content,
      token_in: result.tokenIn,
      token_out: result.tokenOut,
      cost_cny: Number(result.costCny.toFixed(6)),
      took_ms: result.tookMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Draft revision failed";
    const isTimeout = /timed out/i.test(message);
    return jsonError(isTimeout ? "LLM_TIMEOUT" : "INTERNAL", message, true, isTimeout ? 504 : 500);
  }
}
