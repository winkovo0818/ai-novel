import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NovelGenerationRun, Prisma } from "@prisma/client";
const m = vi.hoisted(() => ({ candidates: vi.fn(), latest: vi.fn(), lock: vi.fn(), job: vi.fn(), create: vi.fn(), update: vi.fn() }));
const tx = { $queryRaw: vi.fn(), novelGenerationRun: { findUnique: m.latest, updateMany: m.lock, update: m.update }, backgroundJob: { findFirst: m.job, create: m.create } };
vi.mock("@/lib/db", () => ({ prisma: { novelGenerationRun: { findMany: m.candidates }, $transaction: async (fn: (tx: unknown) => unknown) => fn(tx) } }));
import { ensureGenerationJob, generationJobWhere, reconcileGenerationRuns } from "./generationScheduling";
const row = (extra = {}) => ({ id: "r", novel_id: "n", status: "running", current_chapter: 8, total_chapters: 18, cost_cap_cny: 5, cost_cny_spent: 0, ...extra }) as NovelGenerationRun;
beforeEach(() => { vi.resetAllMocks(); m.candidates.mockResolvedValue([{ id: "r", novel_id: "n" }]); m.latest.mockResolvedValue(row()); m.lock.mockResolvedValue({ count: 1 }); m.job.mockResolvedValue(null); });
describe("generation chain reconciliation", () => {
  it("identifies chapters and planning horizons independently", () => {
    expect(generationJobWhere(row()).AND).toContainEqual({ payload: { path: ["chapter_index"], equals: 9 } });
    expect(generationJobWhere(row({ status: "planning" })).AND).toContainEqual({ payload: { path: ["target_chapters"], equals: 18 } });
  });
  it.each(["running", "planning"])("recreates a missing %s successor", async status => {
    m.latest.mockResolvedValue(row({ status })); expect(await reconcileGenerationRuns("n")).toBe(1);
    expect(m.create.mock.calls[0][0].data.type).toBe(status === "running" ? "generate_chapter" : "plan_outline");
    expect(m.candidates.mock.calls[0][0].where.novel_id).toBe("n");
  });
  it("keeps an existing successor and never duplicates it", async () => { m.job.mockResolvedValue({ status: "pending" }); expect(await reconcileGenerationRuns()).toBe(0); expect(m.create).not.toHaveBeenCalled(); });
  it("deduplicates explicit resumption against inflight work", async () => {
    m.job.mockResolvedValue({ status: "running" }); expect(await ensureGenerationJob(tx as unknown as Prisma.TransactionClient, row())).toBe(false);
  });
  it.each([null, row({ status: "paused" }), row({ status: "cancelled" })])("does not resurrect a changed run", async run => { m.latest.mockResolvedValue(run); expect(await reconcileGenerationRuns()).toBe(0); expect(m.create).not.toHaveBeenCalled(); });
  it("stops if a finishing handler wins the row lock", async () => { m.lock.mockResolvedValue({ count: 0 }); expect(await reconcileGenerationRuns()).toBe(0); expect(m.job).not.toHaveBeenCalled(); });
  it.each(["model failed", null])("marks exhausted work failed instead of silently restarting", async last_error => {
    m.job.mockResolvedValueOnce(null).mockResolvedValueOnce({ status: "failed", last_error });
    expect(await reconcileGenerationRuns()).toBe(1); expect(m.update.mock.calls[0][0].data.status).toBe("failed"); expect(m.create).not.toHaveBeenCalled();
  });
  it("pauses an orphan at its cost cap", async () => {
    m.latest.mockResolvedValue(row({ cost_cny_spent: 5 })); expect(await reconcileGenerationRuns()).toBe(1);
    expect(m.update.mock.calls[0][0].data.status).toBe("paused"); expect(m.create).not.toHaveBeenCalled();
  });
  it("also schedules runs with no cap, and does not count a deduplication race as a repair", async () => {
    m.latest.mockResolvedValue(row({ cost_cap_cny: null })); m.job.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce({ status: "pending" });
    expect(await reconcileGenerationRuns()).toBe(0); expect(m.create).not.toHaveBeenCalled();
  });
});
