import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cleanupExpiredDraftSessions = vi.fn();

vi.mock("@/lib/agent/draftSession", () => ({
  cleanupExpiredDraftSessions,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function buildRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/cron/draft-sessions/cleanup", { headers });
}

describe("GET /api/cron/draft-sessions/cleanup", () => {
  it("returns 503 when CRON_SECRET is unset", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const { GET } = await import("./route");

    const res = await GET(buildRequest({ authorization: "Bearer anything" }));

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "cron endpoint disabled (CRON_SECRET unset)",
    });
    expect(cleanupExpiredDraftSessions).not.toHaveBeenCalled();
  });

  it("returns 401 when the bearer token is missing", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    const { GET } = await import("./route");

    const res = await GET(buildRequest());

    expect(res.status).toBe(401);
    expect(cleanupExpiredDraftSessions).not.toHaveBeenCalled();
  });

  it("returns 401 when the bearer token is wrong", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    const { GET } = await import("./route");

    const res = await GET(buildRequest({ authorization: "Bearer wrong" }));

    expect(res.status).toBe(401);
    expect(cleanupExpiredDraftSessions).not.toHaveBeenCalled();
  });

  it("runs cleanup and returns the deleted count when authorized", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    cleanupExpiredDraftSessions.mockResolvedValue(7);
    const { GET } = await import("./route");

    const res = await GET(buildRequest({ authorization: "Bearer secret" }));

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true, deleted: 7 });
    expect(cleanupExpiredDraftSessions).toHaveBeenCalledTimes(1);
  });

  it("returns 500 without leaking internals when cleanup throws", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    cleanupExpiredDraftSessions.mockRejectedValue(new Error("db password leaked here"));
    const { GET } = await import("./route");

    const res = await GET(buildRequest({ authorization: "Bearer secret" }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "draft_session_cleanup_failed" });
  });
});
