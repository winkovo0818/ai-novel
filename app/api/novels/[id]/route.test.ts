import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const update = vi.fn();
const getRequiredUserId = vi.fn();
const checkAdmin = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    novel: { findUnique, update },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getRequiredUserId,
}));

vi.mock("@/lib/auth/admin", () => ({
  checkAdmin,
}));

describe("GET /api/novels/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRequiredUserId.mockResolvedValue("user-1");
    checkAdmin.mockResolvedValue({ ok: false, reason: "FORBIDDEN", userId: "user-1", email: null });
  });

  it("returns a novel with bible and chapters for editor hydration", async () => {
    const { GET } = await import("./route");
    const novel = {
      id: "novel-1",
      user_id: "user-1",
      title: "逆魂纪",
      bible: { id: "bible-1", content: { meta: { suggested_title: "逆魂纪" } } },
      chapters: [
        { id: "chapter-1", chapter_index: 1, title: "第一章", content: "正文", status: "draft" },
      ],
    };
    findUnique.mockResolvedValue(novel);

    const response = await GET(new Request("http://localhost/api/novels/novel-1"), {
      params: Promise.resolve({ id: "novel-1" }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, data: novel });
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "novel-1" },
      include: {
        bible: true,
        chapters: { orderBy: { chapter_index: "asc" } },
      },
    });
  });

  it("hides a user-owned novel from a different user", async () => {
    const { GET } = await import("./route");
    findUnique.mockResolvedValue({ id: "novel-1", user_id: "owner-1", bible: null, chapters: [] });
    getRequiredUserId.mockResolvedValue("owner-2");

    const response = await GET(new Request("http://localhost/api/novels/novel-1"), {
      params: Promise.resolve({ id: "novel-1" }),
    });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("NOVEL_NOT_FOUND");
  });

  it("returns 401 when not authenticated", async () => {
    const { GET } = await import("./route");
    findUnique.mockResolvedValue({ id: "novel-1", user_id: null, bible: null, chapters: [] });
    getRequiredUserId.mockRejectedValue(new Error("UNAUTHORIZED"));

    const response = await GET(new Request("http://localhost/api/novels/novel-1"), {
      params: Promise.resolve({ id: "novel-1" }),
    });
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects access to anonymous novel even when authenticated", async () => {
    const { GET } = await import("./route");
    findUnique.mockResolvedValue({ id: "novel-1", user_id: null, bible: null, chapters: [] });

    const response = await GET(new Request("http://localhost/api/novels/novel-1"), {
      params: Promise.resolve({ id: "novel-1" }),
    });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("NOVEL_NOT_FOUND");
  });

  it("returns NOVEL_NOT_FOUND when the novel is missing", async () => {
    const { GET } = await import("./route");
    findUnique.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/novels/missing"), {
      params: Promise.resolve({ id: "missing" }),
    });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("NOVEL_NOT_FOUND");
    expect(json.error.retryable).toBe(false);
  });

  it("hides soft-deleted novels", async () => {
    const { GET } = await import("./route");
    findUnique.mockResolvedValue({
      id: "novel-1",
      user_id: "user-1",
      deleted_at: new Date("2026-05-28T00:00:00.000Z"),
      bible: null,
      chapters: [],
    });

    const response = await GET(new Request("http://localhost/api/novels/novel-1"), {
      params: Promise.resolve({ id: "novel-1" }),
    });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("NOVEL_NOT_FOUND");
  });
});

describe("DELETE /api/novels/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRequiredUserId.mockResolvedValue("user-1");
    checkAdmin.mockResolvedValue({ ok: false, reason: "FORBIDDEN", userId: "user-1", email: null });
  });

  it("soft deletes an owned novel instead of removing rows", async () => {
    const { DELETE } = await import("./route");
    findUnique.mockResolvedValue({ id: "novel-1", user_id: "user-1", deleted_at: null });
    update.mockResolvedValue({ id: "novel-1" });

    const response = await DELETE(new Request("http://localhost/api/novels/novel-1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "novel-1" }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, data: { deleted: true, recoverable: true } });
    expect(update).toHaveBeenCalledWith({
      where: { id: "novel-1" },
      data: { deleted_at: expect.any(Date) },
      select: { id: true },
    });
  });

  it("does not delete a novel owned by another user", async () => {
    const { DELETE } = await import("./route");
    findUnique.mockResolvedValue({ id: "novel-1", user_id: "other-user", deleted_at: null });

    const response = await DELETE(new Request("http://localhost/api/novels/novel-1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "novel-1" }),
    });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("NOVEL_NOT_FOUND");
    expect(update).not.toHaveBeenCalled();
  });
});
