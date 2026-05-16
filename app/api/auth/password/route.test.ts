import { beforeEach, describe, expect, it, vi } from "vitest";

const verificationFindUnique = vi.fn();
const userUpdate = vi.fn();
const verificationDelete = vi.fn();
const $transaction = vi.fn();
const getCurrentUser = vi.fn();
const hashPassword = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    verificationToken: {
      findUnique: verificationFindUnique,
      delete: verificationDelete,
    },
    user: { update: userUpdate },
    $transaction,
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser,
}));

vi.mock("@/lib/auth/password", () => ({
  hashPassword,
}));

beforeEach(() => {
  vi.clearAllMocks();
  verificationFindUnique.mockResolvedValue({
    identifier: "writer@example.com",
    token: "reset-token",
    expires: new Date(Date.now() + 60_000),
  });
  userUpdate.mockReturnValue({ kind: "user-update" });
  verificationDelete.mockReturnValue({ kind: "token-delete" });
  $transaction.mockResolvedValue([]);
  getCurrentUser.mockResolvedValue({ id: "user-1", email: "writer@example.com" });
  hashPassword.mockResolvedValue("scrypt:salt:hash");
});

describe("POST /api/auth/password", () => {
  it("updates password through a valid reset token and consumes the token", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/auth/password", {
        method: "POST",
        body: JSON.stringify({
          email: " Writer@Example.COM ",
          token: "reset-token",
          password: "new-password",
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(verificationFindUnique).toHaveBeenCalledWith({
      where: { identifier_token: { identifier: "writer@example.com", token: "reset-token" } },
    });
    expect(userUpdate).toHaveBeenCalledWith({
      where: { email: "writer@example.com" },
      data: { password_hash: "scrypt:salt:hash" },
    });
    expect(verificationDelete).toHaveBeenCalledWith({
      where: { identifier_token: { identifier: "writer@example.com", token: "reset-token" } },
    });
    expect($transaction).toHaveBeenCalledWith([{ kind: "user-update" }, { kind: "token-delete" }]);
  });

  it("updates the signed-in user's password without a reset token", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/auth/password", {
        method: "POST",
        body: JSON.stringify({ password: "new-password" }),
      }),
    );

    expect(res.status).toBe(200);
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { password_hash: "scrypt:salt:hash" },
    });
    expect($transaction).not.toHaveBeenCalled();
  });

  it("rejects expired reset tokens", async () => {
    verificationFindUnique.mockResolvedValue({
      identifier: "writer@example.com",
      token: "reset-token",
      expires: new Date(Date.now() - 60_000),
    });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/auth/password", {
        method: "POST",
        body: JSON.stringify({
          email: "writer@example.com",
          token: "reset-token",
          password: "new-password",
        }),
      }),
    );

    expect(res.status).toBe(400);
    expect(userUpdate).not.toHaveBeenCalled();
  });
});
