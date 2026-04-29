import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { chatCompletion } from "./client";

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
