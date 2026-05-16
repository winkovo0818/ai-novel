import { beforeEach, describe, expect, it, vi } from "vitest";

const authorizeOnboardingSession = vi.fn();
const isRateLimited = vi.fn();
const checkQuota = vi.fn();
const chatCompletionWithRetry = vi.fn();
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

vi.mock("@/lib/llm/client", () => ({
  chatCompletionWithRetry,
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
});

function buildRequest(body: unknown) {
  return new Request("http://localhost/x", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const validBody = { regenerate: false };

describe("POST /api/onboarding/sessions/[id]/loglines — auth + input gating", () => {
  it("returns 400 INVALID_INPUT when body is malformed", async () => {
    const { POST } = await import("./route");
    const res = await POST(buildRequest({ regenerate: "not-a-boolean" }), {
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
    expect(chatCompletionWithRetry).not.toHaveBeenCalled();
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
    expect(chatCompletionWithRetry).not.toHaveBeenCalled();
  });

  it("returns 429 RATE_LIMITED when caller exceeds rate limit", async () => {
    authorizeOnboardingSession.mockResolvedValue({
      ok: true,
      userId: "user-1",
      session: { id: "session-1", genre_main: "web", genre_sub: "xuanhuan" },
    });
    isRateLimited.mockResolvedValue(true);

    const { POST } = await import("./route");
    const res = await POST(buildRequest(validBody), {
      params: Promise.resolve({ id: "session-1" }),
    });

    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error.code).toBe("RATE_LIMITED");
    expect(chatCompletionWithRetry).not.toHaveBeenCalled();
  });

  it("returns 429 QUOTA_EXCEEDED when caller is over quota", async () => {
    authorizeOnboardingSession.mockResolvedValue({
      ok: true,
      userId: "user-1",
      session: { id: "session-1", genre_main: "web", genre_sub: "xuanhuan" },
    });
    checkQuota.mockResolvedValue({ allowed: false, code: "QUOTA_EXCEEDED", reason: "Over" });

    const { POST } = await import("./route");
    const res = await POST(buildRequest(validBody), {
      params: Promise.resolve({ id: "session-1" }),
    });

    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error.code).toBe("QUOTA_EXCEEDED");
    expect(chatCompletionWithRetry).not.toHaveBeenCalled();
  });

  it("passes the saved title and genre labels into the logline prompt", async () => {
    authorizeOnboardingSession.mockResolvedValue({
      ok: true,
      userId: "user-1",
      session: {
        id: "session-1",
        title: "青铜雨巷",
        genre_main: "literary",
        genre_sub: "江南市井、代际创伤、现实主义",
      },
    });
    chatCompletionWithRetry.mockResolvedValue({
      content: JSON.stringify({
        loglines: [
          "青铜雨巷里，修伞匠追索父亲沉默半生的旧案，逼出三代人的创伤真相。",
          "一条即将拆迁的雨巷牵出家族旧债，年轻记者在现实主义追问中重写故乡。",
          "青铜匠人的遗物重现江南雨巷，让母女两代不得不面对被隐瞒的时代伤痕。",
          "小城雨巷的老茶馆将关闭，返乡青年在邻里证词中拼出祖辈失语的历史。",
          "一场梅雨困住江南旧街，也困住三代人的秘密，直到失踪多年的信件归来。",
        ],
      }),
      tokenIn: 1,
      tokenOut: 1,
      costCny: 0,
      tookMs: 1,
      model: "test",
    });
    update.mockResolvedValue({});

    const { POST } = await import("./route");
    const res = await POST(buildRequest(validBody), {
      params: Promise.resolve({ id: "session-1" }),
    });

    expect(res.status).toBe(200);
    const messages = chatCompletionWithRetry.mock.calls[0][0].messages;
    const userMessage = messages.find((message: { role: string }) => message.role === "user");
    expect(userMessage.content).toContain("青铜雨巷");
    expect(userMessage.content).toContain("严肃文学");
    expect(userMessage.content).toContain("江南市井、代际创伤、现实主义");
    expect(update).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: { logline_suggestions: expect.any(Array) },
    });
  });
});
