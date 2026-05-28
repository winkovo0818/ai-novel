import { beforeEach, describe, expect, it, vi } from "vitest";

const findUniqueNovel = vi.fn();
const findUniqueJob = vi.fn();
const updateJob = vi.fn();
const getRequiredUserId = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    novel: { findUnique: findUniqueNovel },
    backgroundJob: {
      findUnique: findUniqueJob,
      update: updateJob,
    },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getRequiredUserId,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/novels/[id]/jobs/[jobId]/retry", () => {
  it("returns 404 when the novel does not exist", async () => {
    findUniqueNovel.mockResolvedValue(null);

    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/api/novels/missing/jobs/j-1/retry", { method: "POST" }), {
      params: Promise.resolve({ id: "missing", jobId: "j-1" }),
    });

    expect(res.status).toBe(404);
    expect(findUniqueJob).not.toHaveBeenCalled();
    expect(updateJob).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    findUniqueNovel.mockResolvedValue({ id: "n-1", user_id: "u-1" });
    getRequiredUserId.mockRejectedValue(new Error("UNAUTHORIZED"));

    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/api/novels/n-1/jobs/j-1/retry", { method: "POST" }), {
      params: Promise.resolve({ id: "n-1", jobId: "j-1" }),
    });

    expect(res.status).toBe(401);
    expect(updateJob).not.toHaveBeenCalled();
  });

  it("hides another user's novel as 404", async () => {
    findUniqueNovel.mockResolvedValue({ id: "n-1", user_id: "u-other" });
    getRequiredUserId.mockResolvedValue("u-1");

    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/api/novels/n-1/jobs/j-1/retry", { method: "POST" }), {
      params: Promise.resolve({ id: "n-1", jobId: "j-1" }),
    });

    expect(res.status).toBe(404);
    expect(updateJob).not.toHaveBeenCalled();
  });

  it("returns 404 when the job does not belong to the novel", async () => {
    findUniqueNovel.mockResolvedValue({ id: "n-1", user_id: "u-1" });
    getRequiredUserId.mockResolvedValue("u-1");
    findUniqueJob.mockResolvedValue({ id: "j-1", novel_id: "other", status: "failed" });

    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/api/novels/n-1/jobs/j-1/retry", { method: "POST" }), {
      params: Promise.resolve({ id: "n-1", jobId: "j-1" }),
    });

    expect(res.status).toBe(404);
    expect(updateJob).not.toHaveBeenCalled();
  });

  it.each(["pending", "running", "done"])("rejects %s jobs as not retryable", async (status) => {
    findUniqueNovel.mockResolvedValue({ id: "n-1", user_id: "u-1" });
    getRequiredUserId.mockResolvedValue("u-1");
    findUniqueJob.mockResolvedValue({ id: "j-1", novel_id: "n-1", status });

    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/api/novels/n-1/jobs/j-1/retry", { method: "POST" }), {
      params: Promise.resolve({ id: "n-1", jobId: "j-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error.code).toBe("JOB_NOT_RETRYABLE");
    expect(updateJob).not.toHaveBeenCalled();
  });

  it("resets a failed job to pending without running it", async () => {
    findUniqueNovel.mockResolvedValue({ id: "n-1", user_id: "u-1" });
    getRequiredUserId.mockResolvedValue("u-1");
    findUniqueJob.mockResolvedValue({
      id: "j-1",
      novel_id: "n-1",
      status: "failed",
      last_error: "boom",
    });
    updateJob.mockResolvedValue({
      id: "j-1",
      status: "pending",
      last_error: null,
    });

    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/api/novels/n-1/jobs/j-1/retry", { method: "POST" }), {
      params: Promise.resolve({ id: "n-1", jobId: "j-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(updateJob).toHaveBeenCalledWith({
      where: { id: "j-1" },
      data: {
        status: "pending",
        attempts: 0,
        last_error: null,
        finished_at: null,
      },
    });
    expect(json.data).toEqual({
      id: "j-1",
      status: "pending",
      last_error: null,
    });
  });
});
