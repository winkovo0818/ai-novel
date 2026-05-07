import { beforeEach, describe, expect, it, vi } from "vitest";

const update = vi.fn();
const findUnique = vi.fn();
const getOptionalUserId = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    chapterDraft: { findUnique, update },
  },
}));

vi.mock("@/utils/supabase/auth", () => ({
  getOptionalUserId,
}));

describe("PATCH /api/chapters/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOptionalUserId.mockResolvedValue(null);
  });

  it("updates chapter content and status", async () => {
    const { PATCH } = await import("./route");
    const chapter = {
      id: "chapter-1",
      content: "正文",
      status: "done",
    };
    findUnique.mockResolvedValue({ id: "chapter-1", novel: { user_id: null } });
    update.mockResolvedValue(chapter);

    const response = await PATCH(request({ content: "正文", status: "done" }), {
      params: Promise.resolve({ id: "chapter-1" }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, data: chapter });
    expect(update).toHaveBeenCalledWith({
      where: { id: "chapter-1" },
      data: { content: "正文", status: "done" },
    });
  });

  it("returns CHAPTER_NOT_FOUND when the draft does not exist", async () => {
    const { PATCH } = await import("./route");
    findUnique.mockResolvedValue(null);

    const response = await PATCH(request({ content: "正文" }), {
      params: Promise.resolve({ id: "missing" }),
    });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("CHAPTER_NOT_FOUND");
    expect(json.error.retryable).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("hides a user-owned chapter from a different user", async () => {
    const { PATCH } = await import("./route");
    findUnique.mockResolvedValue({ id: "chapter-1", novel: { user_id: "owner-1" } });
    getOptionalUserId.mockResolvedValue("owner-2");

    const response = await PATCH(request({ content: "正文" }), {
      params: Promise.resolve({ id: "chapter-1" }),
    });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("CHAPTER_NOT_FOUND");
    expect(update).not.toHaveBeenCalled();
  });
});

function request(body: unknown) {
  return new Request("http://localhost/api/chapters/chapter-1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
