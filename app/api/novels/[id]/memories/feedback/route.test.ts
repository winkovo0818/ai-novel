import { beforeEach, describe, expect, it, vi } from "vitest";

const findUniqueNovel = vi.fn();
const findUniqueMemoryChunk = vi.fn();
const upsertMemoryFeedback = vi.fn();
const getRequiredUserId = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    novel: { findUnique: findUniqueNovel },
    memoryChunk: { findUnique: findUniqueMemoryChunk },
    memoryFeedback: { upsert: upsertMemoryFeedback },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getRequiredUserId,
}));

beforeEach(() => {
  vi.clearAllMocks();
  findUniqueNovel.mockResolvedValue({ id: "novel-1", user_id: "user-1" });
  findUniqueMemoryChunk.mockResolvedValue({ id: "chunk-1", novel_id: "novel-1" });
  getRequiredUserId.mockResolvedValue("user-1");
  upsertMemoryFeedback.mockResolvedValue({
    id: "feedback-1",
    memory_chunk_id: "chunk-1",
    rating: "irrelevant",
  });
});

describe("POST /api/novels/[id]/memories/feedback", () => {
  it("upserts feedback for a memory chunk without deleting the chunk", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/novels/novel-1/memories/feedback", {
        method: "POST",
        body: JSON.stringify({
          memory_chunk_id: "chunk-1",
          rating: "irrelevant",
          reason: "不该召回这一段",
        }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({
      id: "feedback-1",
      memoryChunkId: "chunk-1",
      rating: "irrelevant",
    });
    expect(upsertMemoryFeedback).toHaveBeenCalledWith({
      where: {
        user_id_memory_chunk_id: {
          user_id: "user-1",
          memory_chunk_id: "chunk-1",
        },
      },
      create: {
        novel_id: "novel-1",
        memory_chunk_id: "chunk-1",
        user_id: "user-1",
        rating: "irrelevant",
        reason: "不该召回这一段",
      },
      update: {
        rating: "irrelevant",
        reason: "不该召回这一段",
      },
    });
  });

  it("hides memory chunks from another novel", async () => {
    findUniqueMemoryChunk.mockResolvedValue({ id: "chunk-1", novel_id: "other-novel" });

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/novels/novel-1/memories/feedback", {
        method: "POST",
        body: JSON.stringify({ memory_chunk_id: "chunk-1", rating: "helpful" }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) },
    );
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe("MEMORY_NOT_FOUND");
    expect(upsertMemoryFeedback).not.toHaveBeenCalled();
  });

  it("rejects invalid ratings", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/novels/novel-1/memories/feedback", {
        method: "POST",
        body: JSON.stringify({ memory_chunk_id: "chunk-1", rating: "delete" }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) },
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("INVALID_INPUT");
    expect(upsertMemoryFeedback).not.toHaveBeenCalled();
  });
});
