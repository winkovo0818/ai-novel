import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { chatCompletion, chatCompletionWithRetry } from "./client";

const ORIG_KEY = process.env.DEEPSEEK_API_KEY;

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
    delete process.env.DEEPSEEK_API_KEY;
    await expect(
      chatCompletion({
        route: "/test",
        messages: [{ role: "user", content: "ping" }],
      }),
    ).rejects.toThrow(/DEEPSEEK_API_KEY/);
  });
});
