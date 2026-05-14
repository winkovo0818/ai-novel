import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cleanupExpiredModerationAudits = vi.fn();

vi.mock("@/lib/moderation/moderate", () => ({
  cleanupExpiredModerationAudits,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function buildRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/cron/moderation-audits/cleanup", { headers });
}

describe("GET /api/cron/moderation-audits/cleanup", () => {
  it("returns 503 when CRON_SECRET is unset", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const { GET } = await import("./route");

    const res = await GET(buildRequest({ authorization: "Bearer anything" }));

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "cron endpoint disabled (CRON_SECRET unset)",
    });
    expect(cleanupExpiredModerationAudits).not.toHaveBeenCalled();
  });

  it("returns 401 when the bearer token is missing", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    const { GET } = await import("./route");

    const res = await GET(buildRequest());

    expect(res.status).toBe(401);
    expect(cleanupExpiredModerationAudits).not.toHaveBeenCalled();
  });

  it("runs cleanup and returns the deleted count when authorized", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    cleanupExpiredModerationAudits.mockResolvedValue(12);
    const { GET } = await import("./route");

    const res = await GET(buildRequest({ authorization: "Bearer secret" }));

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true, deleted: 12 });
    expect(cleanupExpiredModerationAudits).toHaveBeenCalledTimes(1);
  });

  it("returns 500 without leaking internals when cleanup throws", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    cleanupExpiredModerationAudits.mockRejectedValue(new Error("db password leaked here"));
    const { GET } = await import("./route");

    const res = await GET(buildRequest({ authorization: "Bearer secret" }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "moderation_audit_cleanup_failed" });
  });
});
