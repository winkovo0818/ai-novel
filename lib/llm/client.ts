/**
 * DeepSeek-V3 client (OpenAI 兼容协议).
 *
 * 契约：
 * - 所有调用必须经过本模块，禁止业务代码自行 fetch 或 console.log token。
 *   日志格式由本模块统一输出（见 docs/contracts.md §9）。
 * - 模型配置优先从 LlmModel 表读取（is_default=true && is_enabled=true），
 *   找不到时回退到 DEEPSEEK_* 环境变量；DB 不可达时也回退。
 */

import { prisma } from "@/lib/db";
import {
  isLlmMockEnabled,
  mockChatCompletion,
  mockStreamChatCompletion,
} from "./mock";
import { decryptApiKey } from "./encryption";
import { logUsage } from "./usage";
import { logInfo } from "@/lib/observability/logger";
import {
  anthropicHeaders,
  anthropicMessagesUrl,
  buildAnthropicBody,
  isAnthropicConfig,
  splitAnthropicMessages,
  type AnthropicResponse,
  type AnthropicStreamChunk,
  type ResolvedModelConfig,
} from "./anthropic";

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
  /** Agent identifier for logging (e.g. "writer", "critic", "state_updater") */
  agent?: string;
  /** User ID for usage tracking */
  userId?: string;
  /** Novel ID for usage tracking */
  novelId?: string;
  /**
   * Caller-supplied abort signal. When the external signal aborts, the
   * fetch underneath is aborted too — used by P0-8 streaming moderation
   * to stop a banned generation as soon as a segment trips the guard,
   * so DeepSeek stops yielding tokens we'd have to pay for anyway.
   */
  signal?: AbortSignal;
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
  /** Agent identifier for logging (e.g. "writer", "outline") */
  agent?: string;
  /** User ID for usage tracking */
  userId?: string;
  /** Novel ID for usage tracking */
  novelId?: string;
  /**
   * Caller-supplied abort signal. See {@link ChatCompletionOptions.signal}.
   */
  signal?: AbortSignal;
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
  agent?: string;
  model: string;
  tokenIn: number;
  tokenOut: number;
  costCny: number;
  tookMs: number;
  status: "ok" | "err";
  errCode?: string;
  userId?: string;
  novelId?: string;
}

function logLlmCall(entry: LlmLogEntry): void {
  logInfo("llm.call", {
    route: entry.route,
    agent: entry.agent,
    model: entry.model,
    token_in: entry.tokenIn,
    token_out: entry.tokenOut,
    cost_cny: Number(entry.costCny.toFixed(6)),
    took_ms: entry.tookMs,
    status: entry.status,
    err_code: entry.errCode,
    user_id: entry.userId,
    novel_id: entry.novelId,
  });

  // Persist usage to database (fire-and-forget)
  if (entry.userId) {
    logUsage({
      userId: entry.userId,
      novelId: entry.novelId,
      route: entry.route,
      agent: entry.agent,
      model: entry.model,
      tokenIn: entry.tokenIn,
      tokenOut: entry.tokenOut,
      costCny: entry.costCny,
      status: entry.status,
      errorCode: entry.errCode,
      tookMs: entry.tookMs,
    });
  }
}

interface DeepSeekResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

