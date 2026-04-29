/**
 * DeepSeek-V3 client (OpenAI 兼容协议).
 *
 * 契约：
 * - 所有调用必须经过本模块，禁止业务代码自行 fetch 或 console.log token。
 *   日志格式由本模块统一输出（见 docs/contracts.md §9）。
 * - 流式调用见后续 Step 4（lib/stream/...），本文件只暴露非流式 chatCompletion。
 */

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatCompletionOptions {
  /** API 路径，仅用于日志归因（如 "/api/healthz/llm"） */
  route: string;
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  /** 非流式场景可开启 JSON object（见决策 D-02 与 README §5.1） */
  responseFormat?: "json_object";
  /** 单次请求超时，默认 15s（与 README §5 错误处理一致） */
  timeoutMs?: number;
}

export interface ChatCompletionResult {
  content: string;
  tokenIn: number;
  tokenOut: number;
  costCny: number;
  tookMs: number;
  model: string;
}

const DEFAULT_MODEL = "deepseek-chat";
const DEFAULT_TIMEOUT_MS = 15_000;

/** DeepSeek-V3 当前定价：输入 ¥0.001/1k token，输出 ¥0.002/1k token。如调价更新此处。 */
function calcCostCny(tokenIn: number, tokenOut: number): number {
  return (tokenIn * 0.001 + tokenOut * 0.002) / 1000;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`Missing env var: ${name}`);
  }
  return v;
}

interface LlmLogEntry {
  route: string;
  model: string;
  tokenIn: number;
  tokenOut: number;
  costCny: number;
  tookMs: number;
  status: "ok" | "err";
  errCode?: string;
}

function logLlmCall(entry: LlmLogEntry): void {
  const errPart = entry.errCode ? ` err_code=${entry.errCode}` : "";
  // 契约 §9 格式：[LLM] route=... model=... token_in=... token_out=... cost_cny=... took_ms=... status=...
  console.log(
    `[LLM] route=${entry.route} model=${entry.model} token_in=${entry.tokenIn} token_out=${entry.tokenOut} cost_cny=${entry.costCny.toFixed(4)} took_ms=${entry.tookMs} status=${entry.status}${errPart}`,
  );
}

interface DeepSeekResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export async function chatCompletion(
  opts: ChatCompletionOptions,
): Promise<ChatCompletionResult> {
  const start = Date.now();
  const model = opts.model ?? DEFAULT_MODEL;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let status: "ok" | "err" = "ok";
  let errCode: string | undefined;
  let result: ChatCompletionResult | undefined;

  try {
    const apiKey = requireEnv("DEEPSEEK_API_KEY");
    const baseUrl =
      process.env.DEEPSEEK_BASE_URL?.replace(/\/+$/, "") ??
      "https://api.deepseek.com/v1";

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: opts.messages,
          temperature: opts.temperature ?? 0.7,
          stream: false,
          ...(opts.responseFormat
            ? { response_format: { type: opts.responseFormat } }
            : {}),
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        errCode = "LLM_TIMEOUT";
        throw new Error(`DeepSeek request timed out after ${timeoutMs}ms`);
      }
      errCode = "NETWORK";
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      errCode = `HTTP_${response.status}`;
      throw new Error(
        `DeepSeek API error: ${response.status} ${text.slice(0, 500)}`,
      );
    }

    const data = (await response.json()) as DeepSeekResponse;
    const tokenIn = data.usage?.prompt_tokens ?? 0;
    const tokenOut = data.usage?.completion_tokens ?? 0;

    result = {
      content: data.choices?.[0]?.message?.content ?? "",
      tokenIn,
      tokenOut,
      costCny: calcCostCny(tokenIn, tokenOut),
      tookMs: Date.now() - start,
      model,
    };
    return result;
  } catch (err) {
    status = "err";
    if (!errCode) errCode = "UNKNOWN";
    throw err;
  } finally {
    logLlmCall({
      route: opts.route,
      model,
      tokenIn: result?.tokenIn ?? 0,
      tokenOut: result?.tokenOut ?? 0,
      costCny: result?.costCny ?? 0,
      tookMs: Date.now() - start,
      status,
      errCode,
    });
  }
}
