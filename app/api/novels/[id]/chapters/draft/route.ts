import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { isRateLimited } from "@/lib/auth/rateLimit";
import { moderateContent, stringifyForModeration } from "@/lib/moderation/moderate";
import { streamChatCompletionWithRetry } from "@/lib/llm/client";
import { buildChapterPrompt } from "@/lib/llm/prompts/chapter";
import { buildChapterContext } from "@/lib/agent/chapterContext";
import { retrieveMemories } from "@/lib/agent/retrieval";
import { sseEncode, sseHeartbeat } from "@/lib/stream/sseEncode";
import {
  BibleDraftSchema,
  GenerateChapterDraftRequestSchema,
  NovelProfileSchema,
  getVolumes,
} from "@/lib/validation/schemas";
import { getRequiredUserId } from "@/utils/supabase/auth";

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
  if (!canAccessOwnerResource(novel.user_id, userId)) {
    return jsonError("NOVEL_NOT_FOUND", "Novel not found", false, 404);
  }

  const bible = BibleDraftSchema.safeParse(novel.bible.content);
  const profile = NovelProfileSchema.safeParse(novel.profile);
  if (!bible.success || !profile.success) {
    return jsonError("INVALID_INPUT", "Novel Bible or profile is invalid", false, 400);
  }

  const input = parsed.data;

  // Content moderation: reject drafts with inappropriate input prompts.
  const inputModeration = await moderateContent({
    route: ROUTE,
    text: stringifyForModeration({ title: input.title, existing_content: input.existing_content }),
  });
  if (!inputModeration.allowed) {
    return jsonError(
      inputModeration.code ?? "MODERATION_BLOCKED",
      inputModeration.reason ?? "Content blocked by moderation",
      false,
      400,
    );
  }

  // Determine which volume the current chapter belongs to
  const volumes = getVolumes(bible.data);
  let currentVolumeIndex = 0;
  let chaptersSeen = 0;
  for (let i = 0; i < volumes.length; i++) {
    chaptersSeen += volumes[i].chapters.length;
    if (input.chapter_index <= chaptersSeen) {
      currentVolumeIndex = i;
      break;
    }
  }

  const volumeSummary = novel.volume_summaries.find(
    (vs) => vs.volume_index === currentVolumeIndex,
  )?.summary;

  // Retrieve relevant memories (RAG v2)
  let retrievedMemories: Array<{ source: string; text: string; reason: string }> = [];
  try {
    retrievedMemories = await retrieveMemories(id, bible.data, input.chapter_index, 5);
  } catch {
    // Fail-open: if retrieval fails, proceed without memories
  }

  const chapterContext = buildChapterContext(bible.data, novel.chapters, input.chapter_index, {
    novelSummary: novel.novel_summary?.summary,
    volumeSummary,
    retrievedMemories,
  });

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
              context: chapterContext,
              profile: profile.data,
              existingContent: input.existing_content,
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

        // Best-effort output moderation: if the full generated text is blocked,
        // emit an error instead of "done". The client may have already seen
        // deltas; this prevents persisting harmful content server-side.
        const outputModeration = await moderateContent({
          route: ROUTE,
          text: content,
        });
        if (!outputModeration.allowed) {
          send(
            sseEncode("error", {
              code: outputModeration.code ?? "MODERATION_BLOCKED",
              message: outputModeration.reason ?? "Generated content blocked by moderation",
              retryable: false,
            }),
          );
          return;
        }

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

function jsonError(code: string, message: string, retryable: boolean, status: number) {
  return Response.json({ ok: false, error: { code, message, retryable } }, { status });
}
