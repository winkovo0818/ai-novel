import { describe, expect, it, vi } from "vitest";
import type { BackgroundJob } from "@prisma/client";
const { updateMany } = vi.hoisted(() => ({ updateMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { backgroundJob: { updateMany } } }));
import { createJobExecution } from "./execution";
const job = { id: "job", started_at: new Date(0) } as BackgroundJob;
describe("job execution leases", () => {
  it("matches the exact lease and refreshes its heartbeat", async () => {
    updateMany.mockResolvedValue({ count: 1 }); await createJobExecution(job, new AbortController().signal).assertActive();
    expect(updateMany).toHaveBeenCalledWith({ where: { id: "job", status: "running", started_at: new Date(0) }, data: { updated_at: expect.any(Date) } });
  });
  it("rejects a replaced lease", async () => {
    updateMany.mockResolvedValue({ count: 0 }); await expect(createJobExecution(job, new AbortController().signal).assertActive()).rejects.toThrow("replaced");
  });
  it("rejects cancelled work before any database write", async () => {
    updateMany.mockClear(); const controller = new AbortController(); controller.abort();
    await expect(createJobExecution(job, controller.signal).assertActive()).rejects.toThrow(); expect(updateMany).not.toHaveBeenCalled();
  });
});
