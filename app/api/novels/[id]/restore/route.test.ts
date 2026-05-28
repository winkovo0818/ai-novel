import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  getRequiredUserId: vi.fn(),
  checkAdmin: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    novel: {
      findUnique: mocks.findUnique,
      update: mocks.update,
    },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getRequiredUserId: mocks.getRequiredUserId,
}));

vi.mock("@/lib/auth/admin", () => ({
  checkAdmin: mocks.checkAdmin,
}));

import { POST } from "./route";

describe("POST /api/novels/[id]/restore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequiredUserId.mockResolvedValue("user-1");
    mocks.checkAdmin.mockResolvedValue({ ok: false, reason: "FORBIDDEN", userId: "user-1", email: null });
  });

  it("restores an owned soft-deleted novel", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "novel-1",
      user_id: "user-1",
      deleted_at: new Date("2026-05-28T00:00:00.000Z"),
    });
    mocks.update.mockResolvedValue({ id: "novel-1" });

    const response = await POST(new Request("http://localhost/api/novels/novel-1/restore", { method: "POST" }), {
      params: Promise.resolve({ id: "novel-1" }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, data: { id: "novel-1", restored: true } });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "novel-1" },
      data: { deleted_at: null },
      select: { id: true },
    });
  });

  it("is idempotent when the novel is already active", async () => {
    mocks.findUnique.mockResolvedValue({ id: "novel-1", user_id: "user-1", deleted_at: null });

    const response = await POST(new Request("http://localhost/api/novels/novel-1/restore", { method: "POST" }), {
      params: Promise.resolve({ id: "novel-1" }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, data: { id: "novel-1", restored: false } });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("hides another user's deleted novel", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "novel-1",
      user_id: "other-user",
      deleted_at: new Date("2026-05-28T00:00:00.000Z"),
    });

    const response = await POST(new Request("http://localhost/api/novels/novel-1/restore", { method: "POST" }), {
      params: Promise.resolve({ id: "novel-1" }),
    });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("NOVEL_NOT_FOUND");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