interface DeepSeekStreamChunk {
  choices?: Array<{ delta?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * Wire an external `AbortSignal` to an internal `AbortController`. If the
 * caller's signal already fired, abort immediately; otherwise listen once
 * and forward. Returns a cleanup that detaches the listener — call it
 * after the fetch settles so we don't leak listeners across requests.
 *
 * Used by P0-8 streaming moderation: the route holds an AbortController
 * it triggers when a segment trips the guard; this helper makes sure
 * that abort actually closes the DeepSeek HTTP connection underneath.
 */
function forwardAbort(
  external: AbortSignal | undefined,
  internal: AbortController,
): () => void {
  if (!external) return () => {};
  if (external.aborted) {
    internal.abort();
    return () => {};
  }
  const handler = () => internal.abort();
  external.addEventListener("abort", handler, { once: true });
  return () => external.removeEventListener("abort", handler);
}

function getBaseUrl(): string {
  return (
    process.env.DEEPSEEK_BASE_URL?.replace(/\/+$/, "") ??
    "https://api.deepseek.com/v1"
  );
}

/**
 * Resolve which provider/model to call. Prefers a DB-configured default row
 * (so users can manage credentials via /models without redeploying), and falls
 * back to DEEPSEEK_* env vars if the DB is unavailable or no row is enabled.
 *
 * The lookup is wrapped in a 500ms timeout so a slow / unreachable DB never
 * blocks an LLM call — env fallback wins in that case.
 */
async function resolveModelConfig(opts: { model?: string }): Promise<ResolvedModelConfig> {
  try {
    const lookup = prisma.llmModel.findFirst({
      where: { is_default: true, is_enabled: true },
      orderBy: { created_at: "asc" },
    });
    const row = await Promise.race([
      lookup,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 500)),
    ]);
    if (row) {
      return {
        baseUrl: row.base_url.replace(/\/+$/, ""),
        apiKey: decryptApiKey(row.api_key),
        model: opts.model ?? row.model,
        provider: row.provider,
      };
    }
  } catch {
    // Fall through to env-based config.
  }
  return {
    baseUrl: getBaseUrl(),
    apiKey: requireEnv("DEEPSEEK_API_KEY"),
    model: opts.model ?? DEFAULT_MODEL,
    provider: "deepseek",
  };
}

