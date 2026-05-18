import { buildBiblePrompt } from "@/lib/llm/prompts/bible";
import { streamChatCompletionWithRetry } from "@/lib/llm/client";
import { prisma } from "@/lib/db";
import { authorizeOnboardingSession } from "@/lib/auth/onboardingAccess";
import { isRateLimited } from "@/lib/auth/rateLimit";
import { checkQuota } from "@/lib/llm/usage";
import { moderateContent, stringifyForModeration } from "@/lib/moderation/moderate";
import { sseEncode, sseHeartbeat } from "@/lib/stream/sseEncode";
import {
  collectBibleEvents,
  createBibleEventCursor,
  tryParseBibleDraft,
  tryParsePartialBibleDraft,
} from "@/lib/stream/jsonStreamParser";
import { BibleStreamRequestSchema, type BibleDraft } from "@/lib/validation/schemas";

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

  const access = await authorizeOnboardingSession(id);
  if (!access.ok) {
    return Response.json(
      {
        ok: false,
        error: {
          code: access.code,
          message: access.message,
          retryable: false,
        },
      },
      { status: access.status },
    );
  }
  const { userId, session } = access;

  if (await isRateLimited(userId, ROUTE)) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests, please try again later",
          retryable: false,
        },
      },
      { status: 429 },
    );
  }

  const quota = await checkQuota(userId);
  if (!quota.allowed) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "QUOTA_EXCEEDED",
          message: quota.reason ?? "Usage quota exceeded",
          retryable: true,
        },
      },
      { status: 429 },
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

  const moderation = await moderateContent({
    route: ROUTE,
    text: stringifyForModeration({ logline: input.logline, answers: input.answers }),
    userId,
  });
  if (!moderation.allowed) {
    return Response.json(
      {
        ok: false,
        error: {
          code: moderation.code ?? "INTERNAL",
          message: moderation.reason ?? "Content blocked by moderation",
          retryable: false,
        },
      },
      { status: 400 },
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let heartbeat: ReturnType<typeof setInterval> | undefined;

      function send(text: string) {
        controller.enqueue(encoder.encode(text));
      }

      try {
        heartbeat = setInterval(() => send(sseHeartbeat()), 15_000);

        const updatedSession = await prisma.onboardingSession.update({
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
        let lastParsedAt = 0;
        let lastParsedLength = 0;

        const result = await streamChatCompletionWithRetry(
          {
            route: ROUTE,
            agent: "outline",
            userId,
            messages: buildBiblePrompt(input),
            temperature: 0.7,
            timeoutMs: 120_000,
          },
          {
            onDelta(delta) {
              buffer += delta;
              const now = Date.now();
              const shouldParse =
                now - lastParsedAt >= 200 || buffer.length - lastParsedLength >= 256;
              if (!shouldParse) return;

              lastParsedAt = now;
              lastParsedLength = buffer.length;

              const draft = tryParsePartialBibleDraft(buffer);
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
          const fallback = createFallbackBibleDraft(input.logline);
          for (const event of collectBibleEvents(fallback, cursor)) {
            send(sseEncode(event.event, event.data));
            emitted = true;
          }

          await prisma.onboardingSession.update({
            where: { id },
            data: { bible_draft: fallback },
          });

          send(
            sseEncode("error", {
              code: "LLM_PARSE_FAILED",
              message: "LLM output could not be parsed as Bible JSON; fallback draft was emitted",
              retryable: true,
              fallback: true,
              regeneration_count: updatedSession.regeneration_count,
            }),
          );
          send(
            sseEncode("done", {
              token_in: result.tokenIn,
              token_out: result.tokenOut,
              cost_cny: Number(result.costCny.toFixed(6)),
              took_ms: result.tookMs,
              emitted,
              fallback: true,
              regeneration_count: updatedSession.regeneration_count,
            }),
          );
          return;
        }

        const outputModeration = await moderateContent({
          route: ROUTE,
          text: stringifyForModeration(draft),
          userId,
        });
        if (!outputModeration.allowed) {
          send(
            sseEncode("error", {
              code: outputModeration.code ?? "INTERNAL",
              message: outputModeration.reason ?? "Generated Bible blocked by moderation",
              retryable: false,
              regeneration_count: updatedSession.regeneration_count,
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
            regeneration_count: updatedSession.regeneration_count,
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
            regeneration_count: session.regeneration_count,
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

function createFallbackBibleDraft(logline: string): BibleDraft {
  const safeLogline = logline.slice(0, 80) || "一个尚未完全成型的故事灵感";

  return {
    meta: {
      suggested_title: "新书稿",
      alternative_titles: ["未命名", "灵感录", "开篇卷"],
    },
    characters: [
      {
        role: "protagonist",
        name: "主角",
        age: "待定",
        appearance: "外貌待补，保留一个醒目标记",
        personality: "核心性格待补，但需要与灵感冲突形成反差",
        catchphrase: "先活下来再说。",
        abilities: ["待定能力"],
        goals: `短期：推进「${safeLogline}」的开局；长期：完成核心成长闭环。`,
        motivation: "模型输出异常时生成的占位角色，供用户继续重摆或手动编辑。",
        secrets: ["仍有一个未揭示秘密"],
        relations: [],
      },
      {
        role: "mentor",
        name: "引路人",
        age: "待定",
        appearance: "沉默的旁观者形象",
        personality: "谨慎、克制、隐藏信息",
        catchphrase: "答案不在这里。",
        abilities: ["提供线索"],
        goals: "短期推动主角行动，长期揭开世界真相。",
        motivation: "作为占位导师，承接后续 Bible 重摆时的结构位置。",
        secrets: ["知道主角过去的一部分"],
        relations: ["主角的引路人"],
      },
      {
        role: "antagonist",
        name: "压力源",
        age: "待定",
        appearance: "暂未定型的对立者",
        personality: "目标明确，手段强硬但有自身理由",
        catchphrase: "这不是私人恩怨。",
        abilities: ["资源压制"],
        goals: "短期阻止主角获得关键机会，长期维护自己的秩序。",
        motivation: "占位反派必须有合理利益诉求，避免为坏而坏。",
        secrets: ["与开局事件有关"],
        relations: ["主角的主要阻力"],
      },
    ],
    world: {
      setting_summary:
        "这是模型输出异常后的占位世界观：世界规则、势力结构和开篇冲突仍需重摆补全，但已经保留主角、导师、反派和首卷推进所需的最小结构。",
      factions: [
        { name: "主角阵营", alignment: "待定", role: "承载成长线" },
        { name: "对立阵营", alignment: "待定", role: "制造外部压力" },
      ],
      rules: ["核心规则待补", "冲突必须可追溯"],
      geography: ["开篇地点", "关键转折地点"],
    },
    outline: {
      volume_1: {
        name: "开篇卷",
        theme: "从灵感到冲突成型",
        chapter_count_estimate: 8,
        chapters: Array.from({ length: 8 }, (_, index) => ({
          index: index + 1,
          title: `第${index + 1}章`,
          summary:
            index === 3
              ? "占位章节：制造首个小高潮，让主角因关键选择付出代价并获得继续行动的理由。"
              : index === 5
                ? "占位章节：埋下一个与主角身世或世界规则有关的伏笔，后续章节可回收。"
                : "占位章节：承接开篇灵感，逐步补全人物关系、外部压力与下一步目标。",
        })),
      },
    },
    first_chapter_beats: [
      { beat: 1, scene: "开篇场景", purpose: "交代主角处境" },
      { beat: 2, scene: "异常发生", purpose: "引出核心冲突" },
      { beat: 3, scene: "压力逼近", purpose: "制造行动理由" },
      { beat: 4, scene: "主角选择", purpose: "展示动机" },
      { beat: 5, scene: "悬念收束", purpose: "钩住下一章" },
    ],
  };
}
