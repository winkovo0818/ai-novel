// Anthropic Messages API adapter.  Extracted from client.ts to keep the
// main LLM client focused on protocol routing rather than per-provider
// message-format translation.

import type { ChatCompletionOptions, ChatMessage, ChatStreamOptions } from "./client";

export interface AnthropicResponse {
  content?: Array<{ type?: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export interface AnthropicStreamChunk {
  type?: string;
  delta?: { type?: string; text?: string };
  message?: { usage?: { input_tokens?: number; output_tokens?: number } };
  usage?: { input_tokens?: number; output_tokens?: number };
}

export interface ResolvedModelConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  provider: string;
}

export function isAnthropicConfig(config: ResolvedModelConfig): boolean {
  if (config.provider === "anthropic") return true;
  try {
    return new URL(config.baseUrl).pathname.toLowerCase().split("/").includes("anthropic");
  } catch {
    return false;
  }
}

export function anthropicMessagesUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, "");
  const pathname = new URL(normalized).pathname.replace(/\/+$/, "");
  return pathname.endsWith("/v1") ? `${normalized}/messages` : `${normalized}/v1/messages`;
}

export function splitAnthropicMessages(messages: ChatMessage[]): {
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
} {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n")
    .trim();

  const anthropicMessages = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" as const : "user" as const,
      content: message.content,
    }));

  return {
    system: system || undefined,
    messages: anthropicMessages.length
      ? anthropicMessages
      : [{ role: "user", content: "" }],
  };
}

export function buildAnthropicBody(
  opts: ChatCompletionOptions | ChatStreamOptions,
  model: string,
  stream: boolean,
) {
  const { system, messages } = splitAnthropicMessages(opts.messages);
  return {
    model,
    messages,
    system,
    temperature: opts.temperature ?? 0.7,
    max_tokens: Number(process.env.ANTHROPIC_MAX_TOKENS ?? 4096),
    stream,
  };
}

export function anthropicHeaders(apiKey: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    Authorization: `Bearer ${apiKey}`,
    "anthropic-version": "2023-06-01",
  };
}
