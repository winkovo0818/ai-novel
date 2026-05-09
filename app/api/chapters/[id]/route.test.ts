import { beforeEach, describe, expect, it, vi } from "vitest";

const update = vi.fn();
const deleteFn = vi.fn();
const findUnique = vi.fn();
const createVersion = vi.fn();
const findFirstVersion = vi.fn();
const findManyVersion = vi.fn();
const deleteManyVersion = vi.fn();
const getRequiredUserId = vi.fn();

const txClient = {
  chapterDraft: { update },
  chapterVersion: {
    create: createVersion,
    findFirst: findFirstVersion,
    findMany: findManyVersion,
    deleteMany: deleteManyVersion,
  },
};
const $transaction = vi.fn(async (cb: (tx: typeof txClient) => unknown) => cb(txClient));

vi.mock("@/lib/db", () => ({
  prisma: {
    chapterDraft: { findUnique, update, delete: deleteFn },
    chapterVersion: {
      create: createVersion,
      findFirst: findFirstVersion,
      findMany: findManyVersion,
      deleteMany: deleteManyVersion,
    },
    $transaction,
  },
}));

vi.mock("@/utils/supabase/auth", () => ({
  getRequiredUserId,
}));

describe("PATCH /api/chapters/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRequiredUserId.mockResolvedValue("user-1");
    findFirstVersion.mockResolvedValue(null);
    findManyVersion.mockResolvedValue([]);
  });

  it("updates chapter content and status, creating a status_change version on autosave", async () => {
    const { PATCH } = await import("./route");
    const chapter = {
      id: "chapter-1",
      content: "正文",
      status: "done",
    };
    findUnique.mockResolvedValue({ id: "chapter-1", title: "t", content: "old", status: "draft", novel: { user_id: "user-1" } });
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
    expect(createVersion).toHaveBeenCalledTimes(1);
    expect(createVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ chapter_id: "chapter-1", source: "status_change" }),
      }),
    );
  });

  it("does NOT create a version on default (autosave) content-only PATCH", async () => {
    const { PATCH } = await import("./route");
    findUnique.mockResolvedValue({ id: "chapter-1", title: "t", content: "old", status: "draft", novel: { user_id: "user-1" } });
    update.mockResolvedValue({ id: "chapter-1", content: "new", status: "draft" });

    const response = await PATCH(request({ content: "new" }), {
      params: Promise.resolve({ id: "chapter-1" }),
    });

    expect(response.status).toBe(200);
    expect(createVersion).not.toHaveBeenCalled();
  });

  it("creates a version when source=manual is provided", async () => {
    const { PATCH } = await import("./route");
    findUnique.mockResolvedValue({ id: "chapter-1", title: "t", content: "old", status: "draft", novel: { user_id: "user-1" } });
    update.mockResolvedValue({ id: "chapter-1", content: "new", status: "draft" });

    await PATCH(request({ content: "new", source: "manual" }), {
      params: Promise.resolve({ id: "chapter-1" }),
    });

    expect(createVersion).toHaveBeenCalledTimes(1);
    expect(createVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ source: "manual" }),
      }),
    );
  });

  it("creates a version when source=ai is provided", async () => {
    const { PATCH } = await import("./route");
    findUnique.mockResolvedValue({ id: "chapter-1", title: "t", content: "old", status: "draft", novel: { user_id: "user-1" } });
    update.mockResolvedValue({ id: "chapter-1", content: "ai-out", status: "draft" });

    await PATCH(request({ content: "ai-out", source: "ai" }), {
      params: Promise.resolve({ id: "chapter-1" }),
    });

    expect(createVersion).toHaveBeenCalledTimes(1);
    expect(createVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ source: "ai" }),
      }),
    );
  });

  it("skips version creation when latest version has the same content_hash", async () => {
    const { PATCH } = await import("./route");
    findUnique.mockResolvedValue({ id: "chapter-1", title: "t", content: "same", status: "draft", novel: { user_id: "user-1" } });
    update.mockResolvedValue({ id: "chapter-1", content: "new", status: "draft" });
    const { createHash } = await import("node:crypto");
    const sameHash = createHash("md5").update("same").digest("hex");
    findFirstVersion.mockResolvedValue({ content_hash: sameHash });

    await PATCH(request({ content: "new", source: "manual" }), {
      params: Promise.resolve({ id: "chapter-1" }),
    });

    expect(createVersion).not.toHaveBeenCalled();
  });

  it("prunes oldest versions beyond the per-chapter cap", async () => {
    const { PATCH } = await import("./route");
    findUnique.mockResolvedValue({ id: "chapter-1", title: "t", content: "old", status: "draft", novel: { user_id: "user-1" } });
    update.mockResolvedValue({ id: "chapter-1", content: "new", status: "draft" });
    findManyVersion.mockResolvedValue([{ id: "old-1" }, { id: "old-2" }]);

    await PATCH(request({ content: "new", source: "manual" }), {
      params: Promise.resolve({ id: "chapter-1" }),
    });

    expect(deleteManyVersion).toHaveBeenCalledWith({
      where: { id: { in: ["old-1", "old-2"] } },
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

  it("rolls back the chapter update if version creation fails", async () => {
    const { PATCH } = await import("./route");
    findUnique.mockResolvedValue({ id: "chapter-1", title: "t", content: "old", status: "draft", novel: { user_id: "user-1" } });
    update.mockResolvedValue({ id: "chapter-1", content: "new", status: "draft" });
    createVersion.mockRejectedValue(new Error("version insert failed"));

    // Simulate a real prisma.$transaction: when the callback throws, the
    // wrapper rejects so the caller sees the error and the entire batch is
    // treated as failed.
    $transaction.mockImplementationOnce(async (cb) => cb(txClient));

    const response = await PATCH(request({ content: "new", source: "manual" }), {
      params: Promise.resolve({ id: "chapter-1" }),
    });
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error.code).toBe("INTERNAL");
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
