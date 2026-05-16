import { describe, expect, it, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const refreshSummaries = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    novel: { findUnique },
  },
}));

vi.mock("@/lib/agent/summaries", () => ({
  refreshSummaries,
}));

describe("POST /api/novels/[id]/summaries/refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns 401 when unauthenticated", async () => {
    findUnique.mockResolvedValue({ id: "n1", user_id: "user-1", bible: { id: "b1" } });
    vi.doMock("@/lib/auth/session", () => ({
      getRequiredUserId: vi.fn().mockRejectedValue(new Error("UNAUTHORIZED")),
    }));
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/x", { method: "POST" }),
      { params: Promise.resolve({ id: "n1" }) },
    );
    expect(res.status).toBe(401);
    expect(refreshSummaries).not.toHaveBeenCalled();
  });

  it("returns 404 for a novel owned by another user", async () => {
    vi.doMock("@/lib/auth/session", () => ({
      getRequiredUserId: vi.fn().mockResolvedValue("user-1"),
    }));
    findUnique.mockResolvedValue({ id: "n1", user_id: "owner-1", bible: { id: "b1" } });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/x", { method: "POST" }),
      { params: Promise.resolve({ id: "n1" }) },
    );
    expect(res.status).toBe(404);
    expect(refreshSummaries).not.toHaveBeenCalled();
  });

  it("returns 404 when novel does not exist", async () => {
    vi.doMock("@/lib/auth/session", () => ({
      getRequiredUserId: vi.fn().mockResolvedValue("user-1"),
    }));
    findUnique.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/x", { method: "POST" }),
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(res.status).toBe(404);
    expect(refreshSummaries).not.toHaveBeenCalled();
  });

  it("refreshes summaries when caller is owner", async () => {
    vi.doMock("@/lib/auth/session", () => ({
      getRequiredUserId: vi.fn().mockResolvedValue("user-1"),
    }));
    findUnique.mockResolvedValue({ id: "n1", user_id: "user-1", bible: { id: "b1" } });
    refreshSummaries.mockResolvedValue({ volumeSummaries: [], novelSummary: null });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/x", { method: "POST" }),
      { params: Promise.resolve({ id: "n1" }) },
    );
    expect(res.status).toBe(200);
    expect(refreshSummaries).toHaveBeenCalledWith("n1");
  });
});
