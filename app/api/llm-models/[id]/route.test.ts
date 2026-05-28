import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const update = vi.fn();
const updateMany = vi.fn();
const del = vi.fn();
const userRoleFindUnique = vi.fn();
const auditCreate = vi.fn();
const getCurrentUser = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    llmModel: { findUnique, update, updateMany, delete: del },
    userRole: { findUnique: userRoleFindUnique },
    adminAudit: { create: auditCreate },
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
});

describe("PATCH /api/llm-models/[id]", () => {
  it("returns 401 unauthenticated", async () => {
    getCurrentUser.mockResolvedValue(null);
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("http://localhost/x", {
        method: "PATCH",
        body: JSON.stringify({ name: "n" }),
      }),
      { params: Promise.resolve({ id: "m1" }) },
    );
    expect(res.status).toBe(401);
    expect(update).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1", email: "u@example.com"  });
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("http://localhost/x", {
        method: "PATCH",
        body: JSON.stringify({ name: "n" }),
      }),
      { params: Promise.resolve({ id: "m1" }) },
    );
    expect(res.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it("updates when admin", async () => {
    getCurrentUser.mockResolvedValue({ id: "admin-1", email: null  });
    process.env.ADMIN_USER_IDS = "admin-1";
    update.mockResolvedValue({ id: "m1", name: "n" });
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("http://localhost/x", {
        method: "PATCH",
        body: JSON.stringify({ name: "n" }),
      }),
      { params: Promise.resolve({ id: "m1" }) },
    );
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ where: { id: "m1" }, data: { name: "n" } });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actor_user_id: "admin-1",
        action: "llm_model.update",
        target_type: "llm_model",
        target_id: "m1",
        metadata: { fields: ["name"], api_key_updated: false },
      }),
    });
  });

  it("audits api key updates without storing the key", async () => {
    getCurrentUser.mockResolvedValue({ id: "admin-1", email: null  });
    process.env.ADMIN_USER_IDS = "admin-1";
    update.mockResolvedValue({ id: "m1", api_key: "enc:new" });
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("http://localhost/x", {
        method: "PATCH",
        body: JSON.stringify({ api_key: "plain-secret-key" }),
      }),
      { params: Promise.resolve({ id: "m1" }) },
    );
    expect(res.status).toBe(200);
    const metadata = auditCreate.mock.calls[0][0].data.metadata;
    expect(metadata).toEqual({ fields: ["api_key_updated"], api_key_updated: true });
    expect(JSON.stringify(metadata)).not.toContain("plain-secret-key");
  });
});

describe("DELETE /api/llm-models/[id]", () => {
  it("returns 401 unauthenticated", async () => {
    getCurrentUser.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const res = await DELETE(
      new Request("http://localhost/x", { method: "DELETE" }),
      { params: Promise.resolve({ id: "m1" }) },
    );
    expect(res.status).toBe(401);
    expect(del).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1", email: "u@example.com"  });
    const { DELETE } = await import("./route");
    const res = await DELETE(
      new Request("http://localhost/x", { method: "DELETE" }),
      { params: Promise.resolve({ id: "m1" }) },
    );
    expect(res.status).toBe(403);
    expect(del).not.toHaveBeenCalled();
  });

  it("deletes when admin", async () => {
    getCurrentUser.mockResolvedValue({ id: "admin-1", email: null  });
    process.env.ADMIN_USER_IDS = "admin-1";
    del.mockResolvedValue({});
    const { DELETE } = await import("./route");
    const res = await DELETE(
      new Request("http://localhost/x", { method: "DELETE" }),
      { params: Promise.resolve({ id: "m1" }) },
    );
    expect(res.status).toBe(200);
    expect(del).toHaveBeenCalledWith({ where: { id: "m1" } });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actor_user_id: "admin-1",
        action: "llm_model.delete",
        target_type: "llm_model",
        target_id: "m1",
      }),
    });
  });
});
