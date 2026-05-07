import { prisma } from "@/lib/db";
import { streamChatCompletionWithRetry } from "@/lib/llm/client";
import { buildChapterPrompt } from "@/lib/llm/prompts/chapter";
import { sseEncode, sseHeartbeat } from "@/lib/stream/sseEncode";
import {
  BibleDraftSchema,
  GenerateChapterDraftRequestSchema,
  NovelProfileSchema,
} from "@/lib/validation/schemas";

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
      chapters: { orderBy: { chapter_index: "asc" } },
    },
  });
  if (!novel || !novel.bible) {
    return jsonError("NOVEL_NOT_FOUND", "Novel or Bible draft not found", false, 404);
  }

  const bible = BibleDraftSchema.safeParse(novel.bible.content);
  const profile = NovelProfileSchema.safeParse(novel.profile);
  if (!bible.success || !profile.success) {
    return jsonError("INVALID_INPUT", "Novel Bible or profile is invalid", false, 400);
  }

  const input = parsed.data;
  if (!bible.data.outline.volume_1.chapters.some((chapter) => chapter.index === input.chapter_index)) {
    return jsonError("INVALID_INPUT", "Chapter index is not in the Bible outline", false, 400);
  }

  const previousContext = novel.chapters
    .filter((chapter) => chapter.chapter_index < input.chapter_index && chapter.content.trim())
    .map((chapter) => formatPreviousChapter(chapter.chapter_index, chapter.title, chapter.content))
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
