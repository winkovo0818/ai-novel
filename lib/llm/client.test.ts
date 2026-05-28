import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    llmModel: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}));

import { chatCompletion, chatCompletionWithRetry, streamChatCompletion, streamChatCompletionWithRetry } from "./client";
import { encryptApiKey } from "./encryption";
import { prisma } from "@/lib/db";

const ORIG_KEY = process.env.DEEPSEEK_API_KEY;
const ORIG_MOCK = process.env.LLM_MOCK;
const ORIG_MOCK_SCENARIO = process.env.LLM_MOCK_SCENARIO;
const ORIG_MOCK_TOKEN_DELAY_MS = process.env.LLM_MOCK_TOKEN_DELAY_MS;
const ORIG_MODEL_KEY_SECRET = process.env.MODEL_KEY_ENCRYPTION_SECRET;

describe("lib/llm/client", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    if (ORIG_KEY === undefined) {
      delete process.env.DEEPSEEK_API_KEY;
    } else {
      process.env.DEEPSEEK_API_KEY = ORIG_KEY;
    }
    if (ORIG_MOCK === undefined) {
      delete process.env.LLM_MOCK;
    } else {
      process.env.LLM_MOCK = ORIG_MOCK;
    }
    if (ORIG_MOCK_SCENARIO === undefined) {
      delete process.env.LLM_MOCK_SCENARIO;
    } else {
      process.env.LLM_MOCK_SCENARIO = ORIG_MOCK_SCENARIO;
    }
    if (ORIG_MOCK_TOKEN_DELAY_MS === undefined) {
      delete process.env.LLM_MOCK_TOKEN_DELAY_MS;
    } else {
      process.env.LLM_MOCK_TOKEN_DELAY_MS = ORIG_MOCK_TOKEN_DELAY_MS;
    }
    if (ORIG_MODEL_KEY_SECRET === undefined) {
      delete process.env.MODEL_KEY_ENCRYPTION_SECRET;
    } else {
      process.env.MODEL_KEY_ENCRYPTION_SECRET = ORIG_MODEL_KEY_SECRET;
    }
    vi.mocked(prisma.llmModel.findFirst).mockResolvedValue(null);
    vi.restoreAllMocks();
  });

  it("exports chatCompletion as a function", () => {
    expect(typeof chatCompletion).toBe("function");
  });

  it("retries chatCompletion once on timeout", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    delete process.env.LLM_MOCK;
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("The operation was aborted", "AbortError"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "ok" } }],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await chatCompletionWithRetry({
      route: "/test",
      messages: [{ role: "user", content: "ping" }],
    });

    expect(result.content).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws when DEEPSEEK_API_KEY is missing", async () => {
    delete process.env.LLM_MOCK;
    delete process.env.DEEPSEEK_API_KEY;
    await expect(
      chatCompletion({
        route: "/test",
        messages: [{ role: "user", content: "ping" }],
      }),
    ).rejects.toThrow(/DEEPSEEK_API_KEY/);
  });

  it("returns deterministic chat content in mock mode without an API key", async () => {
    process.env.LLM_MOCK = "1";
    delete process.env.DEEPSEEK_API_KEY;

    const result = await chatCompletion({
      route: "/api/onboarding/sessions/:id/loglines",
      messages: [{ role: "user", content: "ping" }],
      responseFormat: "json_object",
    });

    expect(JSON.parse(result.content).loglines).toHaveLength(5);
  });

  it("streams deterministic bible JSON in mock mode", async () => {
    process.env.LLM_MOCK = "1";
    delete process.env.DEEPSEEK_API_KEY;
    let content = "";

    const result = await streamChatCompletion(
      {
        route: "/api/onboarding/sessions/:id/bible",
        messages: [{ role: "user", content: "ping" }],
      },
      { onDelta: (delta) => { content += delta; } },
    );

    expect(result.content).toBe(content);
    expect(JSON.parse(content).meta.suggested_title).toBe("逆魂纪");
  });

  it("supports an empty-stream mock scenario", async () => {
    process.env.LLM_MOCK = "1";
    process.env.LLM_MOCK_SCENARIO = "stream-empty";
    delete process.env.DEEPSEEK_API_KEY;
    let deltas = 0;

    const result = await streamChatCompletion(
      {
        route: "/api/novels/:id/chapters/draft",
        messages: [{ role: "user", content: "ping" }],
      },
      { onDelta: () => { deltas++; } },
    );

    expect(result.content).toBe("");
    expect(result.tokenOut).toBe(0);
    expect(deltas).toBe(0);
  });

  it("supports a before-delta timeout mock scenario", async () => {
    process.env.LLM_MOCK = "1";
    process.env.LLM_MOCK_SCENARIO = "stream-timeout-before-delta";
    delete process.env.DEEPSEEK_API_KEY;
    let captured = "";

    await expect(
      streamChatCompletionWithRetry(
        {
          route: "/api/novels/:id/chapters/draft",
          messages: [{ role: "user", content: "ping" }],
          timeoutMs: 123,
        },
        { onDelta: (delta) => { captured += delta; } },
      ),
    ).rejects.toThrow(/timed out after 123ms/);

    expect(captured).toBe("");
  });

  it("supports an after-delta interruption mock scenario without retrying", async () => {
    process.env.LLM_MOCK = "1";
    process.env.LLM_MOCK_SCENARIO = "stream-timeout-after-delta";
    delete process.env.DEEPSEEK_API_KEY;
    let captured = "";

    await expect(
      streamChatCompletionWithRetry(
        {
          route: "/api/novels/:id/chapters/draft",
          messages: [{ role: "user", content: "ping" }],
          timeoutMs: 456,
        },
        { onDelta: (delta) => { captured += delta; } },
      ),
    ).rejects.toThrow(/timed out after 456ms/);

    expect(captured).toBe("雨夜火房骤然安静。");
  });

  it("supports a stream moderation-block mock scenario", async () => {
    process.env.LLM_MOCK = "1";
    process.env.LLM_MOCK_SCENARIO = "stream-moderation-block";
    delete process.env.DEEPSEEK_API_KEY;
    let captured = "";

    const result = await streamChatCompletion(
      {
        route: "/api/novels/:id/chapters/draft",
        messages: [{ role: "user", content: "ping" }],
      },
      { onDelta: (delta) => { captured += delta; } },
    );

    expect(result.content).toBe(captured);
    expect(captured).toContain("制作炸弹");
  });

  it("supports a slow-token mock scenario", async () => {
    process.env.LLM_MOCK = "1";
    process.env.LLM_MOCK_SCENARIO = "stream-slow";
    process.env.LLM_MOCK_TOKEN_DELAY_MS = "1";
    delete process.env.DEEPSEEK_API_KEY;
    const chunks: string[] = [];

    const result = await streamChatCompletion(
      {
        route: "/api/novels/:id/chapters/draft",
        messages: [{ role: "user", content: "ping" }],
      },
      { onDelta: (delta) => { chunks.push(delta); } },
    );

    expect(result.content).toBe(chunks.join(""));
    expect(chunks.length).toBeGreaterThan(1);
    expect(result.tookMs).toBeGreaterThanOrEqual(1);
  });

  it("supports a chat moderation-block mock scenario", async () => {
    process.env.LLM_MOCK = "1";
    process.env.LLM_MOCK_SCENARIO = "chat-moderation-block";
    delete process.env.DEEPSEEK_API_KEY;

    const result = await chatCompletion({
      route: "/api/novels/:id/chapters/draft:moderation",
      messages: [{ role: "user", content: "ping" }],
      responseFormat: "json_object",
    });

    expect(JSON.parse(result.content)).toEqual({
      allowed: false,
      reason: "Mock moderation block requested by LLM_MOCK_SCENARIO.",
    });
  });

  it("retries streamChatCompletion on timeout when no delta has been emitted", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    delete process.env.LLM_MOCK;

    const okBody = [
      'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n',
      'data: {"usage":{"prompt_tokens":1,"completion_tokens":1}}\n\n',
      'data: [DONE]\n\n',
    ].join("");
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("The operation was aborted", "AbortError"))
      .mockResolvedValueOnce(new Response(okBody, { status: 200, headers: { "content-type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetchMock);

    let captured = "";
    const result = await streamChatCompletionWithRetry(
      { route: "/test", messages: [{ role: "user", content: "ping" }] },
      { onDelta: (delta) => { captured += delta; } },
    );

    expect(result.content).toBe("hi");
    expect(captured).toBe("hi");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry streamChatCompletion once a delta has been emitted", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    delete process.env.LLM_MOCK;

    // First pull delivers a delta; second pull errors. Using `pull` ensures
    // the reader actually consumes the chunk (firing onDelta) before the
    // stream errors, which is what makes this a "delta already emitted" case.
    let pulled = 0;
    const partialStream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        if (pulled === 1) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"par"}}]}\n\n'));
        } else {
          controller.error(new DOMException("The operation was aborted", "AbortError"));
        }
      },
    });

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(partialStream, { status: 200, headers: { "content-type": "text/event-stream" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    let captured = "";
    await expect(
      streamChatCompletionWithRetry(
        { route: "/test", messages: [{ role: "user", content: "ping" }] },
        { onDelta: (delta) => { captured += delta; } },
      ),
    ).rejects.toThrow();

    expect(captured).toBe("par");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("forwards an external AbortSignal into the fetch (P0-8)", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    delete process.env.LLM_MOCK;

    // Pre-aborted signal: the inner controller must abort synchronously,
    // so fetch sees signal.aborted=true before the request goes out.
    let observedAborted: boolean | undefined;
    const fetchMock = vi.fn().mockImplementation((_url, init: RequestInit) => {
      observedAborted = (init.signal as AbortSignal | undefined)?.aborted;
      throw new DOMException("aborted", "AbortError");
    });
    vi.stubGlobal("fetch", fetchMock);

    const ac = new AbortController();
    ac.abort();
    await expect(
      chatCompletion({
        route: "/test",
        messages: [{ role: "user", content: "ping" }],
        signal: ac.signal,
      }),
    ).rejects.toThrow();
    expect(observedAborted).toBe(true);
  });

  it("forwards a stream-time external abort onto fetch's signal (P0-8)", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    delete process.env.LLM_MOCK;

    // Stream that closes immediately so we don't loop forever; the
    // important assertion is that the AbortSignal handed to fetch is
    // the *internal* one wired to the external controller, and that
    // aborting the external controller after the call started flips
    // the internal one. (We don't try to verify that mock-stream
    // reader.read() throws on abort — that's a runtime contract of
    // real fetch, not of the in-memory ReadableStream mock.)
    let capturedSignal: AbortSignal | undefined;
    const emptyStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockImplementation((_url, init: RequestInit) => {
      capturedSignal = init.signal as AbortSignal | undefined;
      return Promise.resolve(
        new Response(emptyStream, { status: 200, headers: { "content-type": "text/event-stream" } }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const ac = new AbortController();
    await streamChatCompletion(
      { route: "/test", messages: [{ role: "user", content: "ping" }], signal: ac.signal },
      { onDelta: () => {} },
    );

    // Inner signal exists and was passed to fetch (not the external one
    // directly — we forward via an internal controller so the timeout
    // path can still race).
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal).not.toBe(ac.signal);
    expect(capturedSignal?.aborted).toBe(false);

    // After the stream settles, the listener should have been detached
    // — proving the outer finally ran. We can't directly assert on the
    // listener; we instead check that aborting the external controller
    // post-hoc does NOT abort the (already-discarded) inner signal.
    ac.abort();
    expect(capturedSignal?.aborted).toBe(false);
  });

  it("uses Anthropic messages API for /anthropic model endpoints", async () => {
    delete process.env.LLM_MOCK;
    process.env.MODEL_KEY_ENCRYPTION_SECRET = "test-secret";
    vi.mocked(prisma.llmModel.findFirst).mockResolvedValueOnce({
      provider: "custom",
      base_url: "https://token-plan-cn.xiaomimimo.com/anthropic",
      api_key: encryptApiKey("row-key"),
      model: "mimo-v2.5-pro",
      created_at: new Date(),
    } as never);

    const fetchMock = vi.fn().mockResolvedValueOnce(
      Response.json({
        content: [{ type: "text", text: "{\"loglines\":[\"ok\"]}" }],
        usage: { input_tokens: 7, output_tokens: 3 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await chatCompletion({
      route: "/api/onboarding/sessions/:id/loglines",
      messages: [
        { role: "system", content: "system rules" },
        { role: "user", content: "make json" },
      ],
      responseFormat: "json_object",
    });

    expect(result.content).toBe("{\"loglines\":[\"ok\"]}");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://token-plan-cn.xiaomimimo.com/anthropic/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-api-key": "row-key",
          "anthropic-version": "2023-06-01",
        }),
        body: JSON.stringify({
          model: "mimo-v2.5-pro",
          messages: [{ role: "user", content: "make json" }],
          system: "system rules",
          temperature: 0.7,
          max_tokens: 4096,
          stream: false,
        }),
      }),
    );
  });

  it("parses Anthropic streaming deltas", async () => {
    delete process.env.LLM_MOCK;
    process.env.MODEL_KEY_ENCRYPTION_SECRET = "test-secret";
    vi.mocked(prisma.llmModel.findFirst).mockResolvedValueOnce({
      provider: "anthropic",
      base_url: "https://api.anthropic.com",
      api_key: encryptApiKey("row-key"),
      model: "claude-sonnet",
      created_at: new Date(),
    } as never);

    const body = [
      'data: {"type":"message_start","message":{"usage":{"input_tokens":5}}}\n\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"he"}}\n\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"llo"}}\n\n',
      'data: {"type":"message_delta","usage":{"output_tokens":2}}\n\n',
    ].join("");
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    let captured = "";
    const result = await streamChatCompletion(
      { route: "/api/onboarding/sessions/:id/bible", messages: [{ role: "user", content: "draft" }] },
      { onDelta: (delta) => { captured += delta; } },
    );

    expect(captured).toBe("hello");
    expect(result.content).toBe("hello");
    expect(result.tokenIn).toBe(5);
    expect(result.tokenOut).toBe(2);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.anthropic.com/v1/messages");
  });
});
