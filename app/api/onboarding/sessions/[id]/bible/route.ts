import { buildBiblePrompt } from "@/lib/llm/prompts/bible";
import { streamChatCompletion } from "@/lib/llm/client";
import { prisma } from "@/lib/db";
import { sseEncode, sseHeartbeat } from "@/lib/stream/sseEncode";
import {
  collectBibleEvents,
  createBibleEventCursor,
  tryParseBibleDraft,
} from "@/lib/stream/jsonStreamParser";
import { BibleStreamRequestSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "/api/onboarding/sessions/:id/bible";
const encoder = new TextEncoder();

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = BibleStreamRequestSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: "Invalid bible stream request",
          retryable: false,
        },
      },
      { status: 400 },
    );
  }

  const session = await prisma.onboardingSession.findUnique({ where: { id } });
  if (!session) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "SESSION_NOT_FOUND",
          message: "Onboarding session not found",
          retryable: false,
        },
      },
      { status: 404 },
    );
  }

  if (session.regeneration_count >= 3) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "REGEN_LIMIT_EXCEEDED",
          message: "Bible regeneration limit exceeded",
          retryable: false,
        },
      },
      { status: 429 },
    );
  }

  const input = parsed.data;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let heartbeat: ReturnType<typeof setInterval> | undefined;

      function send(text: string) {
        controller.enqueue(encoder.encode(text));
      }

      try {
        heartbeat = setInterval(() => send(sseHeartbeat()), 15_000);

        await prisma.onboardingSession.update({
          where: { id },
          data: {
            logline: input.logline,
            answers: input.answers,
            regeneration_count: { increment: 1 },
          },
        });

        const cursor = createBibleEventCursor();
        let buffer = "";
        let emitted = false;

        const result = await streamChatCompletion(
          {
            route: ROUTE,
            messages: buildBiblePrompt(input),
            temperature: 0.7,
            timeoutMs: 60_000,
          },
          {
            onDelta(delta) {
              buffer += delta;
              const draft = tryParseBibleDraft(buffer);
              if (!draft) return;

              for (const event of collectBibleEvents(draft, cursor)) {
                send(sseEncode(event.event, event.data));
                emitted = true;
              }
            },
          },
        );

        const draft = tryParseBibleDraft(result.content);
        if (!draft) {
          send(
            sseEncode("error", {
              code: "LLM_PARSE_FAILED",
              message: "LLM output could not be parsed as Bible JSON",
              retryable: true,
            }),
          );
          return;
        }

        for (const event of collectBibleEvents(draft, cursor)) {
          send(sseEncode(event.event, event.data));
          emitted = true;
        }

        await prisma.onboardingSession.update({
          where: { id },
          data: { bible_draft: draft },
        });

        send(
          sseEncode("done", {
            token_in: result.tokenIn,
            token_out: result.tokenOut,
            cost_cny: Number(result.costCny.toFixed(6)),
            took_ms: result.tookMs,
            emitted,
          }),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown error";
        const code = /timed out/i.test(message) ? "LLM_TIMEOUT" : "INTERNAL";
        send(
          sseEncode("error", {
            code,
            message,
            retryable: true,
          }),
        );
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
