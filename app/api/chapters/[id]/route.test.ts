import { beforeEach, describe, expect, it, vi } from "vitest";

const update = vi.fn();
const deleteFn = vi.fn();
const findUnique = vi.fn();
const createVersion = vi.fn();
const getRequiredUserId = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    chapterDraft: { findUnique, update, delete: deleteFn },
    chapterVersion: { create: createVersion },
  },
}));

vi.mock("@/utils/supabase/auth", () => ({
  getRequiredUserId,
}));

describe("PATCH /api/chapters/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRequiredUserId.mockResolvedValue("user-1");
  });

  it("updates chapter content and status", async () => {
    const { PATCH } = await import("./route");
    const chapter = {
      id: "chapter-1",
      content: "正文",
      status: "done",
    };
    findUnique.mockResolvedValue({ id: "chapter-1", novel: { user_id: "user-1" } });
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
    getRequiredUserId.mockResolvedValue("owner-2");

    const response = await PATCH(request({ content: "正文" }), {
      params: Promise.resolve({ id: "chapter-1" }),
    });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("CHAPTER_NOT_FOUND");
    expect(update).not.toHaveBeenCalled();
  });

  it("returns 401 when not authenticated", async () => {
    const { PATCH } = await import("./route");
    findUnique.mockResolvedValue({ id: "chapter-1", novel: { user_id: null } });
    getRequiredUserId.mockRejectedValue(new Error("UNAUTHORIZED"));

    const response = await PATCH(request({ content: "正文" }), {
      params: Promise.resolve({ id: "chapter-1" }),
    });
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });
});

describe("DELETE /api/chapters/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRequiredUserId.mockResolvedValue("user-1");
  });

  it("deletes a chapter", async () => {
    const { DELETE } = await import("./route");
    findUnique.mockResolvedValue({ id: "chapter-1", novel: { user_id: "user-1" } });
    deleteFn.mockResolvedValue({ id: "chapter-1" });

    const response = await DELETE(new Request("http://localhost/api/chapters/chapter-1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "chapter-1" }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(deleteFn).toHaveBeenCalledWith({ where: { id: "chapter-1" } });
  });

  it("returns 404 for missing chapter", async () => {
    const { DELETE } = await import("./route");
    findUnique.mockResolvedValue(null);

    const response = await DELETE(new Request("http://localhost/api/chapters/missing", { method: "DELETE" }), {
      params: Promise.resolve({ id: "missing" }),
    });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("CHAPTER_NOT_FOUND");
  });

  it("denies deletion for a different user", async () => {
    const { DELETE } = await import("./route");
    findUnique.mockResolvedValue({ id: "chapter-1", novel: { user_id: "owner-1" } });
    getRequiredUserId.mockResolvedValue("owner-2");

    const response = await DELETE(new Request("http://localhost/api/chapters/chapter-1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "chapter-1" }),
    });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("CHAPTER_NOT_FOUND");
    expect(deleteFn).not.toHaveBeenCalled();
  });
});

function request(body: unknown) {
  return new Request("http://localhost/api/chapters/chapter-1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
