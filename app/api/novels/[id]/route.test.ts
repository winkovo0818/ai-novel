import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const getRequiredUserId = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    novel: { findUnique },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getRequiredUserId,
}));

describe("GET /api/novels/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRequiredUserId.mockResolvedValue("user-1");
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
});
