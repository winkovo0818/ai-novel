import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    llmModel: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}));

import { chatCompletion, chatCompletionWithRetry, streamChatCompletion } from "./client";

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
});
