import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ candidates: vi.fn(), novel: vi.fn(), resume: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { novelGenerationRun: { findMany: m.candidates, updateMany: m.update }, novel: { findUnique: m.novel } } }));
vi.mock("./autoGeneration", () => ({ resumeGeneration: m.resume }));
import { wakeScheduledGenerationRuns } from "./generationWake";
beforeEach(() => { vi.resetAllMocks(); m.candidates.mockResolvedValue([{ id: "r", novel_id: "n", user_id: "u" }]); m.novel.mockResolvedValue({ user_id: "u" }); m.resume.mockResolvedValue({ status: "running" }); });
describe("scheduled generation wakeup", () => {
  it("selects only due resource pauses and delegates atomic resumption", async () => { const now = new Date(); expect(await wakeScheduledGenerationRuns("n", now)).toBe(1); expect(m.candidates.mock.calls[0][0].where).toMatchObject({ status: "paused", pause_reason: { in: ["daily_budget", "quota"] }, resume_after: { lte: now }, novel_id: "n" }); expect(m.resume).toHaveBeenCalledWith("n", "r", true, now); });
  it.each([null, { user_id: "other" }, { user_id: "u", deleted_at: new Date() }])("does not revive removed or reassigned novels %j", async novel => { m.novel.mockResolvedValue(novel); expect(await wakeScheduledGenerationRuns()).toBe(0); expect(m.resume).not.toHaveBeenCalled(); expect(m.update).toHaveBeenCalled(); });
  it("does not count a blocked or concurrent resumption as a wakeup", async () => { m.resume.mockResolvedValue({ error: "draft needs review" }); expect(await wakeScheduledGenerationRuns()).toBe(0); });
  it("handles an empty schedule", async () => { m.candidates.mockResolvedValue([]); expect(await wakeScheduledGenerationRuns()).toBe(0); });
});

it("a broken wakeup does not prevent another run from waking", async () => {
  m.candidates.mockResolvedValue([{id: "broken", novel_id: "n", user_id: "u"}, {id: "valid", novel_id: "n", user_id: "u"}]);
  m.resume.mockRejectedValueOnce(new Error("temporary database error")).mockResolvedValueOnce({status: "running"});
  expect(await wakeScheduledGenerationRuns()).toBe(1);
});
