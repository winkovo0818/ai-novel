import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const update = vi.fn();
const updateMany = vi.fn();
const deleteFn = vi.fn();
const userRoleFindUnique = vi.fn();
const getCurrentUser = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    embeddingModel: { update, updateMany, delete: deleteFn },
    userRole: { findUnique: userRoleFindUnique },
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
  userRoleFindUnique.mockResolvedValue(null);
  process.env.MODEL_KEY_ENCRYPTION_SECRET = "test-secret-key-for-encryption-32chars!";
  delete process.env.ADMIN_USER_IDS;
  delete process.env.ADMIN_EMAILS;
});

function asAdminViaEnv(userId = "admin-1") {
  getCurrentUser.mockResolvedValue({ id: userId, email: null });
  process.env.ADMIN_USER_IDS = userId;
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("PATCH /api/embedding-models/[id]", () => {
  it("returns 403 for non-admin", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1", email: null });
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ name: "n2" }),
      }),
      ctx("m1"),
    );
    expect(res.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects dim != 1024 even on patch", async () => {
    asAdminViaEnv();
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ dim: 768 }),
      }),
      ctx("m1"),
    );
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("unsets other defaults globally when promoting (excluding self)", async () => {
    asAdminViaEnv();
    update.mockResolvedValue({ id: "m1", api_key: "enc:abc" });
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ is_default: true }),
      }),
      ctx("m1"),
    );
    expect(res.status).toBe(200);
    expect(updateMany).toHaveBeenCalledWith({
      where: { is_default: true, id: { not: "m1" } },
      data: { is_default: false },
    });
    expect(update).toHaveBeenCalledWith({ where: { id: "m1" }, data: { is_default: true } });
  });

  it("does not encrypt when api_key is omitted", async () => {
    asAdminViaEnv();
    update.mockResolvedValue({ id: "m1", api_key: "enc:existing" });
    const { PATCH } = await import("./route");
    await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ name: "renamed" }),
      }),
      ctx("m1"),
    );
    expect(update).toHaveBeenCalledWith({ where: { id: "m1" }, data: { name: "renamed" } });
  });
});

describe("DELETE /api/embedding-models/[id]", () => {
  it("returns 403 for non-admin", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1", email: null });
    const { DELETE } = await import("./route");
    const res = await DELETE(new Request("http://localhost"), ctx("m1"));
    expect(res.status).toBe(403);
    expect(deleteFn).not.toHaveBeenCalled();
  });

  it("deletes the row when caller is admin", async () => {
    asAdminViaEnv();
    deleteFn.mockResolvedValue({ id: "m1" });
    const { DELETE } = await import("./route");
    const res = await DELETE(new Request("http://localhost"), ctx("m1"));
    expect(res.status).toBe(200);
    expect(deleteFn).toHaveBeenCalledWith({ where: { id: "m1" } });
  });
});
