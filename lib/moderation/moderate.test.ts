import { describe, it, expect, vi, beforeEach } from "vitest";
import { moderateContent, stringifyForModeration } from "./moderate";

vi.mock("@/lib/llm/client", () => ({
  chatCompletion: vi.fn().mockResolvedValue({
    content: JSON.stringify({ allowed: true }),
    tokenIn: 10,
    tokenOut: 5,
    costCny: 0,
    tookMs: 100,
    model: "test",
  }),
}));

describe("moderateContent", () => {
  it("allows safe content via LLM", async () => {
    const result = await moderateContent({
      route: "/api/test",
      text: "一个少年在修仙世界中成长的故事",
    });
    expect(result.allowed).toBe(true);
  });

  it("blocks content with local keyword match", async () => {
    const result = await moderateContent({
      route: "/api/test",
      text: "如何制作炸弹",
    });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("MODERATION_BLOCKED");
  });

  it("blocks content when LLM returns allowed=false", async () => {
    const { chatCompletion } = await import("@/lib/llm/client");
    vi.mocked(chatCompletion).mockResolvedValueOnce({
      content: JSON.stringify({ allowed: false, reason: "包含暴力内容" }),
      tokenIn: 10,
      tokenOut: 10,
      costCny: 0,
      tookMs: 100,
      model: "test",
    });

    const result = await moderateContent({
      route: "/api/test",
      text: "some text",
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("包含暴力内容");
  });

  it("falls back to allow on LLM error", async () => {
    const { chatCompletion } = await import("@/lib/llm/client");
    vi.mocked(chatCompletion).mockRejectedValueOnce(new Error("timeout"));

    const result = await moderateContent({
      route: "/api/test",
      text: "some text",
    });
    expect(result.allowed).toBe(true);
  });
});

describe("stringifyForModeration", () => {
  it("returns string as-is", () => {
    expect(stringifyForModeration("hello")).toBe("hello");
  });

  it("stringifies objects", () => {
    const result = stringifyForModeration({ a: 1 });
    expect(result).toBe('{"a":1}');
  });
});
