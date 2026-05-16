import { beforeEach, describe, expect, it, vi } from "vitest";

const findUniqueChapter = vi.fn();
const findManyVersions = vi.fn();
const getRequiredUserId = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    chapterDraft: { findUnique: findUniqueChapter },
    chapterVersion: { findMany: findManyVersions },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getRequiredUserId,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/chapters/[id]/versions ownership", () => {
  it("returns 404 when chapter belongs to another user", async () => {
    findUniqueChapter.mockResolvedValue({
      id: "chapter-1",
      novel: { user_id: "owner-1" },
    });
    getRequiredUserId.mockResolvedValue("owner-2");

    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: "chapter-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe("CHAPTER_NOT_FOUND");
    expect(findManyVersions).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    findUniqueChapter.mockResolvedValue({
      id: "chapter-1",
      novel: { user_id: "owner-1" },
    });
    getRequiredUserId.mockRejectedValue(new Error("UNAUTHORIZED"));

    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: "chapter-1" }),
    });
    expect(res.status).toBe(401);
    expect(findManyVersions).not.toHaveBeenCalled();
  });

  it("returns 404 when chapter does not exist", async () => {
    findUniqueChapter.mockResolvedValue(null);

    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
    expect(findManyVersions).not.toHaveBeenCalled();
  });
});
