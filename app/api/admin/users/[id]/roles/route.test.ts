import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const upsert = vi.fn();
const userFindUnique = vi.fn();
const getCurrentUser = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    userRole: { findUnique, upsert },
    user: { findUnique: userFindUnique },
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
  findUnique.mockResolvedValue(null);
  delete process.env.ADMIN_USER_IDS;
  delete process.env.ADMIN_EMAILS;
});

function asAdminViaEnv(userId = "admin-1") {
  getCurrentUser.mockResolvedValue({ id: userId, email: null });
  process.env.ADMIN_USER_IDS = userId;
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admin/users/u-2/roles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ id: "u-2" }) };

describe("POST /api/admin/users/[id]/roles", () => {
  it("returns 401 when unauthenticated", async () => {
    getCurrentUser.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ role: "admin" }), ctx);
    expect(res.status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is not admin", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1", email: null });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ role: "admin" }), ctx);
    expect(res.status).toBe(403);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("returns 400 when role is not in allowlist", async () => {
    asAdminViaEnv();
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ role: "embedding_admin" }), ctx);
    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("returns 404 when target user does not exist", async () => {
    asAdminViaEnv();
    userFindUnique.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ role: "admin" }), ctx);
    expect(res.status).toBe(404);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("upserts the role with granted_by set to caller", async () => {
    asAdminViaEnv("admin-1");
    userFindUnique.mockResolvedValue({ id: "u-2" });
    upsert.mockResolvedValue({ user_id: "u-2", role: "admin" });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ role: "admin" }), ctx);
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith({
      where: { user_id_role: { user_id: "u-2", role: "admin" } },
      create: { user_id: "u-2", role: "admin", granted_by: "admin-1" },
      update: {},
    });
    const json = await res.json();
    expect(json.data).toEqual({ user_id: "u-2", role: "admin", granted_by: "admin-1" });
  });
});
