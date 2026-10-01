import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.fn(), chapter = vi.fn(), version = vi.fn(), update = vi.fn(), snapshot = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getRequiredUserId: auth }));
vi.mock("@/lib/db", () => ({ prisma: {
  chapterDraft: { findUnique: chapter }, chapterVersion: { findUnique: version },
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ chapterDraft: { update },
    chapterVersion: { findFirst: vi.fn().mockResolvedValue(null), create: snapshot } }),
} }));
beforeEach(() => {
  vi.resetAllMocks(); auth.mockResolvedValue("u");
  chapter.mockResolvedValue({ id: "c", title: "current", content: "current", status: "draft", version: 3, novel: { user_id: "u" } });
  version.mockResolvedValue({ id: "v", chapter_id: "c", title: "previous", content: "previous", status: "done" });
  update.mockResolvedValue({ id: "c", version: 4 });
});
const restore = async (body = {}) => (await import("./route")).POST(new Request("http://localhost/restore", { method: "POST", body: JSON.stringify(body) }), {
  params: Promise.resolve({ id: "c", versionId: "v" }),
});
describe("version restore", () => {
  it("requires the expected version", async () => { expect((await restore()).status).toBe(400); expect(update).not.toHaveBeenCalled(); });
  it("restores and invalidates memory only under a matching version", async () => {
    expect((await restore({ expected_version: 3 })).status).toBe(200);
    expect(update).toHaveBeenCalledWith({ where: { id: "c", version: 3 }, data: expect.objectContaining({ version: { increment: 1 }, summary_dirty: true, index_dirty: true }) });
    expect(snapshot).toHaveBeenCalledWith({ data: expect.objectContaining({ content: "current" }) });
  });
  it("rejects a concurrent edit without snapshotting stale content", async () => {
    update.mockRejectedValue({ code: "P2025" }); expect((await restore({ expected_version: 3 })).status).toBe(409); expect(snapshot).not.toHaveBeenCalled();
  });
});
