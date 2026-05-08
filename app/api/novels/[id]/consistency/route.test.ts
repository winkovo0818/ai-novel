import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const getRequiredUserId = vi.fn();
const chatCompletion = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    novel: { findUnique },
  },
}));

vi.mock("@/utils/supabase/auth", () => ({
  getRequiredUserId,
}));

vi.mock("@/lib/llm/client", () => ({
  chatCompletion,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/novels/[id]/consistency ownership", () => {
  it("returns 404 when novel belongs to another user", async () => {
    findUnique.mockResolvedValue({
      id: "novel-1",
      user_id: "owner-1",
      bible: { content: {} },
      chapters: [],
      profile: {},
    });
    getRequiredUserId.mockResolvedValue("owner-2");

    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/x", { method: "POST" }), {
      params: Promise.resolve({ id: "novel-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe("NOVEL_NOT_FOUND");
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    findUnique.mockResolvedValue({
      id: "novel-1",
      user_id: "owner-1",
      bible: { content: {} },
      chapters: [],
      profile: {},
    });
    getRequiredUserId.mockRejectedValue(new Error("UNAUTHORIZED"));

    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/x", { method: "POST" }), {
      params: Promise.resolve({ id: "novel-1" }),
    });
    expect(res.status).toBe(401);
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it("returns 404 when novel or bible missing", async () => {
    findUnique.mockResolvedValue(null);

    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/x", { method: "POST" }), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
  });
});
