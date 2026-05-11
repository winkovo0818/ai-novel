import { beforeEach, describe, expect, it, vi } from "vitest";

const authorizeOnboardingSession = vi.fn();
const isRateLimited = vi.fn();
const checkQuota = vi.fn();
const moderateContent = vi.fn();
const streamChatCompletionWithRetry = vi.fn();
const update = vi.fn();

vi.mock("@/lib/auth/onboardingAccess", () => ({
  authorizeOnboardingSession,
}));

vi.mock("@/lib/auth/rateLimit", () => ({
  isRateLimited,
}));

vi.mock("@/lib/llm/usage", () => ({
  checkQuota,
}));

vi.mock("@/lib/moderation/moderate", () => ({
  moderateContent,
  stringifyForModeration: (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v)),
}));

vi.mock("@/lib/llm/client", () => ({
  streamChatCompletionWithRetry,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    onboardingSession: { update },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  isRateLimited.mockResolvedValue(false);
  checkQuota.mockResolvedValue({ allowed: true });
  moderateContent.mockResolvedValue({ allowed: true });
});

function buildRequest(body: unknown) {
  return new Request("http://localhost/x", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const validBody = {
  logline: "A young hero saves the world.",
  answers: { theme: "redemption" },
  profile: { genre_main: "web", genre_sub: "xuanhuan" },
};

describe("POST /api/onboarding/sessions/[id]/bible — auth + input gating", () => {
  it("returns 400 INVALID_INPUT when body is malformed", async () => {
    const { POST } = await import("./route");
    const res = await POST(buildRequest({ logline: "" }), {
      params: Promise.resolve({ id: "session-1" }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("INVALID_INPUT");
    expect(authorizeOnboardingSession).not.toHaveBeenCalled();
  });

  it("returns 401 when the caller is not authenticated", async () => {
    authorizeOnboardingSession.mockResolvedValue({
      ok: false,
      status: 401,
      code: "UNAUTHORIZED",
      message: "Login required",
    });

    const { POST } = await import("./route");
    const res = await POST(buildRequest(validBody), {
      params: Promise.resolve({ id: "session-1" }),
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe("UNAUTHORIZED");
    expect(streamChatCompletionWithRetry).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("returns 404 when session belongs to another user", async () => {
    authorizeOnboardingSession.mockResolvedValue({
      ok: false,
      status: 404,
      code: "SESSION_NOT_FOUND",
      message: "Onboarding session not found",
    });

    const { POST } = await import("./route");
    const res = await POST(buildRequest(validBody), {
      params: Promise.resolve({ id: "someone-elses" }),
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe("SESSION_NOT_FOUND");
    expect(streamChatCompletionWithRetry).not.toHaveBeenCalled();
  });

  it("returns 429 RATE_LIMITED when caller exceeds rate limit", async () => {
    authorizeOnboardingSession.mockResolvedValue({
      ok: true,
      userId: "user-1",
      session: { id: "session-1", regeneration_count: 0 },
    });
    isRateLimited.mockResolvedValue(true);

    const { POST } = await import("./route");
    const res = await POST(buildRequest(validBody), {
      params: Promise.resolve({ id: "session-1" }),
    });

    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error.code).toBe("RATE_LIMITED");
    expect(streamChatCompletionWithRetry).not.toHaveBeenCalled();
  });

  it("returns 429 REGEN_LIMIT_EXCEEDED when regen count is at cap", async () => {
    authorizeOnboardingSession.mockResolvedValue({
      ok: true,
      userId: "user-1",
      session: { id: "session-1", regeneration_count: 3 },
    });

    const { POST } = await import("./route");
    const res = await POST(buildRequest(validBody), {
      params: Promise.resolve({ id: "session-1" }),
    });

    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error.code).toBe("REGEN_LIMIT_EXCEEDED");
    expect(streamChatCompletionWithRetry).not.toHaveBeenCalled();
  });

  it("returns 400 when input moderation blocks the prompt", async () => {
    authorizeOnboardingSession.mockResolvedValue({
      ok: true,
      userId: "user-1",
      session: { id: "session-1", regeneration_count: 0 },
    });
    moderateContent.mockResolvedValue({
      allowed: false,
      code: "MODERATION_BLOCKED",
      reason: "Blocked",
    });

    const { POST } = await import("./route");
    const res = await POST(buildRequest(validBody), {
      params: Promise.resolve({ id: "session-1" }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("MODERATION_BLOCKED");
    expect(streamChatCompletionWithRetry).not.toHaveBeenCalled();
  });
});
