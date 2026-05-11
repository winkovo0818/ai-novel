import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BLOCKED_KEYWORDS, matchBlockedKeywords, moderateContent, stringifyForModeration } from "./moderate";

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

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

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

  it("falls back to allow on LLM error in development", async () => {
    const { chatCompletion } = await import("@/lib/llm/client");
    vi.mocked(chatCompletion).mockRejectedValueOnce(new Error("timeout"));

    const result = await moderateContent({
      route: "/api/test",
      text: "some text",
    });
    expect(result.allowed).toBe(true);
  });

  it("falls back to block on LLM error in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { chatCompletion } = await import("@/lib/llm/client");
    vi.mocked(chatCompletion).mockRejectedValueOnce(new Error("timeout"));

    const result = await moderateContent({
      route: "/api/test",
      text: "some text",
    });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("MODERATION_BLOCKED");
    expect(result.reason).toContain("审核服务暂时不可用");
    vi.unstubAllEnvs();
  });

  it("allows on LLM error in review mode", async () => {
    vi.stubEnv("MODERATION_FAILURE_MODE", "review");
    const { chatCompletion } = await import("@/lib/llm/client");
    vi.mocked(chatCompletion).mockRejectedValueOnce(new Error("timeout"));

    const result = await moderateContent({
      route: "/api/test",
      text: "some text",
    });
    expect(result.allowed).toBe(true);
    vi.unstubAllEnvs();
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

describe("matchBlockedKeywords (P0-8 helper)", () => {
  it("returns null on clean text", () => {
    expect(matchBlockedKeywords("一个寻常的春日早晨,主角推开木门")).toBeNull();
  });

  it("returns a match with the firing pattern when a banned phrase is present", () => {
    const result = matchBlockedKeywords("xxxxx 制作炸弹 yyyyy");
    expect(result).not.toBeNull();
    expect(result?.pattern).toBe(BLOCKED_KEYWORDS[0]);
    expect(result?.reason).toBe("内容包含违规关键词");
  });

  it("scans every keyword, not just the first", () => {
    expect(matchBlockedKeywords("详细的诈骗教程")?.pattern.source).toMatch(/诈骗教程/);
  });

  it("preserves the same reason string as the legacy localKeywordCheck path", async () => {
    // Drive moderateContent through the local-block branch (no LLM call
    // expected) and confirm reason matches the new helper. Locks the
    // contract so future refactors can't drift the user-facing string.
    const res = await moderateContent({ route: "/test", text: "包含 杀人方法 教程" });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe("内容包含违规关键词");
  });

  it("exposes the keyword list as a readonly tuple", () => {
    // Type-level: readonly RegExp[]; behaviorally, asserting the count
    // is the cheapest guard against accidentally truncating the list.
    expect(BLOCKED_KEYWORDS.length).toBeGreaterThanOrEqual(5);
  });
});
