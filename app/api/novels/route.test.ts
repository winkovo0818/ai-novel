import { describe, expect, it, vi, beforeEach } from "vitest";

const findMany = vi.fn();
const getRequiredUserId = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    novel: { findMany },
  },
}));

vi.mock("@/utils/supabase/auth", () => ({
  getRequiredUserId,
}));

describe("GET /api/novels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    getRequiredUserId.mockRejectedValue(new Error("UNAUTHORIZED"));
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe("UNAUTHORIZED");
    expect(findMany).not.toHaveBeenCalled();
  });

  it("returns novels for the authenticated user", async () => {
    getRequiredUserId.mockResolvedValue("user-1");
    findMany.mockResolvedValue([
      { id: "n1", title: "T1", created_at: new Date("2026-01-01"), chapters: [], bible: { id: "b1" } },
    ]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: "user-1" } }),
    );
  });
});
