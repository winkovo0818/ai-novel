import { beforeEach, describe, expect, it, vi } from "vitest";

const chapterFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: { chapterDraft: { findMany: chapterFindMany } },
}));

describe("GET /api/novels/[id]/stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns stats for chapters", async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    chapterFindMany.mockResolvedValue([
      { content: "第一章正文内容".repeat(100), status: "done", updated_at: yesterday, created_at: yesterday },
      { content: "第二章正文内容".repeat(200), status: "done", updated_at: new Date(), created_at: yesterday },
    ]);
    const { GET } = await import("./route");
    const res = await GET(
      new Request("http://localhost/api/novels/novel-1/stats"),
      { params: Promise.resolve({ id: "novel-1" }) } as never,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.total_chapters).toBe(2);
    expect(json.data.done_chapters).toBe(2);
    expect(json.data.total_words).toBeGreaterThan(0);
    expect(typeof json.data.streak_days).toBe("number");
  });

  it("returns zero stats for novel with no chapters", async () => {
    chapterFindMany.mockResolvedValue([]);
    const { GET } = await import("./route");
    const res = await GET(
      new Request("http://localhost/api/novels/novel-1/stats"),
      { params: Promise.resolve({ id: "novel-1" }) } as never,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.total_chapters).toBe(0);
    expect(json.data.total_words).toBe(0);
  });
});
