import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { streamChatCompletionWithRetry } from "@/lib/llm/client";
import { buildChapterPrompt } from "@/lib/llm/prompts/chapter";
import { sseEncode, sseHeartbeat } from "@/lib/stream/sseEncode";
import {
  BibleDraftSchema,
  GenerateChapterDraftRequestSchema,
  NovelProfileSchema,
} from "@/lib/validation/schemas";
import { getRequiredUserId } from "@/utils/supabase/auth";
import { isRateLimited } from "@/lib/auth/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "/api/novels/:id/chapters/draft";
const encoder = new TextEncoder();

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = GenerateChapterDraftRequestSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError("INVALID_INPUT", "Invalid chapter draft generation request", false, 400);
  }

  const novel = await prisma.novel.findUnique({
    where: { id },
    include: {
      bible: true,
      chapters: { orderBy: { chapter_index: "asc" }, include: { summary: true } },
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
  if (!canAccessOwnerResource(novel.user_id, userId)) {
    return jsonError("NOVEL_NOT_FOUND", "Novel not found", false, 404);
  }

  const bible = BibleDraftSchema.safeParse(novel.bible.content);
  const profile = NovelProfileSchema.safeParse(novel.profile);
  if (!bible.success || !profile.success) {
    return jsonError("INVALID_INPUT", "Novel Bible or profile is invalid", false, 400);
  }

  const input = parsed.data;

  const previousContext = novel.chapters
    .filter((chapter) => chapter.chapter_index < input.chapter_index && chapter.content.trim())
    .map((chapter) => {
      if (chapter.summary) {
        return `第 ${chapter.chapter_index} 章《${chapter.title}》：${chapter.summary.summary}`;
      }
      return formatPreviousChapter(chapter.chapter_index, chapter.title, chapter.content);
    })
    .join("\n\n");
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let content = "";

      function send(text: string) {
        controller.enqueue(encoder.encode(text));
      }

      try {
        heartbeat = setInterval(() => send(sseHeartbeat()), 15_000);
        const result = await streamChatCompletionWithRetry(
          {
            route: ROUTE,
            messages: buildChapterPrompt({
              bible: bible.data,
              profile: profile.data,
              chapterIndex: input.chapter_index,
              title: input.title,
              existingContent: input.existing_content,
              previousContext,
            }),
            temperature: 0.75,
            timeoutMs: 60_000,
          },
          {
            onDelta(delta) {
              content += delta;
              send(sseEncode("chapter_delta", { delta }));
            },
          },
        );

        send(
          sseEncode("done", {
            token_in: result.tokenIn,
            token_out: result.tokenOut,
            cost_cny: Number(result.costCny.toFixed(6)),
            took_ms: result.tookMs,
            chars: content.length,
          }),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown error";
        const code = /timed out/i.test(message) ? "LLM_TIMEOUT" : "INTERNAL";
        send(sseEncode("error", { code, message, retryable: true }));
      } finally {
        if (heartbeat) clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function formatPreviousChapter(index: number, title: string, content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  const excerpt = normalized.length > 900 ? `${normalized.slice(0, 900)}...` : normalized;
  return `第 ${index} 章《${title}》：${excerpt}`;
}

function jsonError(code: string, message: string, retryable: boolean, status: number) {
  return Response.json({ ok: false, error: { code, message, retryable } }, { status });
}
