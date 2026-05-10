import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const deleteFn = vi.fn();
const getUser = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    userRole: { findUnique, delete: deleteFn },
  },
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
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
  getUser.mockResolvedValue({ data: { user: { id: userId, email: null } }, error: null });
  process.env.ADMIN_USER_IDS = userId;
}

const ctx = (id: string, role: string) => ({ params: Promise.resolve({ id, role }) });

describe("DELETE /api/admin/users/[id]/roles/[role]", () => {
  it("returns 401 when unauthenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { DELETE } = await import("./route");
    const res = await DELETE(new Request("http://localhost"), ctx("u-2", "admin"));
    expect(res.status).toBe(401);
    expect(deleteFn).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is not admin", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u-1", email: null } }, error: null });
    const { DELETE } = await import("./route");
    const res = await DELETE(new Request("http://localhost"), ctx("u-2", "admin"));
    expect(res.status).toBe(403);
    expect(deleteFn).not.toHaveBeenCalled();
  });

  it("returns 400 when role is not in allowlist", async () => {
    asAdminViaEnv();
    const { DELETE } = await import("./route");
    const res = await DELETE(new Request("http://localhost"), ctx("u-2", "superuser"));
    expect(res.status).toBe(400);
    expect(deleteFn).not.toHaveBeenCalled();
  });

  it("deletes the row and reports success", async () => {
    asAdminViaEnv();
    deleteFn.mockResolvedValue({ user_id: "u-2", role: "admin" });
    const { DELETE } = await import("./route");
    const res = await DELETE(new Request("http://localhost"), ctx("u-2", "admin"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual({ user_id: "u-2", role: "admin", deleted: true });
    expect(deleteFn).toHaveBeenCalledWith({
      where: { user_id_role: { user_id: "u-2", role: "admin" } },
    });
  });

  it("treats P2025 (not found) as idempotent success", async () => {
    asAdminViaEnv();
    deleteFn.mockRejectedValue(Object.assign(new Error("Record not found"), { code: "P2025" }));
    const { DELETE } = await import("./route");
    const res = await DELETE(new Request("http://localhost"), ctx("u-2", "admin"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.deleted).toBe(false);
  });
});
