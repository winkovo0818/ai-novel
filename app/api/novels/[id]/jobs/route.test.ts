import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const findMany = vi.fn();
const create = vi.fn();
const updateMany = vi.fn();
const update = vi.fn();
const findUniqueJob = vi.fn();
const getRequiredUserId = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    novel: { findUnique },
    backgroundJob: {
      findMany,
      create,
      updateMany,
      update,
      findUnique: findUniqueJob,
    },
  },
}));

vi.mock("@/utils/supabase/auth", () => ({
  getRequiredUserId,
}));

// Side-effect import has to be quiet in tests.
vi.mock("@/lib/jobs/handlers", () => ({}));

beforeEach(() => {
  vi.clearAllMocks();
  // Default: drained queue so background drain calls find nothing.
  findMany.mockResolvedValue([]);
});

describe("POST /api/novels/[id]/jobs", () => {
  it("rejects an invalid payload with 400", async () => {
    findUnique.mockResolvedValue({ id: "n-1", user_id: "u-1" });
    getRequiredUserId.mockResolvedValue("u-1");

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/novels/n-1/jobs", {
        method: "POST",
        body: JSON.stringify({ jobs: [{ type: "not_a_real_type", payload: {} }] }),
      }),
      { params: Promise.resolve({ id: "n-1" }) },
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("INVALID_INPUT");
    expect(create).not.toHaveBeenCalled();
  });

  it("returns 401 when not authenticated", async () => {
    findUnique.mockResolvedValue({ id: "n-1", user_id: "u-1" });
    getRequiredUserId.mockRejectedValue(new Error("UNAUTHORIZED"));

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/novels/n-1/jobs", {
        method: "POST",
        body: JSON.stringify({ jobs: [{ type: "summarize_chapter", payload: { chapter_id: "c" } }] }),
      }),
      { params: Promise.resolve({ id: "n-1" }) },
    );

    expect(res.status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });

  it("hides another user's novel as 404", async () => {
    findUnique.mockResolvedValue({ id: "n-1", user_id: "u-other" });
    getRequiredUserId.mockResolvedValue("u-1");

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/novels/n-1/jobs", {
        method: "POST",
        body: JSON.stringify({ jobs: [{ type: "summarize_chapter", payload: { chapter_id: "c" } }] }),
      }),
      { params: Promise.resolve({ id: "n-1" }) },
    );

    expect(res.status).toBe(404);
    expect(create).not.toHaveBeenCalled();
  });

  it("enqueues each requested job and returns the persisted ids", async () => {
    findUnique.mockResolvedValue({ id: "n-1", user_id: "u-1" });
    getRequiredUserId.mockResolvedValue("u-1");
    create
      .mockResolvedValueOnce({ id: "j-1", type: "summarize_chapter", status: "pending" })
      .mockResolvedValueOnce({ id: "j-2", type: "index_chapter", status: "pending" });

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/novels/n-1/jobs", {
        method: "POST",
        body: JSON.stringify({
          jobs: [
            { type: "summarize_chapter", payload: { chapter_id: "c-1" } },
            { type: "index_chapter", payload: { novel_id: "n-1", chapter_id: "c-1" } },
          ],
        }),
      }),
      { params: Promise.resolve({ id: "n-1" }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.enqueued).toHaveLength(2);
    expect(json.data.enqueued[0].id).toBe("j-1");
    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenNthCalledWith(1, {
      data: {
        novel_id: "n-1",
        type: "summarize_chapter",
        payload: { chapter_id: "c-1" },
        status: "pending",
      },
    });
  });
});

describe("GET /api/novels/[id]/jobs", () => {
  it("returns the most recent jobs and a status summary", async () => {
    findUnique.mockResolvedValue({ id: "n-1", user_id: "u-1" });
    getRequiredUserId.mockResolvedValue("u-1");
    findMany.mockResolvedValue([
      { id: "j1", type: "summarize_chapter", status: "running", attempts: 0, last_error: null, created_at: new Date(), finished_at: null },
      { id: "j2", type: "index_chapter", status: "failed", attempts: 3, last_error: "boom", created_at: new Date(), finished_at: new Date() },
      { id: "j3", type: "summarize_chapter", status: "done", attempts: 1, last_error: null, created_at: new Date(), finished_at: new Date() },
      { id: "j4", type: "refresh_summaries", status: "pending", attempts: 0, last_error: null, created_at: new Date(), finished_at: null },
    ]);

    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/novels/n-1/jobs"), {
      params: Promise.resolve({ id: "n-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.jobs).toHaveLength(4);
    expect(json.data.summary).toEqual({ pending: 1, running: 1, failed: 1 });
  });

  it("returns 401 when not authenticated", async () => {
    findUnique.mockResolvedValue({ id: "n-1", user_id: "u-1" });
    getRequiredUserId.mockRejectedValue(new Error("UNAUTHORIZED"));

    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/novels/n-1/jobs"), {
      params: Promise.resolve({ id: "n-1" }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 404 for a different user's novel", async () => {
    findUnique.mockResolvedValue({ id: "n-1", user_id: "u-other" });
    getRequiredUserId.mockResolvedValue("u-1");

    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/novels/n-1/jobs"), {
      params: Promise.resolve({ id: "n-1" }),
    });

    expect(res.status).toBe(404);
  });
});
