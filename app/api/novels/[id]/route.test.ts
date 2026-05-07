import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    novel: { findUnique },
  },
}));

describe("GET /api/novels/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a novel with bible and chapters for editor hydration", async () => {
    const { GET } = await import("./route");
    const novel = {
      id: "novel-1",
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
