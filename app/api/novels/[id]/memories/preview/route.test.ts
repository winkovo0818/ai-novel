import { beforeEach, describe, expect, it, vi } from "vitest";

const findUniqueNovel = vi.fn();
const findManyChapters = vi.fn();
const groupByMemoryChunks = vi.fn();
const findManyVolumeSummaries = vi.fn();
const findUniqueNovelSummary = vi.fn();
const countMemoryChunks = vi.fn();
const findManyMemoryChunks = vi.fn();
const getRequiredUserId = vi.fn();
const retrieveMemories = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    novel: { findUnique: findUniqueNovel },
    chapterDraft: { findMany: findManyChapters },
    memoryChunk: {
      groupBy: groupByMemoryChunks,
      count: countMemoryChunks,
      findMany: findManyMemoryChunks,
    },
    volumeSummary: { findMany: findManyVolumeSummaries },
    novelSummary: { findUnique: findUniqueNovelSummary },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getRequiredUserId,
}));

vi.mock("@/lib/agent/retrieval", () => ({
  retrieveMemories,
}));

vi.mock("@/lib/observability/logger", () => ({
  errorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
  logError: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  getRequiredUserId.mockResolvedValue("user-1");
  findUniqueNovel.mockResolvedValue({ id: "novel-1", user_id: "user-1" });
  findManyChapters.mockResolvedValue([]);
  groupByMemoryChunks.mockResolvedValue([]);
  findManyVolumeSummaries.mockResolvedValue([]);
  findUniqueNovelSummary.mockResolvedValue(null);
  countMemoryChunks.mockResolvedValue(0);
  findManyMemoryChunks.mockResolvedValue([]);
  retrieveMemories.mockResolvedValue({ status: "empty", memories: [] });
});

describe("GET /api/novels/[id]/memories/preview", () => {
  it("returns memory library sections with freshness and pagination", async () => {
    const updated = new Date("2026-05-27T00:00:00.000Z");
    findManyChapters.mockResolvedValue([
      {
        id: "chapter-1",
        chapter_index: 1,
        title: "第一章",
        content: "正文",
        status: "done",
        summary_dirty: false,
        index_dirty: true,
        updated_at: updated,
        summary: { id: "summary-1", summary: "章节摘要", updated_at: updated },
      },
    ]);
    groupByMemoryChunks.mockResolvedValue([{ chapter_id: "chapter-1", _count: { _all: 2 } }]);
    findManyVolumeSummaries.mockResolvedValue([
      {
        id: "volume-1",
        volume_index: 1,
        summary: "卷摘要",
        covered_chapters: ["1"],
        updated_at: updated,
      },
    ]);
    findUniqueNovelSummary.mockResolvedValue({
      id: "novel-summary-1",
      summary: "全书摘要",
      updated_at: updated,
    });
    countMemoryChunks.mockResolvedValue(2);
    findManyMemoryChunks.mockResolvedValue([
      {
        id: "chunk-1",
        chapter_id: "chapter-1",
        chunk_type: "scene",
        text: "记忆片段",
        metadata: { chunk_index: 1 },
        created_at: updated,
        updated_at: updated,
      },
    ]);

    const { GET } = await import("./route");
    const res = await GET(
      new Request("http://localhost/api/novels/novel-1/memories/preview?page=1&page_size=1"),
      { params: Promise.resolve({ id: "novel-1" }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toMatchObject({
      novelId: "novel-1",
      filters: { type: "all" },
      freshness: {
        staleSummaryCount: 0,
        staleIndexCount: 1,
        missingSummaryCount: 0,
        missingIndexCount: 0,
      },
      chapterSummaries: [{ id: "summary-1", freshness: "fresh" }],
      volumeSummaries: [{ id: "volume-1", volumeIndex: 1 }],
      novelSummary: { id: "novel-summary-1" },
      memoryChunks: {
        items: [{ id: "chunk-1", chapterIndex: 1, chapterTitle: "第一章", type: "scene" }],
        pagination: {
          page: 1,
          pageSize: 1,
          total: 2,
          totalPages: 2,
          hasNextPage: true,
          hasPreviousPage: false,
        },
      },
    });
  });

  it("supports chapter and type filters for memory chunks", async () => {
    findManyChapters.mockResolvedValue([
      {
        id: "chapter-2",
        chapter_index: 2,
        title: "第二章",
        content: "正文",
        status: "draft",
        summary_dirty: false,
        index_dirty: false,
        updated_at: new Date("2026-05-27T00:00:00.000Z"),
        summary: null,
      },
    ]);

    const { GET } = await import("./route");
    await GET(
      new Request("http://localhost/api/novels/novel-1/memories/preview?chapter_index=2&type=plot_thread&page_size=5"),
      { params: Promise.resolve({ id: "novel-1" }) },
    );

    expect(findManyChapters).toHaveBeenCalledWith(expect.objectContaining({
      where: { novel_id: "novel-1", chapter_index: 2 },
    }));
    expect(findManyMemoryChunks).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        novel_id: "novel-1",
        chapter_id: { in: ["chapter-2"] },
        chunk_type: "plot_thread",
      },
      take: 5,
    }));
  });

  it("does not fall back to all chunks when a chapter filter matches no chapters", async () => {
    findManyChapters.mockResolvedValue([]);

    const { GET } = await import("./route");
    await GET(
      new Request("http://localhost/api/novels/novel-1/memories/preview?chapter_index=99"),
      { params: Promise.resolve({ id: "novel-1" }) },
    );

    expect(findManyMemoryChunks).toHaveBeenCalledWith(expect.objectContaining({
      where: { novel_id: "novel-1", chapter_id: { in: [] } },
    }));
  });

  it("returns 401 when unauthenticated", async () => {
    getRequiredUserId.mockRejectedValue(new Error("UNAUTHORIZED"));

    const { GET } = await import("./route");
    const res = await GET(
      new Request("http://localhost/api/novels/novel-1/memories/preview"),
      { params: Promise.resolve({ id: "novel-1" }) },
    );

    expect(res.status).toBe(401);
    expect(findManyChapters).not.toHaveBeenCalled();
  });
});

