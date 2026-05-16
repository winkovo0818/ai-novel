import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const upsert = vi.fn();
const aggregate = vi.fn();
const getRequiredUserId = vi.fn();
const chatCompletion = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    chapterDraft: { findUnique },
    chapterSummary: { upsert },
    llmUsage: { aggregate },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getRequiredUserId,
}));

vi.mock("@/lib/llm/client", () => ({
  chatCompletion,
}));

beforeEach(() => {
  vi.clearAllMocks();
  aggregate.mockResolvedValue({ _sum: { cost_cny: 0 }, _count: 0 });
});

describe("POST /api/chapters/[id]/summarize ownership", () => {
  it("returns 404 when chapter belongs to another user", async () => {
    findUnique.mockResolvedValue({
      id: "chapter-1",
      content: "正文",
      novel: { user_id: "owner-1" },
    });
    getRequiredUserId.mockResolvedValue("owner-2");

    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/x", { method: "POST" }), {
      params: Promise.resolve({ id: "chapter-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe("CHAPTER_NOT_FOUND");
    expect(chatCompletion).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    findUnique.mockResolvedValue({
      id: "chapter-1",
      content: "正文",
      novel: { user_id: "owner-1" },
    });
    getRequiredUserId.mockRejectedValue(new Error("UNAUTHORIZED"));

    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/x", { method: "POST" }), {
      params: Promise.resolve({ id: "chapter-1" }),
    });
    expect(res.status).toBe(401);
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it("returns 404 when chapter does not exist", async () => {
    findUnique.mockResolvedValue(null);

    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/x", { method: "POST" }), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 429 when daily cost quota is exceeded", async () => {
    findUnique.mockResolvedValue({
      id: "chapter-1",
      content: "正文",
      novel: { user_id: "owner-1" },
    });
    getRequiredUserId.mockResolvedValue("owner-1");
    aggregate
      .mockResolvedValueOnce({ _sum: { cost_cny: 60 }, _count: 5 })
      .mockResolvedValueOnce({ _sum: { cost_cny: 60 }, _count: 5 });

    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/x", { method: "POST" }), {
      params: Promise.resolve({ id: "chapter-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.error.code).toBe("QUOTA_EXCEEDED");
    expect(chatCompletion).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });
});
