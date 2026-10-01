import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), novels: vi.fn(), alerts: vi.fn(), acknowledge: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getRequiredUserId: m.auth }));
vi.mock("@/lib/db", () => ({ prisma: { novel: { findMany: m.novels }, novelGenerationAlert: { findMany: m.alerts, updateMany: m.acknowledge } } }));
import { GET, PATCH } from "./route";
const patch = (body: unknown) => PATCH(new Request("http://localhost/api/generation-alerts", { method: "PATCH", body: JSON.stringify(body) }));
beforeEach(() => { vi.resetAllMocks(); m.auth.mockResolvedValue("u"); m.novels.mockResolvedValue([{ id: "n", title: "作品" }]); m.alerts.mockResolvedValue([{ id: "a", kind: "review", message: "待审", run: { novel_id: "n" }, created_at: new Date(0) }]); m.acknowledge.mockResolvedValue({ count: 1 }); });
describe("owned generation reminders", () => {
  it("requires authentication for reading and acknowledging", async () => { m.auth.mockRejectedValue(new Error()); expect((await GET()).status).toBe(401); expect((await patch({})).status).toBe(401); expect(m.alerts).not.toHaveBeenCalled(); expect(m.acknowledge).not.toHaveBeenCalled(); });
  it("only returns unread alerts for owned nondeleted novels", async () => { const result = await (await GET()).json(); expect(result.data[0]).toMatchObject({ novel_id: "n", novel_title: "作品" }); expect(m.novels.mock.calls[0][0].where).toEqual({ user_id: "u", deleted_at: null }); expect(m.alerts.mock.calls[0][0]).toMatchObject({ take: 50, where: { run: { user_id: "u", novel_id: { in: ["n"] } }, read_at: null, resolved_at: null } }); });
  it.each([null, {}, { ids: [] }, { ids: ["invalid"] }, { ids: Array(51).fill("00000000-0000-0000-0000-000000000001") }])("rejects malformed acknowledgements %j", async body => { expect((await patch(body)).status).toBe(400); expect(m.acknowledge).not.toHaveBeenCalled(); });
  it("scopes acknowledgement to the current owner without changing a run", async () => { const ids = ["00000000-0000-0000-0000-000000000001"]; const result = await (await patch({ ids })).json(); expect(result.data.acknowledged).toBe(1); expect(m.acknowledge.mock.calls[0][0].where).toMatchObject({ id: { in: ids }, run: { user_id: "u" }, read_at: null }); });
  it("rejects invalid JSON", async () => { expect((await PATCH(new Request("http://localhost", { method: "PATCH", body: "bad" }))).status).toBe(400); });
});
