import { describe, it, expect, vi, beforeEach } from "vitest";

let mockNovel: unknown;
let mockUserId: string | null;
let mockModerationAllowed: boolean;
const moderateContentMock = vi.fn();
const exportEventCreateMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: {
    novel: {
      findUnique: () => Promise.resolve(mockNovel),
    },
    exportEvent: {
      create: exportEventCreateMock,
    },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getRequiredUserId: () => {
    if (!mockUserId) throw new Error("Unauthorized");
    return Promise.resolve(mockUserId);
  },
}));

vi.mock("@/lib/moderation/moderate", () => ({
  moderateContent: (input: unknown) => {
    moderateContentMock(input);
    return Promise.resolve({
      allowed: mockModerationAllowed,
      code: mockModerationAllowed ? undefined : "MODERATION_BLOCKED",
      reason: mockModerationAllowed ? undefined : "内容审核未通过",
    });
  },
  stringifyForModeration: (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v)),
}));

function makeBible() {
  return {
    meta: { suggested_title: "测试书名", alternative_titles: ["备选一", "备选二", "备选三"] },
    characters: [
      {
        role: "protagonist",
        name: "主角",
        age: 18,
        appearance: "少年",
        personality: "坚韧",
        catchphrase: "我会回来",
        abilities: ["剑术"],
        goals: "完成旅程",
        motivation: "保护故乡",
        secrets: ["身世"],
        relations: ["导师"],
      },
      {
        role: "mentor",
        name: "导师",
        age: 40,
        appearance: "白衣",
        personality: "沉稳",
        catchphrase: "慢一点",
        abilities: ["医术"],
        goals: "培养主角",
        motivation: "赎罪",
        secrets: ["旧案"],
        relations: ["主角"],
      },
      {
        role: "antagonist",
        name: "反派",
        age: 35,
        appearance: "黑袍",
        personality: "偏执",
        catchphrase: "规则属于胜者",
        abilities: ["谋略"],
        goals: "夺取权力",
        motivation: "复仇",
        secrets: ["内应"],
        relations: ["主角"],
      },
    ],
    world: {
      setting_summary: "一个被风暴隔开的群岛世界，航线与古老规则决定所有人的命运，每座岛屿都依赖灯塔维持通行秩序。",
      factions: [
        { name: "灯塔会", alignment: "中立", role: "维护航线" },
        { name: "黑帆", alignment: "敌对", role: "劫掠商船" },
      ],
      rules: ["风暴夜不可点灯", "旧航线只在涨潮时出现"],
      geography: ["灯塔港", "沉船湾"],
    },
    outline: {
      volume_1: {
        name: "序章卷",
        theme: "启程",
        chapter_count_estimate: 8,
        chapters: Array.from({ length: 8 }, (_, index) => ({
          index: index + 1,
          title: `第${index + 1}章`,
          summary: `第${index + 1}章发生关键事件，推动主角离开安全地带并继续追查旧航线真相。`,
        })),
      },
    },
    first_chapter_beats: Array.from({ length: 5 }, (_, index) => ({
      beat: index + 1,
      scene: `场景${index + 1}`,
      purpose: `目的${index + 1}`,
    })),
    story_state: {
      characters: [
        {
          name: "主角",
          current_location: "灯塔港",
          current_goal: "找到旧航线",
        },
      ],
      timeline: [{ chapter_index: 1, event: "主角离开灯塔港", impact: "旅程开始" }],
      plot_threads: [{ id: "old-route", title: "旧航线", status: "progressing" }],
    },
  };
}

function makeNovel(overrides?: Record<string, unknown>) {
  const now = new Date("2026-05-28T00:00:00.000Z");
  return {
    id: "novel-1",
    title: "测试小说",
    user_id: "user-1",
    profile: { genre_main: "web", genre_sub: "玄幻" },
    created_at: now,
    chapters: [
      {
        id: "chapter-1",
        chapter_index: 1,
        title: "第一章 起点",
        content: "这是第一章的内容。",
        status: "done",
        target_words: 3000,
        version: 2,
        summary_dirty: false,
        index_dirty: false,
        created_at: now,
        updated_at: now,
        summary: {
          id: "summary-1",
          summary: "主角离开灯塔港。",
          created_at: now,
          updated_at: now,
        },
      },
      {
        id: "chapter-2",
        chapter_index: 2,
        title: "第二章 远方",
        content: "这是第二章的内容。",
        status: "draft",
        target_words: null,
        version: 1,
        summary_dirty: true,
        index_dirty: true,
        created_at: now,
        updated_at: now,
        summary: null,
      },
    ],
    bible: { id: "bible-1", content: makeBible(), created_at: now, updated_at: now },
    volume_summaries: [
      {
        id: "volume-summary-1",
        volume_index: 1,
        summary: "第一卷讲述主角启程。",
        covered_chapters: ["1", "2"],
        created_at: now,
        updated_at: now,
      },
    ],
    novel_summary: {
      id: "novel-summary-1",
      summary: "全书围绕旧航线展开。",
      created_at: now,
      updated_at: now,
    },
    memory_chunks: [
      {
        id: "memory-1",
        chapter_id: "chapter-1",
        chunk_type: "scene",
        text: "旧航线只在涨潮时出现。",
        content_hash: "hash-1",
        importance: 1.2,
        source_kind: "chapter",
        last_used_at: now,
        metadata: { reason: "world_rule" },
        created_at: now,
        updated_at: now,
        embedding: "should-not-export",
      },
    ],
    ...overrides,
  };
}

