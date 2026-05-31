import { beforeEach, describe, expect, it, vi } from "vitest";

const novelFindUnique = vi.fn();
const llmFindMany = vi.fn();
const getRequiredUserId = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    novel: { findUnique: novelFindUnique },
    llmUsage: { findMany: llmFindMany },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getRequiredUserId,
}));

describe("GET /api/novels/[id]/generations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRequiredUserId.mockResolvedValue("user-1");
    novelFindUnique.mockResolvedValue({ id: "novel-1", user_id: "user-1" });
    llmFindMany.mockResolvedValue([]);
  });

  it("returns 401 when unauthenticated", async () => {
    getRequiredUserId.mockRejectedValue(new Error("UNAUTHORIZED"));
    const { GET } = await import("./route");
    const res = await GET(
      new Request("http://localhost/api/novels/novel-1/generations"),
      { params: Promise.resolve({ id: "novel-1" }) } as never,
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-existent novel", async () => {
    novelFindUnique.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(
      new Request("http://localhost/api/novels/novel-1/generations"),
      { params: Promise.resolve({ id: "novel-1" }) } as never,
    );
    expect(res.status).toBe(404);
  });

  it("returns generations for the owner", async () => {
    llmFindMany.mockResolvedValue([
      {
        id: "g1",
        agent: "writer",
        route: "/api/novels/:id/chapters/draft",
        model: "mimo-v2.5-pro",
        status: "ok",
        error_code: null,
        token_in: 500,
        token_out: 2000,
        cost_cny: 0.003,
        took_ms: 30000,
        created_at: new Date("2026-05-30"),
      },
    ]);
    const { GET } = await import("./route");
    const res = await GET(
      new Request("http://localhost/api/novels/novel-1/generations"),
      { params: Promise.resolve({ id: "novel-1" }) } as never,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.generations).toHaveLength(1);
    expect(json.data.generations[0].agent).toBe("writer");
    expect(llmFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { novel_id: "novel-1", user_id: "user-1" },
        take: 50,
      }),
    );
  });

  it("filters by agent and status query params", async () => {
    const { GET } = await import("./route");
    await GET(
      new Request("http://localhost/api/novels/novel-1/generations?agent=writer&status=err&limit=10"),
      { params: Promise.resolve({ id: "novel-1" }) } as never,
    );
    expect(llmFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ agent: "writer", status: "err" }),
        take: 10,
      }),
    );
  });

  it("caps limit at 200", async () => {
    const { GET } = await import("./route");
    await GET(
      new Request("http://localhost/api/novels/novel-1/generations?limit=500"),
      { params: Promise.resolve({ id: "novel-1" }) } as never,
    );
    expect(llmFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 200 }));
  });

  it("ignores unknown agent/status values", async () => {
    const { GET } = await import("./route");
    await GET(
      new Request("http://localhost/api/novels/novel-1/generations?agent=hacker&status=injected"),
      { params: Promise.resolve({ id: "novel-1" }) } as never,
    );
    expect(llmFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { novel_id: "novel-1", user_id: "user-1" } }),
    );
  });
});
