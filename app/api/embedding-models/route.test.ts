import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const create = vi.fn();
const updateMany = vi.fn();
const userRoleFindUnique = vi.fn();
const getCurrentUser = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    embeddingModel: { findMany, create, updateMany },
    userRole: { findUnique: userRoleFindUnique },
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
  delete process.env.ADMIN_USER_IDS;
  delete process.env.ADMIN_EMAILS;
});

function asAdminViaEnv(userId = "admin-1") {
  getCurrentUser.mockResolvedValue({ id: userId, email: null });
  process.env.ADMIN_USER_IDS = userId;
}

describe("GET /api/embedding-models", () => {
  it("returns 401 when unauthenticated", async () => {
    getCurrentUser.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1", email: "user@example.com"  });
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(403);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("returns models with masked api_key for admin", async () => {
    asAdminViaEnv();
    findMany.mockResolvedValue([
      { id: "m1", name: "n", provider: "edgefn", base_url: "u", api_key: "secret_key_xyz123", model: "BAAI/bge-m3", dim: 1024, is_default: true, is_enabled: true },
    ]);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data[0].api_key).toBe("***z123");
  });
});

describe("POST /api/embedding-models", () => {
  it("returns 403 for non-admin", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1", email: null  });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/embedding-models", {
        method: "POST",
        body: JSON.stringify({ name: "n", provider: "edgefn", base_url: "https://api.edgefn.net/v1", api_key: "k", model: "m" }),
      }),
    );
    expect(res.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects non-1024 dim", async () => {
    asAdminViaEnv();
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/embedding-models", {
        method: "POST",
        body: JSON.stringify({ name: "n", provider: "openai", base_url: "https://api.openai.com/v1", api_key: "k", model: "text-embedding-3-small", dim: 1536 }),
      }),
    );
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects private/internal base_url (SSRF guard)", async () => {
    asAdminViaEnv();
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/embedding-models", {
        method: "POST",
        body: JSON.stringify({ name: "n", provider: "edgefn", base_url: "http://192.168.1.1/v1", api_key: "k", model: "m" }),
      }),
    );
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("creates row and unsets other defaults globally when is_default=true", async () => {
    asAdminViaEnv();
    create.mockResolvedValue({ id: "m1", api_key: "enc:abc" });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/embedding-models", {
        method: "POST",
        body: JSON.stringify({
          name: "primary",
          provider: "edgefn",
          base_url: "https://api.edgefn.net/v1",
          api_key: "sk-test",
          model: "BAAI/bge-m3",
          is_default: true,
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(updateMany).toHaveBeenCalledWith({
      where: { is_default: true },
      data: { is_default: false },
    });
    expect(create).toHaveBeenCalled();
  });
});
