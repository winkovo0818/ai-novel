import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const update = vi.fn();
const updateMany = vi.fn();
const del = vi.fn();
const getUser = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    llmModel: { findUnique, update, updateMany, delete: del },
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

describe("PATCH /api/llm-models/[id]", () => {
  it("returns 401 unauthenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("http://localhost/x", {
        method: "PATCH",
        body: JSON.stringify({ name: "n" }),
      }),
      { params: Promise.resolve({ id: "m1" }) },
    );
    expect(res.status).toBe(401);
    expect(update).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "u@example.com" } },
      error: null,
    });
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("http://localhost/x", {
        method: "PATCH",
        body: JSON.stringify({ name: "n" }),
      }),
      { params: Promise.resolve({ id: "m1" }) },
    );
    expect(res.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it("updates when admin", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "admin-1", email: null } },
      error: null,
    });
    process.env.ADMIN_USER_IDS = "admin-1";
    update.mockResolvedValue({ id: "m1", name: "n" });
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new Request("http://localhost/x", {
        method: "PATCH",
        body: JSON.stringify({ name: "n" }),
      }),
      { params: Promise.resolve({ id: "m1" }) },
    );
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ where: { id: "m1" }, data: { name: "n" } });
  });
});

describe("DELETE /api/llm-models/[id]", () => {
  it("returns 401 unauthenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { DELETE } = await import("./route");
    const res = await DELETE(
      new Request("http://localhost/x", { method: "DELETE" }),
      { params: Promise.resolve({ id: "m1" }) },
    );
    expect(res.status).toBe(401);
    expect(del).not.toHaveBeenCalled();
  });

  it("returns 403 for non-admin", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "u@example.com" } },
      error: null,
    });
    const { DELETE } = await import("./route");
    const res = await DELETE(
      new Request("http://localhost/x", { method: "DELETE" }),
      { params: Promise.resolve({ id: "m1" }) },
    );
    expect(res.status).toBe(403);
    expect(del).not.toHaveBeenCalled();
  });

  it("deletes when admin", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "admin-1", email: null } },
      error: null,
    });
    process.env.ADMIN_USER_IDS = "admin-1";
    del.mockResolvedValue({});
    const { DELETE } = await import("./route");
    const res = await DELETE(
      new Request("http://localhost/x", { method: "DELETE" }),
      { params: Promise.resolve({ id: "m1" }) },
    );
    expect(res.status).toBe(200);
    expect(del).toHaveBeenCalledWith({ where: { id: "m1" } });
  });
});
