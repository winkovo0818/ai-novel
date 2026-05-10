import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const findMany = vi.fn();
const getUser = vi.fn();
const listUsers = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    userRole: { findUnique, findMany },
  },
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { admin: { listUsers } } }),
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

describe("GET /api/admin/users", () => {
  it("returns 401 when unauthenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/admin/users"));
    expect(res.status).toBe(401);
    expect(listUsers).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is not admin", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "user@example.com" } },
      error: null,
    });
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/admin/users"));
    expect(res.status).toBe(403);
    expect(listUsers).not.toHaveBeenCalled();
  });

  it("joins supabase users with their roles", async () => {
    asAdminViaEnv("admin-1");
    listUsers.mockResolvedValue({
      data: {
        users: [
          { id: "admin-1", email: "boss@example.com", created_at: "2026-01-01", last_sign_in_at: "2026-05-09" },
          { id: "u-2", email: "writer@example.com", created_at: "2026-02-01", last_sign_in_at: null },
        ],
      },
      error: null,
    });
    findMany.mockResolvedValue([{ user_id: "admin-1", role: "admin" }]);

    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/admin/users?page=1&perPage=50"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.users).toEqual([
      {
        id: "admin-1",
        email: "boss@example.com",
        created_at: "2026-01-01",
        last_sign_in_at: "2026-05-09",
        roles: ["admin"],
      },
      {
        id: "u-2",
        email: "writer@example.com",
        created_at: "2026-02-01",
        last_sign_in_at: null,
        roles: [],
      },
    ]);
    expect(listUsers).toHaveBeenCalledWith({ page: 1, perPage: 50 });
  });

  it("returns 502 when supabase admin API fails", async () => {
    asAdminViaEnv();
    listUsers.mockResolvedValue({ data: { users: [] }, error: { message: "rate limited" } });
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/admin/users"));
    expect(res.status).toBe(502);
  });
});
