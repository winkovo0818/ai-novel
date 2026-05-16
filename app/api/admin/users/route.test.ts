import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const findMany = vi.fn();
const userFindMany = vi.fn();
const getCurrentUser = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    userRole: { findUnique, findMany },
    user: { findMany: userFindMany },
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

describe("GET /api/admin/users", () => {
  it("returns 401 when unauthenticated", async () => {
    getCurrentUser.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/admin/users"));
    expect(res.status).toBe(401);
    expect(userFindMany).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is not admin", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1", email: "user@example.com" });
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/admin/users"));
    expect(res.status).toBe(403);
    expect(userFindMany).not.toHaveBeenCalled();
  });

  it("joins local users with their roles", async () => {
    asAdminViaEnv("admin-1");
    userFindMany.mockResolvedValue([
      { id: "admin-1", email: "boss@example.com", created_at: new Date("2026-01-01T00:00:00.000Z") },
      { id: "u-2", email: "writer@example.com", created_at: new Date("2026-02-01T00:00:00.000Z") },
    ]);
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
        created_at: "2026-01-01T00:00:00.000Z",
        last_sign_in_at: null,
        roles: ["admin"],
      },
      {
        id: "u-2",
        email: "writer@example.com",
        created_at: "2026-02-01T00:00:00.000Z",
        last_sign_in_at: null,
        roles: [],
      },
    ]);
    expect(userFindMany).toHaveBeenCalledWith({
      orderBy: { created_at: "desc" },
      skip: 0,
      take: 50,
      select: { id: true, email: true, created_at: true },
    });
  });
});