describe("POST /api/novels/[id]/memories/preview", () => {
  it("keeps the generation memory preview response shape", async () => {
    findUniqueNovel.mockResolvedValue({
      id: "novel-1",
      user_id: "user-1",
      bible: { content: minimalBible },
    });
    retrieveMemories.mockResolvedValue({
      status: "success",
      memories: [{ id: "chunk-1", source: "chapter-1", text: "旧线索", reason: "相关", score: 0.8 }],
    });

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/novels/novel-1/memories/preview", {
        method: "POST",
        body: JSON.stringify({ chapter_index: 2 }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({
      status: "success",
      memories: [{ id: "chunk-1", source: "chapter-1", text: "旧线索", reason: "相关", score: 0.8 }],
    });
    expect(retrieveMemories).toHaveBeenCalledWith("novel-1", minimalBible, 2, 5);
  });
});

const minimalBible = {
  meta: { suggested_title: "测试小说", alternative_titles: ["测试一", "测试二", "测试三"] },
  characters: [
    character("protagonist", "主角"),
    character("mentor", "导师"),
    character("antagonist", "反派"),
  ],
  world: {
    setting_summary: "一个用于测试的世界，城市边缘存在多方势力与隐秘规则，主角必须在冲突中逐步理解真相。",
    factions: [
      { name: "测试组织", alignment: "中立", role: "推动剧情" },
      { name: "对照组织", alignment: "敌对", role: "制造阻力" },
    ],
    rules: ["规则一", "规则二"],
    geography: ["地点一", "地点二"],
  },
  outline: {
    volume_1: {
      name: "第一卷",
      theme: "测试",
      chapter_count_estimate: 8,
      chapters: Array.from({ length: 8 }, (_, index) => ({
        index: index + 1,
        title: `第${index + 1}章`,
        summary: "这一章摘要足够长，用于通过 schema 校验并描述冲突。",
      })),
    },
  },
  first_chapter_beats: [
    { beat: 1, scene: "开场", purpose: "建立目标" },
    { beat: 2, scene: "冲突", purpose: "制造阻碍" },
    { beat: 3, scene: "选择", purpose: "推动行动" },
    { beat: 4, scene: "代价", purpose: "展示后果" },
    { beat: 5, scene: "钩子", purpose: "留下悬念" },
  ],
};

function character(role: "protagonist" | "mentor" | "antagonist", name: string) {
  return {
    role,
    name,
    age: role === "mentor" ? "未知" : 18,
    appearance: "外形特征清晰，便于读者记忆。",
    personality: "冷静而执拗，遇到压力会主动行动。",
    catchphrase: "这件事还没完。",
    abilities: ["推理", "观察"],
    goals: "查清隐藏在城市里的旧案真相",
    motivation: "过去的失败让角色无法继续逃避",
    secrets: ["知道一条关键线索"],
    relations: [],
  };
}
