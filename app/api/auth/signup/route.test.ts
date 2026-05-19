import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const create = vi.fn();
const hashPassword = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique, create },
  },
}));

vi.mock("@/lib/auth/password", () => ({
  hashPassword,
}));

beforeEach(() => {
  vi.clearAllMocks();
  findUnique.mockResolvedValue(null);
  create.mockResolvedValue({ id: "user-1", email: "writer@example.com" });
  hashPassword.mockResolvedValue("scrypt:salt:hash");
});

describe("POST /api/auth/signup", () => {
  it("creates a local Auth.js user with a hashed password", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email: " Writer@Example.COM ", password: "secret12" }),
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, data: { user: { id: "user-1", email: "writer@example.com" } } });
    expect(hashPassword).toHaveBeenCalledWith("secret12");
    expect(create).toHaveBeenCalledWith({
      data: {
        email: "writer@example.com",
        password_hash: "scrypt:salt:hash",
      },
      select: { id: true, email: true },
    });
  });

  it("rejects duplicate email addresses", async () => {
    findUnique.mockResolvedValue({ id: "existing-user" });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email: "writer@example.com", password: "secret12" }),
      }),
    );

    expect(res.status).toBe(409);
    expect(create).not.toHaveBeenCalled();
  });
});
