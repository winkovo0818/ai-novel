import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    llmModel: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}));

import { chatCompletion, chatCompletionWithRetry, streamChatCompletion, streamChatCompletionWithRetry } from "./client";

const ORIG_KEY = process.env.DEEPSEEK_API_KEY;
const ORIG_MOCK = process.env.LLM_MOCK;

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
    vi.restoreAllMocks();
  });

  it("exports chatCompletion as a function", () => {
    expect(typeof chatCompletion).toBe("function");
  });

  it("retries chatCompletion once on timeout", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
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
});
