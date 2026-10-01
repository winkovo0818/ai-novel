import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), novel: vi.fn(), last: vi.fn(), memory: vi.fn(), arc: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getRequiredUserId: m.auth }));
vi.mock("@/lib/db", () => ({ prisma: { novel: { findUnique: m.novel } } }));
vi.mock("@/lib/agent/storyMemory", () => ({ latestDoneChapter: m.last, loadStoryMemory: m.memory }));
vi.mock("@/lib/agent/volumePlanStore", () => ({ readVolumeArc: m.arc }));
import { GET } from "./route";
const request = (query = "") => GET(new Request(`http://localhost/api/novels/n/story-memory${query}`), { params: Promise.resolve({ id: "n" }) });
beforeEach(() => { vi.resetAllMocks(); m.auth.mockResolvedValue("u"); m.novel.mockResolvedValue({ user_id: "u", bible: { content: {} } }); m.last.mockResolvedValue(40); m.memory.mockResolvedValue({ state: {}, historical_available: true, baseline_chapter: 0, stale_records: 0, records: [] }); });
describe("owned temporal story memory", () => {
  it("requires authentication before looking up any content", async () => { m.auth.mockRejectedValue(new Error("login")); expect((await request()).status).toBe(401); expect(m.novel).not.toHaveBeenCalled(); });
  it.each([null, { user_id: "another" }, { user_id: "u", deleted_at: new Date() }])("hides inaccessible or deleted novels %j", async row => { m.novel.mockResolvedValue(row); expect((await request()).status).toBe(404); expect(m.memory).not.toHaveBeenCalled(); });
  it("rejects novels without a Bible", async () => { m.novel.mockResolvedValue({ user_id: "u" }); expect((await request()).status).toBe(400); });
  it.each(["", "-1", "41", "1.2", "abc"])("rejects unavailable chapter index %j", async value => { expect((await request(`?chapter_index=${value}`)).status).toBe(400); expect(m.memory).not.toHaveBeenCalled(); });
  it("returns the current plan, bounded facts and source provenance", async () => {
    const target = { kind: "plot_threads", title: "旧案" }; m.arc.mockResolvedValue({ plan: { thread_targets: [target] } });
    m.memory.mockResolvedValue({ state: { plot_threads: [] }, historical_available: true, baseline_chapter: 0, stale_records: 1, records: [{ category: "plot_threads", value: { title: "旧案" }, source_kind: "generated_chapter", source_chapter_id: "c", source_chapter_version: 3, valid_from_chapter: 1, valid_to_chapter: null, memory_key: "internal-key" }] });
    const response = await request(); expect(response.status).toBe(200); const body = await response.json(); expect(body.data).toMatchObject({ chapter_index: 40, stale_records: 1, records: [{ source_chapter_id: "c", source_chapter_version: 3 }] }); expect(body.data.records[0]).not.toHaveProperty("memory_key"); expect(m.memory.mock.calls[0][3]).toEqual([target]);
  });
  it("serves chapter zero and explicitly reports unavailable pre-backfill history", async () => { m.memory.mockResolvedValue({ state: {}, historical_available: false, baseline_chapter: 30, stale_records: 0, records: [] }); const body = await (await request("?chapter_index=0")).json(); expect(body.data).toMatchObject({ chapter_index: 0, historical_available: false, volume_arc: null }); expect(m.arc).toHaveBeenCalledWith("n", 1); });
  it.each([new Error("作品已改变"), "unknown"])("returns retryable errors instead of incomplete state %j", async error => { m.memory.mockRejectedValue(error); const response = await request(); expect(response.status).toBe(409); const body = await response.json(); expect(body.error.retryable).toBe(true); });
});
