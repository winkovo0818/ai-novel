import seed from "@/scripts/fixtures/eval-novels/xuanhuan-seed.json";
import { beforeEach, describe, expect, it, vi } from "vitest";
const bible = vi.fn();
const otherRun = vi.fn();
const auth = vi.fn(), novel = vi.fn(), run = vi.fn(), latest = vi.fn(), chapters = vi.fn(), inflight = vi.fn(), create = vi.fn(), updateMany = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getRequiredUserId: auth }));
vi.mock("@/lib/jobs/queue", () => ({ sweepStaleRunningJobs: vi.fn().mockResolvedValue(0) }));
vi.mock("@/lib/db", () => ({ prisma: {
  novel: { findUnique: novel }, novelGenerationRun: { findFirst: run },
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
    $queryRaw: vi.fn().mockResolvedValue([]), novelGenerationRun: { findUniqueOrThrow: latest, findFirst: otherRun, updateMany },
    bibleDraft: { findUnique: bible }, chapterDraft: { findMany: chapters }, novelGenerationAlert: { updateMany: vi.fn() }, backgroundJob: { updateMany: vi.fn(), findFirst: inflight, create },
  }),
} }));
const row = (extra = {}) => ({ id: "run-1", novel_id: "n", status: "paused", current_chapter: 1, total_chapters: 4,
  cost_cny_spent: 0, cost_cap_cny: null, ...extra });
beforeEach(() => {
  vi.resetAllMocks(); auth.mockResolvedValue("u"); novel.mockResolvedValue({ id: "n", user_id: "u" });
  run.mockResolvedValue(row()); latest.mockResolvedValue(row()); chapters.mockResolvedValue([]);
  bible.mockResolvedValue({ content: seed.bible });
  inflight.mockResolvedValue(null); updateMany.mockResolvedValue({ count: 1 });
});
const resume = async (action = "resume") => (await import("./route")).POST(new Request("http://localhost/resume", { method: "POST" }), {
  params: Promise.resolve({ id: "n", action }),
});
describe("atomic resume", () => {
  it("requires authentication", async () => { auth.mockRejectedValue(new Error()); expect((await resume()).status).toBe(401); });
  it("requires a paused run", async () => { run.mockResolvedValue(null); expect((await resume()).status).toBe(404); });
  it("rejects unsupported actions", async () => { expect((await resume("delete")).status).toBe(400); });
  it("enqueues the next chapter", async () => {
    expect((await resume()).status).toBe(200); expect(create.mock.calls[0][0].data.payload.chapter_index).toBe(2);
  });
  it("does not duplicate an inflight job", async () => { inflight.mockResolvedValue({ id: "job" }); await resume(); expect(create).not.toHaveBeenCalled(); });
  it("blocks an unapproved draft", async () => {
    chapters.mockResolvedValue([{ chapter_index: 2, status: "draft", content: "待审核正文" }]);
    expect((await resume()).status).toBe(409); expect(create).not.toHaveBeenCalled();
  });
  it("advances past a human-approved chapter", async () => {
    chapters.mockResolvedValue([{ chapter_index: 2, status: "done", content: "已审核正文" }]); await resume();
    expect(create.mock.calls[0][0].data.payload.chapter_index).toBe(3);
  });
  it("completes after the last approved chapter", async () => {
    latest.mockResolvedValue(row({ current_chapter: 3 })); chapters.mockResolvedValue([{ chapter_index: 4, status: "done", content: "完成" }]);
    const response = await resume(); expect((await response.json()).data.status).toBe("completed"); expect(create).not.toHaveBeenCalled();
  });
  it("cannot resume past the cost cap", async () => {
    latest.mockResolvedValue(row({ cost_cap_cny: 1, cost_cny_spent: 1 })); expect((await resume()).status).toBe(409); expect(create).not.toHaveBeenCalled();
  });
  it("cannot revive a concurrently cancelled run", async () => {
    latest.mockResolvedValue(row({ status: "cancelled" })); expect((await resume()).status).toBe(409);
  });
});


describe("resume rolling planning", () => {
  it("cannot revive an old failed run when a newer run is active", async () => {
    latest.mockResolvedValue(row({ status: "failed" })); otherRun.mockResolvedValue({ id: "newer" });
    expect((await resume()).status).toBe(409); expect(create).not.toHaveBeenCalled();
  });
  it("resumes planning if the outline did not finish before pause", async () => {
    latest.mockResolvedValue(row({ total_chapters: 40 }));
    const response = await resume();
    expect((await response.json()).data.status).toBe("planning");
    expect(create.mock.calls[0][0].data).toMatchObject({ type: "plan_outline", payload: { target_chapters: 40 } });
  });
  it("extends the horizon after a human approves the last chapter", async () => {
    latest.mockResolvedValue(row({ current_chapter: 7, total_chapters: 8, config: { continuous: true, planning_window: 10 } }));
    chapters.mockResolvedValue([{ chapter_index: 8, status: "done", content: "已复核" }]);
    const response = await resume();
    expect((await response.json()).data).toMatchObject({ status: "planning", current_chapter: 8, total_chapters: 18 });
    expect(create.mock.calls[0][0].data.payload.target_chapters).toBe(18);
  });
  it("allows retry after an exhausted failed run", async () => {
    latest.mockResolvedValue(row({ status: "failed" })); expect((await resume()).status).toBe(200);
  });
  it("does not resume if the Bible is invalid", async () => {
    bible.mockResolvedValue({ content: {} }); expect((await resume()).status).toBe(409); expect(create).not.toHaveBeenCalled();
  });
});
