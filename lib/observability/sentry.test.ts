import { afterEach, describe, expect, it, vi } from "vitest";

import { captureException, sentryForTest } from "./sentry";

describe("Sentry DSN capture", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("stays disabled when SENTRY_DSN is unset", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const result = await captureException(new Error("boom"));

    expect(result).toEqual({ sent: false, reason: "disabled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("builds the envelope endpoint from a DSN with an org path prefix", () => {
    expect(
      sentryForTest.parseDsn("https://public@example.com/sentry/42"),
    ).toEqual({
      dsn: "https://public@example.com/sentry/42",
      envelopeUrl: "https://example.com/sentry/api/42/envelope/",
    });
  });

  it("posts a Sentry envelope with request context", async () => {
    vi.stubEnv("SENTRY_DSN", "https://public@example.com/42");
    vi.stubEnv("SENTRY_ENVIRONMENT", "test");
    vi.stubEnv("SENTRY_RELEASE", "abc123");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 200 }),
    );

    const result = await captureException(new Error("route failed"), {
      source: "next.onRequestError",
      route: "/api/example",
      method: "GET",
      extra: { job_id: "job-1" },
    });

    expect(result.sent).toBe(true);
    expect(result.eventId).toMatch(/^[a-f0-9]{32}$/);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/api/42/envelope/",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/x-sentry-envelope" },
      }),
    );
    const body = String(fetchMock.mock.calls[0][1]?.body);
    const [, , eventLine] = body.trimEnd().split("\n");
    const event = JSON.parse(eventLine) as Record<string, unknown>;
    expect(event).toMatchObject({
      platform: "javascript",
      level: "error",
      environment: "test",
      release: "abc123",
      message: "route failed",
      tags: {
        source: "next.onRequestError",
        route: "/api/example",
        method: "GET",
      },
      extra: { job_id: "job-1" },
    });
    expect(event.exception).toBeTruthy();
  });

  it("generates 32 hex event ids", () => {
    expect(sentryForTest.randomEventId()).toMatch(/^[a-f0-9]{32}$/);
  });
});
