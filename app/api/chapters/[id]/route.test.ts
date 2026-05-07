import { beforeEach, describe, expect, it, vi } from "vitest";

const update = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    chapterDraft: { update },
  },
}));

describe("PATCH /api/chapters/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates chapter content and status", async () => {
    const { PATCH } = await import("./route");
    const chapter = {
      id: "chapter-1",
      content: "正文",
      status: "done",
    };
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
    update.mockRejectedValue(new Error("Record to update not found."));

    const response = await PATCH(request({ content: "正文" }), {
      params: Promise.resolve({ id: "missing" }),
    });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("CHAPTER_NOT_FOUND");
    expect(json.error.retryable).toBe(false);
  });
});

function request(body: unknown) {
  return new Request("http://localhost/api/chapters/chapter-1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
