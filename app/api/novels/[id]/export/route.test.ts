import { describe, it, expect, vi, beforeEach } from "vitest";

let mockNovel: unknown;
let mockUserId: string | null;
let mockModerationAllowed: boolean;

vi.mock("@/lib/db", () => ({
  prisma: {
    novel: {
      findUnique: () => Promise.resolve(mockNovel),
    },
  },
}));

vi.mock("@/utils/supabase/auth", () => ({
  getRequiredUserId: () => {
    if (!mockUserId) throw new Error("Unauthorized");
    return Promise.resolve(mockUserId);
  },
}));

vi.mock("@/lib/moderation/moderate", () => ({
  moderateContent: () =>
    Promise.resolve({
      allowed: mockModerationAllowed,
      code: mockModerationAllowed ? undefined : "MODERATION_BLOCKED",
      reason: mockModerationAllowed ? undefined : "内容审核未通过",
    }),
  stringifyForModeration: (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v)),
}));

function makeNovel(overrides?: Record<string, unknown>) {
  return {
    id: "novel-1",
    title: "测试小说",
    user_id: "user-1",
    chapters: [
      { chapter_index: 1, title: "第一章 起点", content: "这是第一章的内容。", status: "done" },
      { chapter_index: 2, title: "第二章 远方", content: "这是第二章的内容。", status: "draft" },
    ],
    bible: { id: "bible-1", content: {} },
    ...overrides,
  };
}

import { GET } from "./route";

describe("GET /api/novels/[id]/export", () => {
  beforeEach(() => {
    mockNovel = makeNovel();
    mockUserId = "user-1";
    mockModerationAllowed = true;
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

  it("returns 400 for invalid format", async () => {
    const response = await GET(new Request("http://localhost/api/novels/novel-1/export?format=docx"), {
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