export async function streamChatCompletion(
  opts: ChatStreamOptions,
  callbacks: ChatStreamCallbacks,
): Promise<ChatStreamResult> {
  const start = Date.now();
  let model = opts.model ?? DEFAULT_MODEL;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let status: "ok" | "err" = "ok";
  let errCode: string | undefined;
  let content = "";
  let tokenIn = 0;
  let tokenOut = 0;

  // Stays a no-op until the fetch wires up the external signal listener.
  // Hoisted here so the outer finally can always detach it after the
  // stream-read loop settles, even on the throw paths.
  let detachExternalAbort: () => void = () => {};

  try {
    if (isLlmMockEnabled()) {
      const result = await mockStreamChatCompletion(opts, callbacks);
      content = result.content;
      tokenIn = result.tokenIn;
      tokenOut = result.tokenOut;
      return result;
    }

    const config = await resolveModelConfig({ model: opts.model });
    model = config.model;
    const apiKey = config.apiKey;
    const anthropic = isAnthropicConfig(config);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    detachExternalAbort = forwardAbort(opts.signal, controller);

    let response: Response;
    try {
      response = await fetch(anthropic ? anthropicMessagesUrl(config.baseUrl) : `${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: anthropic
          ? anthropicHeaders(apiKey)
          : {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
        body: JSON.stringify(
          anthropic
            ? buildAnthropicBody(opts, model, true)
            : {
                model,
                messages: opts.messages,
                temperature: opts.temperature ?? 0.7,
                stream: true,
                stream_options: { include_usage: true },
              },
        ),
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
      // NOTE: external-abort listener is NOT detached here — we want
      // caller aborts during the stream-read loop below to keep
      // propagating into the internal controller so reader.read()
      // throws promptly. Detach happens in the outer finally after the
      // read loop has settled.
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      errCode = `HTTP_${response.status}`;
      throw new Error(
        `${anthropic ? "Anthropic" : "DeepSeek"} API error: ${response.status} ${text.slice(0, 500)}`,
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

        const chunk = JSON.parse(data) as DeepSeekStreamChunk & AnthropicStreamChunk;
        const delta = anthropic
          ? chunk.type === "content_block_delta" && chunk.delta?.type === "text_delta"
            ? chunk.delta.text ?? ""
            : ""
          : chunk.choices?.[0]?.delta?.content ?? "";
        if (delta) {
          content += delta;
          await callbacks.onDelta(delta);
        }
        tokenIn = anthropic
          ? chunk.message?.usage?.input_tokens ?? chunk.usage?.input_tokens ?? tokenIn
          : chunk.usage?.prompt_tokens ?? tokenIn;
        tokenOut = anthropic
          ? chunk.message?.usage?.output_tokens ?? chunk.usage?.output_tokens ?? tokenOut
          : chunk.usage?.completion_tokens ?? tokenOut;
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
    detachExternalAbort();
    logLlmCall({
      route: opts.route,
      agent: opts.agent,
      model,
      tokenIn,
      tokenOut,
      costCny: calcCostCny(tokenIn, tokenOut),
      tookMs: Date.now() - start,
      status,
      errCode,
      userId: opts.userId,
      novelId: opts.novelId,
    });
  }
}

export async function streamChatCompletionWithRetry(
  opts: ChatStreamOptions,
  callbacks: ChatStreamCallbacks,
  retries = 1,
): Promise<ChatStreamResult> {
  let emitted = false;
  const wrappedCallbacks: ChatStreamCallbacks = {
    async onDelta(delta) {
      emitted = true;
      await callbacks.onDelta(delta);
    },
  };
  try {
    return await streamChatCompletion(opts, wrappedCallbacks);
  } catch (err) {
    // Once the caller has seen any delta, retrying would splice a second
    // generation onto the SSE stream and the client would render two
    // overlapping continuations. Surface the error instead.
    if (emitted) throw err;
    if (retries <= 0 || !isTimeoutError(err)) throw err;
    return streamChatCompletion(opts, wrappedCallbacks);
  }
}

export async function chatCompletion(
  opts: ChatCompletionOptions,
): Promise<ChatCompletionResult> {
  const start = Date.now();
  let model = opts.model ?? DEFAULT_MODEL;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let status: "ok" | "err" = "ok";
  let errCode: string | undefined;
  let result: ChatCompletionResult | undefined;
  let detachExternalAbort: () => void = () => {};

  try {
    if (isLlmMockEnabled()) {
      result = await mockChatCompletion(opts);
      return result;
    }

    const config = await resolveModelConfig({ model: opts.model });
    model = config.model;
    const apiKey = config.apiKey;
    const baseUrl = config.baseUrl;
    const anthropic = isAnthropicConfig(config);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    detachExternalAbort = forwardAbort(opts.signal, controller);

    let response: Response;
    try {
      response = await fetch(anthropic ? anthropicMessagesUrl(baseUrl) : `${baseUrl}/chat/completions`, {
        method: "POST",
        headers: anthropic
          ? anthropicHeaders(apiKey)
          : {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
        body: JSON.stringify(
          anthropic
            ? buildAnthropicBody(opts, model, false)
            : {
                model,
                messages: opts.messages,
                temperature: opts.temperature ?? 0.7,
                stream: false,
                ...(opts.responseFormat
                  ? { response_format: { type: opts.responseFormat } }
                  : {}),
              },
        ),
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
        `${anthropic ? "Anthropic" : "DeepSeek"} API error: ${response.status} ${text.slice(0, 500)}`,
      );
    }

    const data = (await response.json()) as DeepSeekResponse & AnthropicResponse;
    const tokenIn = anthropic ? data.usage?.input_tokens ?? 0 : data.usage?.prompt_tokens ?? 0;
    const tokenOut = anthropic ? data.usage?.output_tokens ?? 0 : data.usage?.completion_tokens ?? 0;

    result = {
      content: anthropic
        ? data.content?.filter((item) => item.type === "text").map((item) => item.text ?? "").join("") ?? ""
        : data.choices?.[0]?.message?.content ?? "",
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
    detachExternalAbort();
    logLlmCall({
      route: opts.route,
      agent: opts.agent,
      model,
      tokenIn: result?.tokenIn ?? 0,
      tokenOut: result?.tokenOut ?? 0,
      costCny: result?.costCny ?? 0,
      tookMs: Date.now() - start,
      status,
      errCode,
      userId: opts.userId,
      novelId: opts.novelId,
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
