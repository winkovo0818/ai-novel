import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const getCurrentUser = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    userRole: { findUnique },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser,
}));

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  delete process.env.ADMIN_USER_IDS;
  delete process.env.ADMIN_EMAILS;
});

describe("checkAdmin", () => {
  it("returns UNAUTHORIZED when there is no current user", async () => {
    getCurrentUser.mockResolvedValue(null);
    const { checkAdmin } = await import("./admin");
    const result = await checkAdmin();
    expect(result).toEqual({ ok: false, reason: "UNAUTHORIZED" });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("returns ok when user has admin role in DB", async () => {
    getCurrentUser.mockResolvedValue({ id: "u-1", email: "person@example.com" });
    findUnique.mockResolvedValue({ user_id: "u-1" });
    const { checkAdmin } = await import("./admin");
    const result = await checkAdmin();
    expect(result).toEqual({ ok: true, userId: "u-1", email: "person@example.com" });
    expect(findUnique).toHaveBeenCalledWith({
      where: { user_id_role: { user_id: "u-1", role: "admin" } },
      select: { user_id: true },
    });
  });

  it("falls back to env allowlist (ADMIN_USER_IDS) when DB has no row", async () => {
    getCurrentUser.mockResolvedValue({ id: "u-2", email: null });
    findUnique.mockResolvedValue(null);
    process.env.ADMIN_USER_IDS = "u-2";
    const { checkAdmin } = await import("./admin");
    const result = await checkAdmin();
    expect(result.ok).toBe(true);
  });

  it("falls back to env allowlist (ADMIN_EMAILS, case-insensitive)", async () => {
    getCurrentUser.mockResolvedValue({ id: "u-3", email: "Boss@Example.com" });
    findUnique.mockResolvedValue(null);
    process.env.ADMIN_EMAILS = "boss@example.com";
    const { checkAdmin } = await import("./admin");
    const result = await checkAdmin();
    expect(result.ok).toBe(true);
  });

  it("returns FORBIDDEN when DB has no row and env has no match", async () => {
    getCurrentUser.mockResolvedValue({ id: "u-4", email: "outsider@example.com" });
    findUnique.mockResolvedValue(null);
    const { checkAdmin } = await import("./admin");
    const result = await checkAdmin();
    expect(result).toEqual({
      ok: false,
      reason: "FORBIDDEN",
      userId: "u-4",
      email: "outsider@example.com",
    });
  });

  it("falls back to env when DB query throws (schema not migrated yet)", async () => {
    getCurrentUser.mockResolvedValue({ id: "u-5", email: null });
    findUnique.mockRejectedValue(new Error("relation user_roles does not exist"));
    process.env.ADMIN_USER_IDS = "u-5";
    const { checkAdmin } = await import("./admin");
    const result = await checkAdmin();
    expect(result.ok).toBe(true);
  });
});
