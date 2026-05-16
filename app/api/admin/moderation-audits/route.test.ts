import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const findMany = vi.fn();
const count = vi.fn();
const getCurrentUser = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    userRole: { findUnique },
    moderationAudit: { findMany, count },
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

describe("GET /api/admin/moderation-audits", () => {
  it("returns 401 when unauthenticated", async () => {
    getCurrentUser.mockResolvedValue(null);
    const { GET } = await import("./route");

    const res = await GET(new Request("http://localhost/api/admin/moderation-audits"));

    expect(res.status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is not admin", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1", email: null });
    const { GET } = await import("./route");

    const res = await GET(new Request("http://localhost/api/admin/moderation-audits"));

    expect(res.status).toBe(403);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("lists pending audit rows with filters and pagination", async () => {
    asAdminViaEnv();
    const row = {
      id: "audit-1",
      route: "/api/chapters/:id",
      source: "local_keyword",
      action: "block",
      outcome: "blocked",
      review_status: "pending",
      created_at: new Date("2026-05-14T00:00:00Z"),
    };
    findMany.mockResolvedValue([row]);
    count.mockResolvedValue(1);
    const { GET } = await import("./route");

    const res = await GET(
      new Request(
        "http://localhost/api/admin/moderation-audits?review_status=pending&source=local_keyword&action=block&page=2&perPage=25",
      ),
    );

    expect(res.status).toBe(200);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { review_status: "pending", source: "local_keyword", action: "block" },
        orderBy: { created_at: "desc" },
        skip: 25,
        take: 25,
      }),
    );
    expect(count).toHaveBeenCalledWith({
      where: { review_status: "pending", source: "local_keyword", action: "block" },
    });
    const json = await res.json();
    expect(json.data.items).toEqual([
      { ...row, created_at: "2026-05-14T00:00:00.000Z" },
    ]);
    expect(json.data.total).toBe(1);
  });

  it("falls back to pending for an unknown review_status filter", async () => {
    asAdminViaEnv();
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
    const { GET } = await import("./route");

    await GET(new Request("http://localhost/api/admin/moderation-audits?review_status=bogus"));

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { review_status: "pending" },
      }),
    );
  });
});
