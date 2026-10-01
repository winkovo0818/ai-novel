import { calculateModelCost } from "@/lib/llm/pricing";
import type { CliConfig } from "./types";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface LlmCallResult {
  content: string;
  tokenIn: number;
  tokenOut: number;
  costCny: number;
  tookMs: number;
  model: string;
}

/**
 * Lightweight OpenAI-compatible chat completion.
 * Does NOT depend on Prisma — CLI-only.
 */
export async function cliChatCompletion(
  config: CliConfig,
  opts: {
    messages: ChatMessage[];
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
  },
): Promise<LlmCallResult> {
  const start = Date.now();
  const llm = config.llm;
  const timeoutMs = opts.timeoutMs ?? 120_000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${llm.base_url}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${llm.api_key}`,
      },
      body: JSON.stringify({
        model: llm.model,
        messages: opts.messages,
        temperature: opts.temperature ?? llm.temperature,
        max_tokens: opts.maxTokens ?? llm.max_tokens,
        ...(opts.topP !== undefined ? { top_p: opts.topP } : {}),
        ...(opts.frequencyPenalty !== undefined
          ? { frequency_penalty: opts.frequencyPenalty }
          : {}),
        ...(opts.presencePenalty !== undefined
          ? { presence_penalty: opts.presencePenalty }
          : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`LLM API error ${response.status}: ${text.slice(0, 300)}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    const tokenIn = data.usage?.prompt_tokens ?? 0;
    const tokenOut = data.usage?.completion_tokens ?? 0;

    return {
      content,
      tokenIn,
      tokenOut,
      costCny: calcCost(tokenIn, tokenOut, llm.model),
      tookMs: Date.now() - start,
      model: llm.model,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`LLM request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Rough cost estimate for DeepSeek and common models.
 * Accurate enough for progress display; not billing-grade.
 */
function calcCost(tokenIn: number, tokenOut: number, model: string): number {
  return calculateModelCost(tokenIn, tokenOut, model);
}

/* ------------------------------------------------------------------ */
/*  Streaming variant                                                   */
/* ------------------------------------------------------------------ */

export interface StreamCallbacks {
  onToken(token: string): void;
  onDone(result: LlmCallResult): void;
  onError(err: Error): void;
}

export async function cliChatCompletionStream(
  config: CliConfig,
  opts: {
    messages: ChatMessage[];
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
    topP?: number;
  },
  callbacks: StreamCallbacks,
): Promise<void> {
  const start = Date.now();
  const llm = config.llm;
  const timeoutMs = opts.timeoutMs ?? 120_000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let content = "";
  let tokenIn = 0;
  let tokenOut = 0;

  try {
    const response = await fetch(`${llm.base_url}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${llm.api_key}`,
      },
      body: JSON.stringify({
        model: llm.model,
        messages: opts.messages,
        temperature: opts.temperature ?? llm.temperature,
        max_tokens: opts.maxTokens ?? llm.max_tokens,
        stream: true,
        stream_options: { include_usage: true },
        ...(opts.topP !== undefined ? { top_p: opts.topP } : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`LLM API error ${response.status}: ${text.slice(0, 300)}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            content += delta;
            callbacks.onToken(delta);
          }
          if (parsed.usage) {
            tokenIn = parsed.usage.prompt_tokens ?? 0;
            tokenOut = parsed.usage.completion_tokens ?? 0;
          }
        } catch {
          // skip malformed chunks
        }
      }
    }

    callbacks.onDone({
      content,
      tokenIn,
      tokenOut,
      costCny: calcCost(tokenIn, tokenOut, llm.model),
      tookMs: Date.now() - start,
      model: llm.model,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      callbacks.onError(new Error(`LLM request timed out after ${timeoutMs}ms`));
    } else {
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    }
  } finally {
    clearTimeout(timer);
  }
}
