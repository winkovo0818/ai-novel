import { jsonError } from "@/lib/http/json";
import { prisma } from "@/lib/db";
import { canAccessOwnerResource } from "@/lib/auth/ownership";
import { isRateLimited } from "@/lib/auth/rateLimit";
import { checkQuota } from "@/lib/llm/usage";
import { moderateContent, stringifyForModeration } from "@/lib/moderation/moderate";
import { StreamModerationGuard } from "@/lib/moderation/streamGuard";
import { ModerationBlockError } from "@/lib/moderation/errors";
import { StreamSegmenter } from "@/lib/agent/streamSegmenter";
import { streamChatCompletionWithRetry } from "@/lib/llm/client";
import { buildChapterPrompt } from "@/lib/llm/prompts/chapter";
import { buildChapterContext } from "@/lib/agent/chapterContext";
import { retrieveMemories, type RetrievalStatus } from "@/lib/agent/retrieval";
import {
  completeDraftSession,
  createDraftBufferFlusher,
  createDraftSession,
  failDraftSession,
} from "@/lib/agent/draftSession";
import { sseEncode, sseHeartbeat } from "@/lib/stream/sseEncode";
import { getGenerationPolicy } from "@/lib/llm/generationPolicy";
import { logWarn } from "@/lib/observability/logger";
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
  if (await isRateLimited(userId, ROUTE)) {
    return jsonError("RATE_LIMITED", "Too many requests, please try again later", false, 429);
  }
  if (!canAccessOwnerResource(novel.user_id, userId)) {
    return jsonError("NOVEL_NOT_FOUND", "Novel not found", false, 404);
  }

  const input = parsed.data;

  // P0-10: input moderation runs BEFORE the quota check. Two reasons:
  //   1. If the prompt is disallowed, the answer is "no" regardless of
  //      remaining budget — telling a user "you're over quota" when their
  //      input is actually unsafe sends the wrong message and might
  //      encourage them to top up and retry the same banned prompt.
  //   2. The moderation call itself is logged without a userId, so it
  //      doesn't count against the caller's daily/monthly cap; running it
  //      first costs the project a few moderation tokens but never burns
  //      the user's allowance.
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

  // Quota check: prevent cost overruns
  const quota = await checkQuota(userId);
  if (!quota.allowed) {
    return jsonError("QUOTA_EXCEEDED", quota.reason ?? "Usage quota exceeded", false, 429);
  }

  const bible = BibleDraftSchema.safeParse(novel.bible.content);
  const profile = NovelProfileSchema.safeParse(novel.profile);
  if (!bible.success || !profile.success) {
    return jsonError("INVALID_INPUT", "Novel Bible or profile is invalid", false, 400);
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

  // Retrieve relevant memories (RAG v2) — propagate status to prompt
  let retrievedMemories: Array<{ source: string; text: string; reason: string }> = [];
  let retrievalStatus: RetrievalStatus = "empty";
  const retrievalResult = await retrieveMemories(id, bible.data, input.chapter_index, 5);
  retrievedMemories = retrievalResult.memories;
  retrievalStatus = retrievalResult.status;

  // M3.4 retrieval visibility: short, UI-friendly view of what RAG fed in.
  // Truncate body so SSE payload stays small even with 5 chunks of summaries.
  const RETRIEVAL_PREVIEW_CHARS = 200;
  const retrievalPreview = {
    status: retrievalStatus,
    error: retrievalResult.errorMessage,
    memories: retrievalResult.memories.map((m) => ({
      source: m.source,
      reason: m.reason,
      score: m.score,
      text: m.text.length > RETRIEVAL_PREVIEW_CHARS
        ? `${m.text.slice(0, RETRIEVAL_PREVIEW_CHARS)}…`
        : m.text,
    })),
  };

  const chapterContext = buildChapterContext(bible.data, novel.chapters, input.chapter_index, {
    novelSummary: novel.novel_summary?.summary,
    volumeSummary,
    retrievedMemories,
    retrievalStatus,
    beatSheet: input.beat_sheet,
  });

  const policy = getGenerationPolicy(profile.data);

  // UX3: persist this draft attempt so the client can resume if the SSE
  // connection drops. Created before the stream opens so the row's id can
  // be handed to the client in its very first event.
  const sessionId = await createDraftSession({
    userId,
    novelId: id,
    chapterIndex: input.chapter_index,
  });
  const flusher = createDraftBufferFlusher(sessionId);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let content = "";

      // P0-8: segment-level pipeline. Every delta is appended to a
      // segmenter; only complete segments (sentence-ending punctuation
      // or 200-char hard cap) are scanned by the keyword guard and
      // forwarded to the client. A guard hit on a segment throws
      // ModerationBlockError synchronously inside onDelta, which
      // bubbles up to the outer catch — and we also fire abortController
      // so the DeepSeek HTTP connection actually closes instead of
      // continuing to bill us for tokens we'll never use.
      const segmenter = new StreamSegmenter();
      const guard = new StreamModerationGuard();
      const abortController = new AbortController();

      function send(text: string) {
        controller.enqueue(encoder.encode(text));
      }

      function emitSegment(segment: string): void {
        const verdict = guard.check(segment);
        if (!verdict.allowed) {
          // Don't send the offending segment to the client. Trigger an
          // abort so the LLM stream stops yielding, then throw so the
          // outer catch handles the failure path uniformly.
          abortController.abort();
          throw new ModerationBlockError(
            verdict.reason ?? "内容包含违规关键词",
            verdict.code ?? "MODERATION_BLOCKED_INLINE",
          );
        }
        send(sseEncode("chapter_delta", { delta: segment }));
        flusher.schedule(content);
      }

      try {
        // Hand the resume id over before any other event so the client
        // can store it even if the next tick disconnects.
        send(sseEncode("session", { sessionId }));
        // M3.4: surface what RAG retrieved before the LLM stream starts so the
        // candidate panel can render the cited chunks while the model is still
        // generating. Falls between request and first delta.
        send(sseEncode("retrieval", retrievalPreview));
        heartbeat = setInterval(() => send(sseHeartbeat()), 15_000);
        const result = await streamChatCompletionWithRetry(
          {
            route: ROUTE,
            agent: "writer",
            userId,
            novelId: id,
            messages: buildChapterPrompt({
              context: chapterContext,
              profile: profile.data,
              existingContent: input.existing_content,
              generationPolicy: policy,
            }),
            temperature: policy.temperature,
            timeoutMs: 60_000,
            signal: abortController.signal,
          },
          {
            onDelta(delta) {
              content += delta;
              // P0-8: do NOT forward `delta` directly to the client.
              // Feed the segmenter; only completed segments are scanned
              // and forwarded. The throw inside emitSegment propagates
              // up through streamChatCompletion → the outer try/catch.
              const segments = segmenter.feed(delta);
              for (const seg of segments) {
                emitSegment(seg);
              }
            },
          },
        );

        // Stream finished cleanly — drain whatever the segmenter has
        // left so the final unfinished sentence still gets scanned and
        // forwarded.
        const tail = segmenter.flushTail();
        if (tail) {
          emitSegment(tail);
        }

        // Best-effort full-text LLM moderation: keyword guard only
        // catches the patterns we know about; the LLM pass catches
        // semantic violations that slipped through. Kept in place
        // intentionally (plan D-09) — local-keyword pre-screen does
        // not replace the broader audit.
        const outputModeration = await moderateContent({
          route: ROUTE,
          text: content,
        });
        if (!outputModeration.allowed) {
          await flusher.flush();
          await failDraftSession(sessionId, {
            buffer: content,
            code: outputModeration.code ?? "MODERATION_BLOCKED",
            message: outputModeration.reason ?? "Generated content blocked by moderation",
          });
          send(
            sseEncode("error", {
              code: outputModeration.code ?? "MODERATION_BLOCKED",
              message: outputModeration.reason ?? "Generated content blocked by moderation",
              retryable: false,
            }),
          );
          return;
        }

        await flusher.flush();
        await completeDraftSession(sessionId, {
          buffer: content,
          retrieval: retrievalPreview,
        });

        send(
          sseEncode("done", {
            token_in: result.tokenIn,
            token_out: result.tokenOut,
            cost_cny: Number(result.costCny.toFixed(6)),
            took_ms: result.tookMs,
            chars: content.length,
            retrieval_status: retrievalStatus,
            sessionId,
          }),
        );
      } catch (err) {
        // P0-8: inline moderation block takes precedence over the
        // generic timeout/internal branches — the user-visible message
        // and the persisted error_code should reflect why we stopped,
        // not the AbortError that the LLM client may surface as a
        // side-effect of our own abortController.abort() call.
        if (err instanceof ModerationBlockError) {
          // P0-8 observability: emit a structured one-liner that
          // log-aggregation tooling (Vercel/CloudWatch/Logflare) can
          // count over time. We deliberately don't go through
          // lib/metrics/prometheus.ts — that file is scrape-time DB
          // aggregation by design (Serverless cold starts reset
          // in-memory counters), and a per-event counter doesn't fit.
          logWarn("moderation.inline_block", {
            route: ROUTE,
            novel_id: id,
            user_id: userId,
            code: err.code,
            chars: content.length,
          });
          await flusher.flush();
          await failDraftSession(sessionId, {
            buffer: content,
            code: err.code,
            message: err.reason,
          });
          send(
            sseEncode("error", {
              code: err.code,
              message: err.reason,
              retryable: false,
              sessionId,
            }),
          );
          return;
        }
        const message = err instanceof Error ? err.message : "unknown error";
        const code = /timed out/i.test(message) ? "LLM_TIMEOUT" : "INTERNAL";
        await flusher.flush();
        await failDraftSession(sessionId, { buffer: content, code, message });
        send(sseEncode("error", { code, message, retryable: true, sessionId }));
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
