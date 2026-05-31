import { beforeEach, describe, expect, it, vi } from "vitest";

/* ---- mocks ---- */

const novelFindUnique = vi.fn();
const runFindFirst = vi.fn();
const jobFindFirst = vi.fn();
const jobCreate = vi.fn();
const jobUpdateMany = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    novel: { findUnique: novelFindUnique },
    novelGenerationRun: { findFirst: runFindFirst },
    backgroundJob: {
      findFirst: jobFindFirst,
      create: jobCreate,
      updateMany: jobUpdateMany,
    },
  },
}));

const getRequiredUserId = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  getRequiredUserId,
}));

const resume = vi.fn();
const markCompleted = vi.fn();

vi.mock("@/lib/agent/generationRun", () => ({
  resume,
  markCompleted,
}));

const enqueueJob = vi.fn();
const sweepStaleRunningJobs = vi.fn();

vi.mock("@/lib/jobs/queue", () => ({
  enqueueJob,
  sweepStaleRunningJobs,
}));

/* ---- helpers ---- */

function mockAuth() {
  getRequiredUserId.mockResolvedValue("user-1");
}

function mockNovel() {
  novelFindUnique.mockResolvedValue({ id: "novel-1", user_id: "user-1" });
}

describe("POST /api/novels/[id]/auto-generate/resume", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    mockNovel();
    sweepStaleRunningJobs.mockResolvedValue(0);
    resume.mockResolvedValue({ id: "run-1", status: "running" });
  });

  it("returns 401 when unauthenticated", async () => {
    getRequiredUserId.mockRejectedValue(new Error("UNAUTHORIZED"));
    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/api/novels/novel-1/auto-generate/resume", { method: "POST" }), {
      params: Promise.resolve({ id: "novel-1", action: "resume" }),
    } as never);
    expect(res.status).toBe(401);
  });

  it("returns 404 when no paused/needs_review run exists", async () => {
    runFindFirst.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/api/novels/novel-1/auto-generate/resume", { method: "POST" }), {
      params: Promise.resolve({ id: "novel-1", action: "resume" }),
    } as never);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe("NO_PAUSED_RUN");
  });

  it("resumes a paused run and re-enqueues next chapter", async () => {
    runFindFirst.mockResolvedValue({
      id: "run-1",
      status: "paused",
      current_chapter: 9,
      total_chapters: 40,
    });
    jobFindFirst.mockResolvedValue(null); // 无在途 job
    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/api/novels/novel-1/auto-generate/resume", { method: "POST" }), {
      params: Promise.resolve({ id: "novel-1", action: "resume" }),
    } as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe("running");
    expect(sweepStaleRunningJobs).toHaveBeenCalledWith("novel-1");
    expect(enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "generate_chapter",
        payload: expect.objectContaining({ chapter_index: 10 }),
      }),
    );
    expect(resume).toHaveBeenCalledWith("run-1");
  });

  it("resumes without re-enqueuing if a pending generate_chapter job already exists", async () => {
    runFindFirst.mockResolvedValue({
      id: "run-1",
      status: "needs_review",
      current_chapter: 5,
      total_chapters: 40,
    });
    jobFindFirst.mockResolvedValue({ id: "job-ch6", status: "pending", type: "generate_chapter" });
    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/api/novels/novel-1/auto-generate/resume", { method: "POST" }), {
      params: Promise.resolve({ id: "novel-1", action: "resume" }),
    } as never);
    expect(res.status).toBe(200);
    expect(enqueueJob).not.toHaveBeenCalled();
    expect(resume).toHaveBeenCalledWith("run-1");
  });

  it("completes the run when next chapter exceeds total", async () => {
    runFindFirst.mockResolvedValue({
      id: "run-1",
      status: "paused",
      current_chapter: 40,
      total_chapters: 40,
    });
    jobFindFirst.mockResolvedValue(null);
    markCompleted.mockResolvedValue({ id: "run-1", status: "completed" });
    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/api/novels/novel-1/auto-generate/resume", { method: "POST" }), {
      params: Promise.resolve({ id: "novel-1", action: "resume" }),
    } as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe("completed");
    expect(markCompleted).toHaveBeenCalledWith("run-1");
  });

  it("returns 400 for unsupported action", async () => {
    const { POST } = await import("./route");
    const res = await POST(new Request("http://localhost/api/novels/novel-1/auto-generate/restart", { method: "POST" }), {
      params: Promise.resolve({ id: "novel-1", action: "restart" }),
    } as never);
    expect(res.status).toBe(400);
  });
});
