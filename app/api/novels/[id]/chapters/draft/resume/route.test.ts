import { beforeEach, describe, expect, it, vi } from "vitest";

const getResumableDraftSession = vi.fn();
const dismissDraftSession = vi.fn();
const findUnique = vi.fn();
const getRequiredUserId = vi.fn();
const isRateLimited = vi.fn();

vi.mock("@/lib/agent/draftSession", () => ({
  getResumableDraftSession,
  dismissDraftSession,
}));

vi.mock("@/lib/db", () => ({
  prisma: { novel: { findUnique } },
}));

vi.mock("@/utils/supabase/auth", () => ({
  getRequiredUserId,
}));

vi.mock("@/lib/auth/rateLimit", () => ({
  isRateLimited,
}));

beforeEach(() => {
  vi.clearAllMocks();
  isRateLimited.mockResolvedValue(false);
});

function buildRequest(query: string, method: "GET" | "DELETE" = "GET") {
  return new Request(`http://localhost/api/novels/n-1/chapters/draft/resume?${query}`, { method });
}

const ctx = { params: Promise.resolve({ id: "n-1" }) };

describe("GET /api/novels/[id]/chapters/draft/resume", () => {
  it("returns 400 INVALID_INPUT when chapter_index is missing or non-positive", async () => {
    const { GET } = await import("./route");
    const res1 = await GET(buildRequest(""), ctx);
    expect(res1.status).toBe(400);

    const res2 = await GET(buildRequest("chapter_index=0"), ctx);
    expect(res2.status).toBe(400);

    const res3 = await GET(buildRequest("chapter_index=abc"), ctx);
    expect(res3.status).toBe(400);
    expect(getRequiredUserId).not.toHaveBeenCalled();
  });

  it("returns 401 when the caller is not authenticated", async () => {
    getRequiredUserId.mockRejectedValue(new Error("UNAUTHORIZED"));
    const { GET } = await import("./route");

    const res = await GET(buildRequest("chapter_index=1"), ctx);
    expect(res.status).toBe(401);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("returns 429 RATE_LIMITED when caller exceeds rate limit (P0-11)", async () => {
    getRequiredUserId.mockResolvedValue("user-1");
    isRateLimited.mockResolvedValue(true);
    const { GET } = await import("./route");

    const res = await GET(buildRequest("chapter_index=1"), ctx);
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error.code).toBe("RATE_LIMITED");
    expect(findUnique).not.toHaveBeenCalled();
    expect(getResumableDraftSession).not.toHaveBeenCalled();
  });

  it("returns 404 when the novel does not exist", async () => {
    getRequiredUserId.mockResolvedValue("user-1");
    findUnique.mockResolvedValue(null);
    const { GET } = await import("./route");

    const res = await GET(buildRequest("chapter_index=1"), ctx);
    expect(res.status).toBe(404);
    expect(getResumableDraftSession).not.toHaveBeenCalled();
  });

  it("returns 404 when the novel belongs to a different user", async () => {
    getRequiredUserId.mockResolvedValue("user-1");
    findUnique.mockResolvedValue({ user_id: "user-2" });
    const { GET } = await import("./route");

    const res = await GET(buildRequest("chapter_index=1"), ctx);
    expect(res.status).toBe(404);
    expect(getResumableDraftSession).not.toHaveBeenCalled();
  });

  it("returns 404 NO_DRAFT_SESSION when no buffered session exists", async () => {
    getRequiredUserId.mockResolvedValue("user-1");
    findUnique.mockResolvedValue({ user_id: "user-1" });
    getResumableDraftSession.mockResolvedValue(null);
    const { GET } = await import("./route");

    const res = await GET(buildRequest("chapter_index=1"), ctx);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe("NO_DRAFT_SESSION");
  });

  it("returns the buffered session payload on the happy path", async () => {
    getRequiredUserId.mockResolvedValue("user-1");
    findUnique.mockResolvedValue({ user_id: "user-1" });
    const updatedAt = new Date("2026-05-12T01:23:45Z");
    getResumableDraftSession.mockResolvedValue({
      id: "ds-1",
      status: "completed",
      buffer: "hello",
      errorCode: null,
      errorMessage: null,
      retrieval: { status: "ok" },
      chapterIndex: 3,
      updatedAt,
    });
    const { GET } = await import("./route");

    const res = await GET(buildRequest("chapter_index=3"), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data).toEqual({
      id: "ds-1",
      status: "completed",
      buffer: "hello",
      error_code: null,
      error_message: null,
      retrieval: { status: "ok" },
      chapter_index: 3,
      updated_at: updatedAt.toISOString(),
    });
  });
});

describe("DELETE /api/novels/[id]/chapters/draft/resume", () => {
  it("returns 400 when chapter_index is missing", async () => {
    const { DELETE } = await import("./route");
    const res = await DELETE(buildRequest("", "DELETE"), ctx);
    expect(res.status).toBe(400);
  });

  it("requires auth", async () => {
    getRequiredUserId.mockRejectedValue(new Error("UNAUTHORIZED"));
    const { DELETE } = await import("./route");
    const res = await DELETE(buildRequest("chapter_index=2", "DELETE"), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 429 RATE_LIMITED when caller exceeds rate limit (P0-11)", async () => {
    getRequiredUserId.mockResolvedValue("user-1");
    isRateLimited.mockResolvedValue(true);
    const { DELETE } = await import("./route");

    const res = await DELETE(buildRequest("chapter_index=2", "DELETE"), ctx);
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error.code).toBe("RATE_LIMITED");
    expect(findUnique).not.toHaveBeenCalled();
    expect(dismissDraftSession).not.toHaveBeenCalled();
  });

  it("returns 404 when the novel is not owned by the caller", async () => {
    getRequiredUserId.mockResolvedValue("user-1");
    findUnique.mockResolvedValue({ user_id: "user-2" });
    const { DELETE } = await import("./route");

    const res = await DELETE(buildRequest("chapter_index=2", "DELETE"), ctx);
    expect(res.status).toBe(404);
    expect(dismissDraftSession).not.toHaveBeenCalled();
  });

  it("dismisses the session on the happy path", async () => {
    getRequiredUserId.mockResolvedValue("user-1");
    findUnique.mockResolvedValue({ user_id: "user-1" });
    dismissDraftSession.mockResolvedValue(undefined);
    const { DELETE } = await import("./route");

    const res = await DELETE(buildRequest("chapter_index=2", "DELETE"), ctx);
    expect(res.status).toBe(200);
    expect(dismissDraftSession).toHaveBeenCalledWith("user-1", "n-1", 2);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.dismissed).toBe(true);
  });
});
