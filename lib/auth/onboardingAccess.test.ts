import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const update = vi.fn();
const getRequiredUserId = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    onboardingSession: { findUnique, update },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getRequiredUserId,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("authorizeOnboardingSession", () => {
  it("returns 401 when the caller is not authenticated", async () => {
    getRequiredUserId.mockRejectedValue(new Error("UNAUTHORIZED"));
    const { authorizeOnboardingSession } = await import("./onboardingAccess");

    const result = await authorizeOnboardingSession("session-1");
    expect(result).toEqual({
      ok: false,
      status: 401,
      code: "UNAUTHORIZED",
      message: "Login required",
    });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when the session does not exist", async () => {
    getRequiredUserId.mockResolvedValue("user-1");
    findUnique.mockResolvedValue(null);
    const { authorizeOnboardingSession } = await import("./onboardingAccess");

    const result = await authorizeOnboardingSession("missing");
    expect(result).toEqual({
      ok: false,
      status: 404,
      code: "SESSION_NOT_FOUND",
      message: "Onboarding session not found",
    });
  });

  it("hides another user's session as 404 (not 403)", async () => {
    getRequiredUserId.mockResolvedValue("user-1");
    findUnique.mockResolvedValue({ id: "session-1", user_id: "user-2" });
    const { authorizeOnboardingSession } = await import("./onboardingAccess");

    const result = await authorizeOnboardingSession("session-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.code).toBe("SESSION_NOT_FOUND");
    }
    expect(update).not.toHaveBeenCalled();
  });

  it("passes through when session.user_id matches the caller", async () => {
    getRequiredUserId.mockResolvedValue("user-1");
    const session = { id: "session-1", user_id: "user-1" };
    findUnique.mockResolvedValue(session);
    const { authorizeOnboardingSession } = await import("./onboardingAccess");

    const result = await authorizeOnboardingSession("session-1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.userId).toBe("user-1");
      expect(result.session).toBe(session);
    }
    expect(update).not.toHaveBeenCalled();
  });

  it("claims an anonymous session for the caller", async () => {
    getRequiredUserId.mockResolvedValue("user-1");
    findUnique.mockResolvedValue({ id: "session-1", user_id: null });
    update.mockResolvedValue({ id: "session-1", user_id: "user-1" });
    const { authorizeOnboardingSession } = await import("./onboardingAccess");

    const result = await authorizeOnboardingSession("session-1");
    expect(update).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: { user_id: "user-1" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.userId).toBe("user-1");
      expect(result.session.user_id).toBe("user-1");
    }
  });
});
