import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const deleteMany = vi.fn();
const create = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique },
    verificationToken: { deleteMany, create },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "test");
  findUnique.mockResolvedValue({ id: "user-1" });
  deleteMany.mockResolvedValue({ count: 1 });
  create.mockResolvedValue({});
});

describe("POST /api/auth/password-reset", () => {
  it("stores a reset token and returns a dev reset URL for existing users", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/auth/password-reset", {
        method: "POST",
        body: JSON.stringify({ email: " Writer@Example.COM " }),
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.sent).toBe(true);
    expect(json.data.resetUrl).toContain("/update-password?token=");
    expect(json.data.resetUrl).toContain("email=writer%40example.com");
    expect(deleteMany).toHaveBeenCalledWith({ where: { identifier: "writer@example.com" } });
    expect(create).toHaveBeenCalledWith({
      data: {
        identifier: "writer@example.com",
        token: expect.any(String),
        expires: expect.any(Date),
      },
    });
  });

  it("does not reveal whether an email exists", async () => {
    findUnique.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/auth/password-reset", {
        method: "POST",
        body: JSON.stringify({ email: "missing@example.com" }),
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, data: { sent: true } });
    expect(deleteMany).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
