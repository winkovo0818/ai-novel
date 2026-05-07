/**
 * DeepSeek-V3 client (OpenAI 兼容协议).
 *
 * 契约：
 * - 所有调用必须经过本模块，禁止业务代码自行 fetch 或 console.log token。
 *   日志格式由本模块统一输出（见 docs/contracts.md §9）。
 */

import {
  isLlmMockEnabled,
  mockChatCompletion,
  mockStreamChatCompletion,
} from "./mock";

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

export interface ChatStreamOptions {
  route: string;
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  timeoutMs?: number;
}

export interface ChatStreamResult {
  content: string;
  tokenIn: number;
  tokenOut: number;
  costCny: number;
  tookMs: number;
  model: string;
}

export interface ChatStreamCallbacks {
  onDelta(delta: string): Promise<void> | void;
}

const DEFAULT_MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
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

interface DeepSeekStreamChunk {
  choices?: Array<{ delta?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

function getBaseUrl(): string {
  return (
    process.env.DEEPSEEK_BASE_URL?.replace(/\/+$/, "") ??
    "https://api.deepseek.com/v1"
  );
}

export async function streamChatCompletion(
  opts: ChatStreamOptions,
  callbacks: ChatStreamCallbacks,
): Promise<ChatStreamResult> {
  const start = Date.now();
  const model = opts.model ?? DEFAULT_MODEL;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let status: "ok" | "err" = "ok";
  let errCode: string | undefined;
  let content = "";
  let tokenIn = 0;
  let tokenOut = 0;

  try {
    if (isLlmMockEnabled()) {
      const result = await mockStreamChatCompletion(opts, callbacks);
      content = result.content;
      tokenIn = result.tokenIn;
      tokenOut = result.tokenOut;
      return result;
    }

    const apiKey = requireEnv("DEEPSEEK_API_KEY");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${getBaseUrl()}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: opts.messages,
          temperature: opts.temperature ?? 0.7,
          stream: true,
          stream_options: { include_usage: true },
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        errCode = "LLM_TIMEOUT";
        throw new Error(`DeepSeek stream timed out after ${timeoutMs}ms`);
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

    if (!response.body) {
      errCode = "EMPTY_STREAM";
      throw new Error("DeepSeek stream response body is empty");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) continue;

        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;

        const chunk = JSON.parse(data) as DeepSeekStreamChunk;
        const delta = chunk.choices?.[0]?.delta?.content ?? "";
        if (delta) {
          content += delta;
          await callbacks.onDelta(delta);
        }
        tokenIn = chunk.usage?.prompt_tokens ?? tokenIn;
        tokenOut = chunk.usage?.completion_tokens ?? tokenOut;
      }
    }

    const result = {
      content,
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
      tokenIn,
      tokenOut,
      costCny: calcCostCny(tokenIn, tokenOut),
      tookMs: Date.now() - start,
      status,
      errCode,
    });
  }
}

export async function streamChatCompletionWithRetry(
  opts: ChatStreamOptions,
  callbacks: ChatStreamCallbacks,
  retries = 1,
): Promise<ChatStreamResult> {
  try {
    return await streamChatCompletion(opts, callbacks);
  } catch (err) {
    if (retries <= 0 || !isTimeoutError(err)) throw err;
    return streamChatCompletion(opts, callbacks);
  }
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
    if (isLlmMockEnabled()) {
      result = await mockChatCompletion(opts);
      return result;
    }

    const apiKey = requireEnv("DEEPSEEK_API_KEY");
    const baseUrl = getBaseUrl();

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

export async function chatCompletionWithRetry(
  opts: ChatCompletionOptions,
  retries = 1,
): Promise<ChatCompletionResult> {
  try {
    return await chatCompletion(opts);
  } catch (err) {
    if (retries <= 0 || !isTimeoutError(err)) throw err;
    return chatCompletion(opts);
  }
}

function isTimeoutError(err: unknown): boolean {
  return err instanceof Error && /timed out/i.test(err.message);
}
