import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
const findUnique = vi.fn();
const update = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    novelGenerationRun: { create, findUnique, update },
  },
}));

describe("generationRun lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // update echoes the patch back merged onto the id so callers can read result fields.
    update.mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
      id: where.id,
      ...data,
    }));
  });

  it("createRun applies defaults (rounds 2 / floor 85 / on_fail / planning / no cap)", async () => {
    const { createRun } = await import("./generationRun");
    create.mockResolvedValue({ id: "run-1" });

    await createRun({ novelId: "novel-1", userId: "user-1", totalChapters: 40 });

    expect(create).toHaveBeenCalledWith({
      data: {
        novel_id: "novel-1",
        user_id: "user-1",
        status: "planning",
        total_chapters: 40,
        revision_rounds: 2,
        quality_floor: 85,
        checkpoint_mode: "on_fail",
        cost_cap_cny: null,
        config: {},
      },
    });
  });

  it("createRun passes through explicit overrides", async () => {
    const { createRun } = await import("./generationRun");
    create.mockResolvedValue({ id: "run-2" });

    await createRun({
      novelId: "novel-1",
      userId: "user-1",
      totalChapters: 12,
      revisionRounds: 3,
      qualityFloor: 90,
      checkpointMode: "per_volume",
      costCapCny: 5,
      config: { model: "mimo-v2.5-pro" },
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        revision_rounds: 3,
        quality_floor: 90,
        checkpoint_mode: "per_volume",
        cost_cap_cny: 5,
        config: { model: "mimo-v2.5-pro" },
      }),
    });
  });

  it("getRun reads by id", async () => {
    const { getRun } = await import("./generationRun");
    findUnique.mockResolvedValue({ id: "run-1" });

    await getRun("run-1");

    expect(findUnique).toHaveBeenCalledWith({ where: { id: "run-1" } });
  });

  it("markRunning sets running and clears last_error", async () => {
    const { markRunning } = await import("./generationRun");
    await markRunning("run-1");
    expect(update).toHaveBeenCalledWith({ where: { id: "run-1" }, data: { status: "running", last_error: null } });
  });

  it("advanceProgress sets current_chapter (not increment) for idempotent re-runs", async () => {
    const { advanceProgress } = await import("./generationRun");
    await advanceProgress("run-1", 7);
    expect(update).toHaveBeenCalledWith({ where: { id: "run-1" }, data: { current_chapter: 7 } });
  });

  it("addCost increments spend and returns the updated row", async () => {
    const { addCost } = await import("./generationRun");
    update.mockResolvedValue({ id: "run-1", cost_cny_spent: 1.5 });

    const result = await addCost("run-1", 0.02);

    expect(update).toHaveBeenCalledWith({ where: { id: "run-1" }, data: { cost_cny_spent: { increment: 0.02 } } });
    expect(result.cost_cny_spent).toBe(1.5);
  });

  it("pause without reason leaves last_error untouched; with reason records it", async () => {
    const { pause } = await import("./generationRun");

    await pause("run-1");
    expect(update).toHaveBeenLastCalledWith({ where: { id: "run-1" }, data: { status: "paused" } });

    await pause("run-1", "cost cap exceeded");
    expect(update).toHaveBeenLastCalledWith({
      where: { id: "run-1" },
      data: { status: "paused", last_error: "cost cap exceeded" },
    });
  });

  it("resume / cancel / markNeedsReview / markCompleted set the expected status", async () => {
    const mod = await import("./generationRun");

    await mod.resume("run-1");
    expect(update).toHaveBeenLastCalledWith({ where: { id: "run-1" }, data: { status: "running", last_error: null } });

    await mod.cancel("run-1");
    expect(update).toHaveBeenLastCalledWith({ where: { id: "run-1" }, data: { status: "cancelled" } });

    await mod.markNeedsReview("run-1", "quality gate failed at ch7");
    expect(update).toHaveBeenLastCalledWith({
      where: { id: "run-1" },
      data: { status: "needs_review", last_error: "quality gate failed at ch7" },
    });

    await mod.markCompleted("run-1");
    expect(update).toHaveBeenLastCalledWith({ where: { id: "run-1" }, data: { status: "completed", last_error: null } });
  });

  it("markFailed truncates the error to 1000 chars", async () => {
    const { markFailed } = await import("./generationRun");
    await markFailed("run-1", "x".repeat(1500));

    const call = update.mock.calls.at(-1)![0] as { data: { status: string; last_error: string } };
    expect(call.data.status).toBe("failed");
    expect(call.data.last_error).toHaveLength(1000);
  });
});
