import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const getUser = vi.fn();
const chatCompletionWithRetry = vi.fn();
const userRoleFindUnique = vi.fn();

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
  }),
}));

vi.mock("@/lib/llm/client", () => ({
  chatCompletionWithRetry,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    userRole: { findUnique: userRoleFindUnique },
  },
}));

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  userRoleFindUnique.mockResolvedValue(null);
});

describe("GET /api/healthz/llm", () => {
  it("returns 401 when unauthenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(401);
    expect(chatCompletionWithRetry).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-admin user", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "user@example.com" } },
      error: null,
    });
    process.env.ADMIN_USER_IDS = "admin-1";
    process.env.ADMIN_EMAILS = "boss@example.com";
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(403);
    expect(chatCompletionWithRetry).not.toHaveBeenCalled();
  });

  it("returns LLM health data for an admin", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "admin-1", email: null } },
      error: null,
    });
    process.env.ADMIN_USER_IDS = "admin-1";
    chatCompletionWithRetry.mockResolvedValue({
      content: "ok",
      tokenIn: 10,
      tokenOut: 1,
      costCny: 0.000012,
      tookMs: 1234,
      model: "deepseek-chat",
    });
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.model).toBe("deepseek-chat");
    expect(chatCompletionWithRetry).toHaveBeenCalled();
  });
});
