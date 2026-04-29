import { chatCompletion } from "@/lib/llm/client";

export const runtime = "nodejs";
// 始终调用 LLM，不要被构建期或边缘缓存掉
export const dynamic = "force-dynamic";

const ROUTE = "/api/healthz/llm";

export async function GET() {
  try {
    const result = await chatCompletion({
      route: ROUTE,
      messages: [
        {
          role: "system",
          content: "You are a health check agent. Reply with exactly: ok",
        },
        { role: "user", content: "ping" },
      ],
      temperature: 0,
      timeoutMs: 10_000,
    });

    return Response.json({
      ok: true,
      data: {
        reply: result.content,
        model: result.model,
        token_in: result.tokenIn,
        token_out: result.tokenOut,
        cost_cny: Number(result.costCny.toFixed(6)),
        took_ms: result.tookMs,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    const isTimeout = /timed out/i.test(message);
    return Response.json(
      {
        ok: false,
        error: {
          code: isTimeout ? "LLM_TIMEOUT" : "INTERNAL",
          message,
          retryable: true,
        },
      },
      { status: isTimeout ? 504 : 500 },
    );
  }
}
