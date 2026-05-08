import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const create = vi.fn();
const updateMany = vi.fn();
const getUser = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    llmModel: { findMany, create, updateMany },
  },
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser },
  }),
}));

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("GET /api/llm-models", () => {
  it("returns 401 when unauthenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe("UNAUTHORIZED");
    expect(findMany).not.toHaveBeenCalled();
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
    const json = await res.json();
    expect(json.error.code).toBe("FORBIDDEN");
    expect(findMany).not.toHaveBeenCalled();
  });

  it("allows an admin via ADMIN_USER_IDS", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "admin-1", email: null } },
      error: null,
    });
    process.env.ADMIN_USER_IDS = "admin-1";
    findMany.mockResolvedValue([]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(findMany).toHaveBeenCalled();
  });

  it("allows an admin via ADMIN_EMAILS (case-insensitive)", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u-99", email: "Boss@Example.com" } },
      error: null,
    });
    process.env.ADMIN_EMAILS = "boss@example.com";
    findMany.mockResolvedValue([]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

describe("POST /api/llm-models", () => {
  it("returns 401 unauthenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/llm-models", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "user@example.com" } },
      error: null,
    });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/llm-models", {
        method: "POST",
        body: JSON.stringify({
          name: "n",
          provider: "deepseek",
          base_url: "https://x",
          api_key: "k",
          model: "m",
        }),
      }),
    );
    expect(res.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it("creates the model when caller is admin", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "admin-1", email: null } },
      error: null,
    });
    process.env.ADMIN_USER_IDS = "admin-1";
    create.mockResolvedValue({ id: "m1" });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/llm-models", {
        method: "POST",
        body: JSON.stringify({
          name: "n",
          provider: "deepseek",
          base_url: "https://x",
          api_key: "k",
          model: "m",
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalled();
  });
});
