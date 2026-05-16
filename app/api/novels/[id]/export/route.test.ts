import { describe, it, expect, vi, beforeEach } from "vitest";

let mockNovel: unknown;
let mockUserId: string | null;
let mockModerationAllowed: boolean;
const moderateContentMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    novel: {
      findUnique: () => Promise.resolve(mockNovel),
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
  };
}

function makeNovel(overrides?: Record<string, unknown>) {
  return {
    id: "novel-1",
    title: "测试小说",
    user_id: "user-1",
    chapters: [
      { chapter_index: 1, title: "第一章 起点", content: "这是第一章的内容。", status: "done" },
      { chapter_index: 2, title: "第二章 远方", content: "这是第二章的内容。", status: "draft" },
    ],
    bible: { id: "bible-1", content: makeBible() },
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

  it("returns 422 when moderation blocks content", async () => {
    mockModerationAllowed = false;
    const response = await GET(new Request("http://localhost/api/novels/novel-1/export?format=markdown"), {
      params: Promise.resolve({ id: "novel-1" }),
    });
    expect(response.status).toBe(422);
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
