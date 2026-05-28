import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const create = vi.fn();
const updateMany = vi.fn();
const userRoleFindUnique = vi.fn();
const auditCreate = vi.fn();
const getCurrentUser = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    llmModel: { findMany, create, updateMany },
    userRole: { findUnique: userRoleFindUnique },
    adminAudit: { create: auditCreate },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser,
}));

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  userRoleFindUnique.mockResolvedValue(null);
  process.env.MODEL_KEY_ENCRYPTION_SECRET = "test-secret-key-for-encryption-32chars!";
});

describe("GET /api/llm-models", () => {
  it("returns 401 when unauthenticated", async () => {
    getCurrentUser.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe("UNAUTHORIZED");
    expect(findMany).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-admin user", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1", email: "user@example.com"  });
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
    getCurrentUser.mockResolvedValue({ id: "admin-1", email: null  });
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
    getCurrentUser.mockResolvedValue({ id: "u-99", email: "Boss@Example.com"  });
    process.env.ADMIN_EMAILS = "boss@example.com";
    findMany.mockResolvedValue([]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

describe("POST /api/llm-models", () => {
  it("returns 401 unauthenticated", async () => {
    getCurrentUser.mockResolvedValue(null);
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
    getCurrentUser.mockResolvedValue({ id: "user-1", email: "user@example.com"  });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/llm-models", {
        method: "POST",
        body: JSON.stringify({
          name: "n",
          provider: "deepseek",
          base_url: "https://x",
          api_key: "plain-llm-secret",
          model: "m",
        }),
      }),
    );
    expect(res.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it("creates the model when caller is admin", async () => {
    getCurrentUser.mockResolvedValue({ id: "admin-1", email: null  });
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
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actor_user_id: "admin-1",
        action: "llm_model.create",
        target_type: "llm_model",
        target_id: "m1",
        metadata: expect.objectContaining({
          provider: "deepseek",
          model: "m",
          api_key_updated: true,
        }),
      }),
    });
    expect(JSON.stringify(auditCreate.mock.calls[0][0].data.metadata)).not.toContain("plain-llm-secret");
  });

  it("rejects private/internal base_url", async () => {
    getCurrentUser.mockResolvedValue({ id: "admin-1", email: null  });
    process.env.ADMIN_USER_IDS = "admin-1";
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/llm-models", {
        method: "POST",
        body: JSON.stringify({
          name: "n",
          provider: "deepseek",
          base_url: "http://192.168.1.1/v1",
          api_key: "k",
          model: "m",
        }),
      }),
    );
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
});
