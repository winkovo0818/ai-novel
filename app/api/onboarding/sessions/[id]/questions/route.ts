import { prisma } from "@/lib/db";
import { authorizeOnboardingSession } from "@/lib/auth/onboardingAccess";
import { isRateLimited } from "@/lib/auth/rateLimit";
import { chatCompletionWithRetry } from "@/lib/llm/client";
import { buildQuestionsPrompt } from "@/lib/llm/prompts/questions";
import {
  buildDefaultProfile,
  QuestionsRequestSchema,
  QuestionsResponseSchema,
} from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "/api/onboarding/sessions/:id/questions";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = QuestionsRequestSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError("INVALID_INPUT", "Invalid questions request", false, 400);
  }

  const access = await authorizeOnboardingSession(id);
  if (!access.ok) {
    return jsonError(access.code, access.message, false, access.status);
  }
  const { userId, session } = access;

  if (isRateLimited(userId, ROUTE)) {
    return jsonError("RATE_LIMITED", "Too many requests, please try again later", false, 429);
  }

  const profile = buildDefaultProfile(
    session.genre_main as Parameters<typeof buildDefaultProfile>[0],
    session.genre_sub,
  );

  try {
    const result = await chatCompletionWithRetry({
      route: ROUTE,
      agent: "outline",
      userId,
      messages: buildQuestionsPrompt({ logline: parsed.data.logline, profile }),
      responseFormat: "json_object",
      temperature: 0.7,
      timeoutMs: 15_000,
    });

    const data = QuestionsResponseSchema.parse(parseJson(result.content));

    await prisma.onboardingSession.update({
      where: { id },
      data: {
        logline: parsed.data.logline,
        questions: data.questions,
      },
    });

    return Response.json({ ok: true, data });
  } catch (err) {
    return llmErrorResponse(err);
  }
}

function parseJson(value: string): unknown {
  const trimmed = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(trimmed);
}

function jsonError(code: string, message: string, retryable: boolean, status: number) {
  return Response.json({ ok: false, error: { code, message, retryable } }, { status });
}

function llmErrorResponse(err: unknown) {
  const message = err instanceof Error ? err.message : "unknown error";
  const isTimeout = /timed out/i.test(message);
  const isParse = err instanceof SyntaxError || /invalid|parse/i.test(message);
  const code = isTimeout ? "LLM_TIMEOUT" : isParse ? "LLM_PARSE_FAILED" : "INTERNAL";
  return jsonError(code, message, true, isTimeout ? 504 : isParse ? 502 : 500);
}
