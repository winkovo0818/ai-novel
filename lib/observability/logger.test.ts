import { afterEach, describe, expect, it, vi } from "vitest";

import { errorMessage, logError, logInfo, logWarn } from "./logger";

describe("observability logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes one JSON line with stable event fields", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    logInfo("llm.call", {
      route: "/test",
      token_in: 12,
      skipped: undefined,
    });

    expect(log).toHaveBeenCalledOnce();
    const parsed = JSON.parse(String(log.mock.calls[0][0])) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      level: "info",
      event: "llm.call",
      route: "/test",
      token_in: 12,
    });
    expect(parsed.ts).toEqual(expect.any(String));
    expect(parsed).not.toHaveProperty("skipped");
  });

  it("routes warn and error levels to matching console methods", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    logWarn("quota.failed", { mode: "allow" });
    logError("quota.failed", { mode: "block" });

    expect(warn).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
    expect(JSON.parse(String(warn.mock.calls[0][0])).level).toBe("warn");
    expect(JSON.parse(String(error.mock.calls[0][0])).level).toBe("error");
  });

  it("normalizes unknown errors into strings", () => {
    expect(errorMessage(new Error("db down"))).toBe("db down");
    expect(errorMessage("plain")).toBe("plain");
    expect(errorMessage(null)).toBe("null");
  });
});