import { GET } from "./route";

describe("GET /api/novels/[id]/export", () => {
  beforeEach(() => {
    mockNovel = makeNovel();
    mockUserId = "user-1";
    mockModerationAllowed = true;
    moderateContentMock.mockClear();
    exportEventCreateMock.mockClear();
    exportEventCreateMock.mockResolvedValue({});
  });

  it("returns 401 when not authenticated", async () => {
    mockUserId = null;
    const response = await GET(new Request("http://localhost/api/novels/novel-1/export?format=markdown"), {
      params: Promise.resolve({ id: "novel-1" }),
    });
    expect(response.status).toBe(401);
  });

  it("returns 404 for non-existent novel", async () => {
    mockNovel = null;
    const response = await GET(new Request("http://localhost/api/novels/novel-1/export?format=markdown"), {
      params: Promise.resolve({ id: "novel-1" }),
    });
    expect(response.status).toBe(404);
  });

  it("returns 404 when user is not the owner", async () => {
    mockUserId = "user-2";
    const response = await GET(new Request("http://localhost/api/novels/novel-1/export?format=markdown"), {
      params: Promise.resolve({ id: "novel-1" }),
    });
    expect(response.status).toBe(404);
  });

  it("returns markdown export with correct content", async () => {
    const response = await GET(new Request("http://localhost/api/novels/novel-1/export?format=markdown"), {
      params: Promise.resolve({ id: "novel-1" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/markdown");

    const text = await response.text();
    expect(text).toContain("# 测试小说");
    expect(text).toContain("## 第一章 起点");
    expect(text).toContain("这是第一章的内容。");
    expect(text).toContain("## 第二章 远方");
    expect(text).toContain("这是第二章的内容。");

    const disposition = response.headers.get("Content-Disposition") ?? "";
    expect(disposition).toContain("attachment");
    expect(disposition).toContain(".md");
    expect(exportEventCreateMock).toHaveBeenCalledWith({
      data: {
        user_id: "user-1",
        novel_id: "novel-1",
        scope: "novel",
        format: "markdown",
        status: "ok",
        error_code: null,
      },
    });
  });

  it("returns txt export with correct content", async () => {
    const response = await GET(new Request("http://localhost/api/novels/novel-1/export?format=txt"), {
      params: Promise.resolve({ id: "novel-1" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/plain");

    const text = await response.text();
    expect(text).toContain("测试小说");
    expect(text).toContain("第一章 起点");
    expect(text).toContain("这是第一章的内容。");

    const disposition = response.headers.get("Content-Disposition") ?? "";
    expect(disposition).toContain(".txt");
  });

  it("exports only chapters matched by range", async () => {
    mockNovel = makeNovel({
      chapters: [
        { chapter_index: 1, title: "第一章 起点", content: "这是第一章的内容。", status: "done" },
        { chapter_index: 2, title: "第二章 远方", content: "这是第二章的内容。", status: "draft" },
        { chapter_index: 3, title: "第三章 回声", content: "这是第三章的内容。", status: "draft" },
      ],
    });

    const response = await GET(new Request("http://localhost/api/novels/novel-1/export?format=markdown&range=2-3"), {
      params: Promise.resolve({ id: "novel-1" }),
    });

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain("第一章 起点");
    expect(text).toContain("第二章 远方");
    expect(text).toContain("第三章 回声");
    expect(moderateContentMock).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining("这是第二章的内容。\\n这是第三章的内容。"),
    }));
  });

  it("returns an empty export when range matches no drafted chapters", async () => {
    const response = await GET(new Request("http://localhost/api/novels/novel-1/export?format=markdown&range=9-10"), {
      params: Promise.resolve({ id: "novel-1" }),
    });

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("# 测试小说");
    expect(text).not.toContain("第一章 起点");
    expect(text).not.toContain("第二章 远方");
    expect(moderateContentMock).not.toHaveBeenCalled();
  });

  it("appends bible appendix when include_bible is true", async () => {
    const response = await GET(new Request("http://localhost/api/novels/novel-1/export?format=markdown&include_bible=true"), {
      params: Promise.resolve({ id: "novel-1" }),
    });

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("## 作品设定 Bible");
    expect(text).toContain("主角");
    expect(text).toContain("旧航线只在涨潮时出现");
  });

  it("omits bible appendix when include_bible is false", async () => {
    const response = await GET(new Request("http://localhost/api/novels/novel-1/export?format=markdown&include_bible=false"), {
      params: Promise.resolve({ id: "novel-1" }),
    });

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain("作品设定 Bible");
  });

  it("returns 400 for invalid range", async () => {
    const response = await GET(new Request("http://localhost/api/novels/novel-1/export?format=markdown&range=5-2"), {
      params: Promise.resolve({ id: "novel-1" }),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_RANGE" },
    });
    expect(exportEventCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "err", error_code: "INVALID_RANGE" }),
    }));
  });

  it("returns 400 for invalid include_bible", async () => {
    const response = await GET(new Request("http://localhost/api/novels/novel-1/export?format=markdown&include_bible=maybe"), {
      params: Promise.resolve({ id: "novel-1" }),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_INCLUDE_BIBLE" },
    });
  });

  it("returns 400 for invalid format", async () => {
    const response = await GET(new Request("http://localhost/api/novels/novel-1/export?format=pdf"), {
      params: Promise.resolve({ id: "novel-1" }),
    });
    expect(response.status).toBe(400);
  });

  it("defaults to markdown when format is missing", async () => {
    const response = await GET(new Request("http://localhost/api/novels/novel-1/export"), {
      params: Promise.resolve({ id: "novel-1" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/markdown");
  });

  it("returns docx export with correct content type and PK signature", async () => {
    const response = await GET(new Request("http://localhost/api/novels/novel-1/export?format=docx"), {
      params: Promise.resolve({ id: "novel-1" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("wordprocessingml.document");

    const buf = new Uint8Array(await response.arrayBuffer());
    // .docx is a ZIP container — first two bytes are "PK" (0x50 0x4B).
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);

    const disposition = response.headers.get("Content-Disposition") ?? "";
    expect(disposition).toContain(".docx");
  });

  it("returns epub export with correct content type and PK signature", async () => {
    const response = await GET(new Request("http://localhost/api/novels/novel-1/export?format=epub"), {
      params: Promise.resolve({ id: "novel-1" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("epub+zip");

    const buf = new Uint8Array(await response.arrayBuffer());
    // .epub is also a ZIP container.
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);

    const disposition = response.headers.get("Content-Disposition") ?? "";
    expect(disposition).toContain(".epub");
  });

  it("returns complete json export with summaries and memory metadata", async () => {
    const response = await GET(new Request("http://localhost/api/novels/novel-1/export?format=json&range=2&include_bible=false"), {
      params: Promise.resolve({ id: "novel-1" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    const json = await response.json();
    expect(json).toMatchObject({
      export_schema_version: 1,
      id: "novel-1",
      title: "测试小说",
      bible_draft: {
        id: "bible-1",
      },
      summaries: {
        chapters: [
          {
            chapter_id: "chapter-1",
            chapter_index: 1,
            summary: "主角离开灯塔港。",
          },
        ],
        volumes: [
          {
            volume_index: 1,
            summary: "第一卷讲述主角启程。",
          },
        ],
        novel: {
          id: "novel-summary-1",
          summary: "全书围绕旧航线展开。",
        },
      },
      memory_chunks: [
        {
          id: "memory-1",
          chapter_id: "chapter-1",
          chapter_index: 1,
          chapter_title: "第一章 起点",
          text: "旧航线只在涨潮时出现。",
          importance: 1.2,
        },
      ],
    });
    expect(json.chapters.map((chapter: { chapter_index: number }) => chapter.chapter_index)).toEqual([1, 2]);
    expect(json.story_state.characters[0].current_location).toBe("灯塔港");
    expect(JSON.stringify(json)).not.toContain("embedding");

    const disposition = response.headers.get("Content-Disposition") ?? "";
    expect(disposition).toContain(".json");
  });

  it("returns complete zip export with correct content type and PK signature", async () => {
    const response = await GET(new Request("http://localhost/api/novels/novel-1/export?format=zip"), {
      params: Promise.resolve({ id: "novel-1" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/zip");
    const buf = new Uint8Array(await response.arrayBuffer());
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
    const text = new TextDecoder().decode(buf);
    expect(text).toContain("project.json");
    expect(text).toContain("chapters/0001-第一章_起点.md");
    expect(text).not.toContain("should-not-export");

    const disposition = response.headers.get("Content-Disposition") ?? "";
    expect(disposition).toContain(".zip");
  });

  it("returns 422 when moderation blocks content", async () => {
    mockModerationAllowed = false;
    const response = await GET(new Request("http://localhost/api/novels/novel-1/export?format=markdown"), {
      params: Promise.resolve({ id: "novel-1" }),
    });
    expect(response.status).toBe(422);
    expect(exportEventCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "err", error_code: "MODERATION_BLOCKED" }),
    }));
  });

  it("shows placeholder for empty chapter content", async () => {
    mockNovel = makeNovel({
      chapters: [
        { chapter_index: 1, title: "空章节", content: "", status: "draft" },
      ],
    });
    const response = await GET(new Request("http://localhost/api/novels/novel-1/export?format=markdown"), {
      params: Promise.resolve({ id: "novel-1" }),
    });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("*(本章暂无内容)*");
  });
});
