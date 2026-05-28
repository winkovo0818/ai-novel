import { jsonError } from "@/lib/http/json";
import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { isRateLimited } from "@/lib/auth/rateLimit";
import { chatCompletion } from "@/lib/llm/client";
import { checkQuota, estimateLlmMessagesCostCny, quotaExceededResponse } from "@/lib/llm/usage";
import { buildSummarizePrompt } from "@/lib/llm/prompts/summarize";
import { getRequiredUserId } from "@/lib/auth/session";
import { buildSummaryDiffMetadata } from "@/lib/agent/summaryDiff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

type SummarizeMode = "save" | "preview" | "apply";

interface SummarizeRequestBody {
  mode?: SummarizeMode;
  summary?: string;
}

function parseRequestBody(value: unknown): SummarizeRequestBody {
  if (!value || typeof value !== "object") return {};
  const input = value as { mode?: unknown; summary?: unknown };
  const mode = input.mode === "preview" || input.mode === "apply" || input.mode === "save"
    ? input.mode
    : undefined;
  return {
    mode,
    summary: typeof input.summary === "string" ? input.summary : undefined,
  };
}

async function enqueueDerivedMemoryRefresh(novelId: string, chapterId: string) {
  await import("@/lib/jobs/handlers");
  const { enqueueJob, runPendingJobsForNovel } = await import("@/lib/jobs/queue");
  const { errorMessage, logError } = await import("@/lib/observability/logger");

  await enqueueJob({
    type: "refresh_summaries",
    payload: { novel_id: novelId },
    novelId,
  });
  void runPendingJobsForNovel(novelId).catch((err) => {
    logError("summarize.apply_memory_refresh_failed", {
      novel_id: novelId,
      chapter_id: chapterId,
      error: errorMessage(err),
    });
  });
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const requestBody = parseRequestBody(await request.json().catch(() => null));
  const mode = requestBody.mode ?? "save";

  const chapter = await prisma.chapterDraft.findUnique({
    where: { id },
    include: { novel: { select: { user_id: true } }, summary: true },
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

  if (!chapter.content.trim()) {
    return jsonError("EMPTY_CONTENT", "Chapter has no content to summarize", false, 400);
  }

  if (mode === "apply") {
    const summary = requestBody.summary?.trim();
    if (!summary) {
      return jsonError("INVALID_INPUT", "Summary is required before applying", false, 400);
    }

    try {
      const previousSummary = chapter.summary?.summary ?? "";
      const diff = buildSummaryDiffMetadata(previousSummary, summary);
      await prisma.$transaction([
        prisma.chapterSummary.upsert({
          where: { chapter_id: id },
          create: { chapter_id: id, summary },
          update: { summary },
        }),
      prisma.chapterDraft.update({
        where: { id },
        data: { summary_dirty: false },
      }),
      ]);
      await enqueueDerivedMemoryRefresh(chapter.novel_id, id);

      return Response.json({
        ok: true,
        data: {
          mode: "apply",
          summary,
          previousSummary,
          diff,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Summarization failed";
      return jsonError("INTERNAL", message, true, 500);
    }
  }

  try {
    if (await isRateLimited(userId, "/api/chapters/:id/summarize")) {
      return jsonError("RATE_LIMITED", "Too many requests, please try again later", false, 429);
    }

    const messages = buildSummarizePrompt(chapter.chapter_index, chapter.title, chapter.content);
    const quota = await checkQuota(userId, {
      estimatedCostCny: estimateLlmMessagesCostCny(messages, 2048),
    });
    if (!quota.allowed) {
      return quotaExceededResponse(quota);
    }

    const result = await chatCompletion({
      route: "/api/chapters/:id/summarize",
      agent: "summarizer",
      userId,
      novelId: chapter.novel_id,
      messages,
      temperature: 0,
      timeoutMs: 60_000,
    });

    const summary = result.content.trim();
    const previousSummary = chapter.summary?.summary ?? "";
    const diff = buildSummaryDiffMetadata(previousSummary, summary);

    if (mode === "preview") {
      return Response.json({
        ok: true,
        data: {
          mode: "preview",
          summary,
          previousSummary,
          diff,
        },
      });
    }

    await prisma.$transaction([
      prisma.chapterSummary.upsert({
        where: { chapter_id: id },
        create: { chapter_id: id, summary },
        update: { summary },
      }),
      prisma.chapterDraft.update({
        where: { id },
        data: { summary_dirty: false },
      }),
    ]);

    return Response.json({ ok: true, data: { mode: "save", summary, previousSummary, diff } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Summarization failed";
    return jsonError("INTERNAL", message, true, 500);
  }
}
