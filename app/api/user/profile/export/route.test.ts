import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequiredUserId: vi.fn(),
  userFindUnique: vi.fn(),
  novelFindMany: vi.fn(),
  exportEventCreate: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getRequiredUserId: mocks.getRequiredUserId,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    novel: { findMany: mocks.novelFindMany },
    exportEvent: { create: mocks.exportEventCreate },
  },
}));

import { GET } from "./route";

const now = new Date("2026-05-28T00:00:00.000Z");

function novel(overrides: Record<string, unknown> = {}) {
  return {
    id: "novel-1",
    title: "星河纪",
    profile: { genre_main: "web", genre_sub: "科幻" },
    created_at: now,
    chapters: [
      {
        id: "chapter-1",
        chapter_index: 1,
        title: "第一章",
        content: "第一章正文",
        status: "done",
        target_words: 3000,
        version: 1,
        summary_dirty: false,
        index_dirty: false,
        created_at: now,
        updated_at: now,
        summary: {
          id: "summary-1",
          summary: "第一章摘要",
          created_at: now,
          updated_at: now,
        },
      },
    ],
    bible: {
      id: "bible-1",
      content: {
        meta: { suggested_title: "星河纪" },
        story_state: {
          timeline: [{ chapter_index: 1, event: "主角启程" }],
        },
      },
      created_at: now,
      updated_at: now,
    },
    volume_summaries: [],
    novel_summary: {
      id: "novel-summary-1",
      summary: "全书摘要",
      created_at: now,
      updated_at: now,
    },
    memory_chunks: [
      {
        id: "memory-1",
        chapter_id: "chapter-1",
        chunk_type: "scene",
        text: "主角在第一章启程。",
        content_hash: "hash-1",
        importance: 1,
        source_kind: "chapter",
        last_used_at: null,
        metadata: { reason: "plot" },
        created_at: now,
        updated_at: now,
        embedding: "should-not-export",
      },
    ],
    ...overrides,
  };
}

describe("GET /api/user/profile/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequiredUserId.mockResolvedValue("user-1");
    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      name: "作者",
      email: "author@example.com",
      image: null,
      created_at: now,
      updated_at: now,
    });
    mocks.novelFindMany.mockResolvedValue([novel()]);
    mocks.exportEventCreate.mockResolvedValue({});
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.getRequiredUserId.mockRejectedValue(new Error("UNAUTHORIZED"));

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.novelFindMany).not.toHaveBeenCalled();
  });

  it("exports the current user's account and novel data", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(decodeURIComponent(response.headers.get("Content-Disposition") ?? "")).toContain("作者-data.json");
    expect(mocks.novelFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { user_id: "user-1", deleted_at: null },
    }));

    const json = await response.json();
    expect(json).toMatchObject({
      export_schema_version: 1,
      user: {
        id: "user-1",
        email: "author@example.com",
      },
      novels: [
        {
          id: "novel-1",
          title: "星河纪",
          chapters: [
            {
              id: "chapter-1",
              summary: { summary: "第一章摘要" },
            },
          ],
          summaries: {
            novel: { summary: "全书摘要" },
          },
          memory_chunks: [
            {
              id: "memory-1",
              text: "主角在第一章启程。",
              chapter_index: 1,
            },
          ],
        },
      ],
    });
    expect(json.novels[0].story_state.timeline[0].event).toBe("主角启程");
    expect(JSON.stringify(json)).not.toContain("should-not-export");
    expect(JSON.stringify(json)).not.toContain("embedding");
    expect(mocks.exportEventCreate).toHaveBeenCalledWith({
      data: {
        user_id: "user-1",
        novel_id: null,
        scope: "profile",
        format: "json",
        status: "ok",
        error_code: null,
      },
    });
  });

  it("returns 404 when the current user row no longer exists", async () => {
    mocks.userFindUnique.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(404);
    expect(mocks.novelFindMany).not.toHaveBeenCalled();
  });
});
