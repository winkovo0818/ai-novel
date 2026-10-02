import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NovelGenerationRun } from "@prisma/client";
const m = vi.hoisted(() => ({ candidates: vi.fn(), latest: vi.fn(), novel: vi.fn(), existing: vi.fn(), save: vi.fn(), resolve: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { novelGenerationRun: { findMany: m.candidates }, novelGenerationAlert: { updateMany: m.resolve },
  $transaction: async (fn: (tx: unknown) => unknown) => fn({ $queryRaw: m.query, novelGenerationRun: { findUniqueOrThrow: m.latest }, novel: { findUnique: m.novel }, novelGenerationAlert: { findUnique: m.existing, upsert: m.save, updateMany: m.resolve } }) } }));
import { generationAlert, reconcileGenerationAlerts } from "./generationAlerts";
const now = new Date("2026-10-02T00:00:00Z");
const run = (extra = {}) => ({ id: "r", status: "running", last_error: null, pause_reason: null, last_progress_at: now, ...extra }) as NovelGenerationRun;
beforeEach(() => { vi.resetAllMocks(); m.candidates.mockResolvedValue([run({ status: "needs_review" })]); m.latest.mockResolvedValue(run({ status: "needs_review" })); m.novel.mockResolvedValue({ deleted_at: null }); m.existing.mockResolvedValue(null); });
describe("actionable generation alerts", () => {
  it.each([{ status: "needs_review", kind: "review" }, { status: "paused", pause_reason: "volume_review", kind: "review" }, { status: "failed", kind: "failed" }, { status: "paused", pause_reason: "total_budget", kind: "budget" }])("identifies $kind actions", ({kind,...data}) => { expect(generationAlert(run(data), now)?.kind).toBe(kind); expect(generationAlert(run({ ...data, last_error: "具体原因" }), now)?.message).toBe("具体原因"); });
  it("does not alert for manual pauses or scheduled resource waits", () => { expect(generationAlert(run({ status: "paused", pause_reason: "daily_budget" }), now)).toBeNull(); expect(generationAlert(run({ status: "paused", pause_reason: "manual" }), now)).toBeNull(); });
  it("detects missing progress with a bounded, configurable timeout", () => {
    expect(generationAlert(run({ last_progress_at: new Date(now.getTime() - 31 * 60_000) }), now)?.kind).toBe("stalled");
    vi.stubEnv("GENERATION_STALL_ALERT_MS", "invalid"); expect(generationAlert(run(), now)).toBeNull();
    vi.stubEnv("GENERATION_STALL_ALERT_MS", "60000"); expect(generationAlert(run({ last_progress_at: new Date(now.getTime() - 60_000) }), now)?.kind).toBe("stalled"); vi.unstubAllEnvs();
  });
  it("persists one deduplicated active reminder", async () => { await reconcileGenerationAlerts("n", now); expect(m.save.mock.calls[0][0].create).toMatchObject({ run_id: "r", kind: "review" }); expect(m.candidates.mock.calls[0][0].where.novel_id).toBe("n"); });
  it("keeps an acknowledged but unresolved alert acknowledged across sweeps", async () => { m.existing.mockResolvedValue({ resolved_at: null, read_at: now, message: "连载需要人工复核，请处理后恢复" }); await reconcileGenerationAlerts(undefined, now); expect(m.save).not.toHaveBeenCalled(); });
  it("renotifies after an alert was resolved or its reason changed", async () => { m.existing.mockResolvedValue({ resolved_at: now, message: "旧问题" }); await reconcileGenerationAlerts(undefined, now); expect(m.save.mock.calls[0][0].update).toMatchObject({ read_at: null, resolved_at: null }); });
  it.each([null, { deleted_at: now }])("resolves alerts for removed novels %j", async novel => { m.novel.mockResolvedValue(novel); await reconcileGenerationAlerts(); expect(m.save).not.toHaveBeenCalled(); expect(m.resolve).toHaveBeenCalled(); });
  // 固定 now：夹具 last_progress_at 是 2026-10-02T00:00:00Z，不传 now 会用真实
  // 时钟，真实时间跨过 00:30Z（stall 阈值）后该用例必然失败（时间炸弹）。
  it("resolves recovered and terminal statuses without notifying", async () => { m.latest.mockResolvedValue(run()); await reconcileGenerationAlerts(undefined, now); expect(m.save).not.toHaveBeenCalled(); expect(m.resolve.mock.calls.at(-1)![0].where.run.status.in).toEqual(["completed", "cancelled"]); });
  it("pages through more than one batch without starving later runs", async () => { m.candidates.mockResolvedValueOnce(Array.from({ length: 100 }, (_, i) => ({ id: `r${i}` }))).mockResolvedValueOnce([]); await reconcileGenerationAlerts(); expect(m.candidates).toHaveBeenCalledTimes(2); expect(m.candidates.mock.calls[1][0]).toMatchObject({ cursor: { id: "r99" }, skip: 1 }); });
  it("handles an empty database", async () => { m.candidates.mockResolvedValue([]); await reconcileGenerationAlerts(); expect(m.save).not.toHaveBeenCalled(); });
});
