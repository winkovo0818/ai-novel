import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const update = vi.fn();
const auditCreate = vi.fn();
const getCurrentUser = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    userRole: { findUnique },
    moderationAudit: { update },
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
  findUnique.mockResolvedValue(null);
  delete process.env.ADMIN_USER_IDS;
  delete process.env.ADMIN_EMAILS;
});

function asAdminViaEnv(userId = "admin-1") {
  getCurrentUser.mockResolvedValue({ id: userId, email: null });
  process.env.ADMIN_USER_IDS = userId;
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admin/moderation-audits/audit-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ id: "audit-1" }) };

describe("PATCH /api/admin/moderation-audits/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    getCurrentUser.mockResolvedValue(null);
    const { PATCH } = await import("./route");

    const res = await PATCH(makeRequest({ review_status: "confirmed" }), ctx);

    expect(res.status).toBe(401);
    expect(update).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is not admin", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1", email: null });
    const { PATCH } = await import("./route");

    const res = await PATCH(makeRequest({ review_status: "confirmed" }), ctx);

    expect(res.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid review_status", async () => {
    asAdminViaEnv();
    const { PATCH } = await import("./route");

    const res = await PATCH(makeRequest({ review_status: "resolved" }), ctx);

    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("updates review fields with the acting admin", async () => {
    asAdminViaEnv("admin-1");
    update.mockResolvedValue({
      id: "audit-1",
      review_status: "false_positive",
      review_note: "误杀",
      reviewed_by: "admin-1",
      reviewed_at: new Date("2026-05-14T00:00:00Z"),
    });
    const { PATCH } = await import("./route");

    const res = await PATCH(
      makeRequest({ review_status: "false_positive", review_note: "  误杀  " }),
      ctx,
    );

    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "audit-1" },
        data: expect.objectContaining({
          review_status: "false_positive",
          review_note: "误杀",
          reviewed_by: "admin-1",
          reviewed_at: expect.any(Date),
        }),
      }),
    );
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        actor_user_id: "admin-1",
        action: "moderation_audit.review",
        target_type: "moderation_audit",
        target_id: "audit-1",
        metadata: { review_status: "false_positive", has_review_note: true },
      },
    });
  });

  it("returns 404 when the audit row is missing", async () => {
    asAdminViaEnv();
    update.mockRejectedValue(Object.assign(new Error("missing"), { code: "P2025" }));
    const { PATCH } = await import("./route");

    const res = await PATCH(makeRequest({ review_status: "confirmed" }), ctx);

    expect(res.status).toBe(404);
  });
});
