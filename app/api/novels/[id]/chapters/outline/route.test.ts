import { beforeEach, describe, expect, it, vi } from "vitest";

/* ---- mocks ---- */

const novelFindUnique = vi.fn();
const getRequiredUserId = vi.fn();
const isRateLimited = vi.fn();
const checkQuota = vi.fn();
const chatCompletionWithRetry = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: { novel: { findUnique: novelFindUnique } },
}));

vi.mock("@/lib/auth/session", () => ({ getRequiredUserId }));
vi.mock("@/lib/auth/rateLimit", () => ({ isRateLimited }));
vi.mock("@/lib/llm/usage", () => ({
  checkQuota,
  estimateLlmMessagesCostCny: () => 0.001,
  quotaExceededResponse: () =>
    Response.json({ ok: false, error: { code: "QUOTA_EXCEEDED", message: "Quota exceeded", retryable: false } }, { status: 429 }),
}));
vi.mock("@/lib/llm/client", () => ({ chatCompletionWithRetry }));

const bibleSafeParse = vi.fn();
const beatSheetSafeParse = vi.fn();

vi.mock("@/lib/validation/schemas", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/validation/schemas")>();
  return {
    ...actual,
    BibleDraftSchema: { safeParse: bibleSafeParse },
    BeatSheetResponseSchema: { safeParse: beatSheetSafeParse },
  };
});

function mockNovel() {
  novelFindUnique.mockResolvedValue({
    id: "novel-1",
    user_id: "user-1",
    bible: {
      content: {
        meta: { suggested_title: "逆魂纪", alternative_titles: [] },
        characters: [],
        world: { setting_summary: "九州碎裂", factions: [], rules: [], geography: [] },
        outline: {
          volume_1: {
            name: "柴门起",
            theme: "逆袭",
            chapter_count_estimate: 5,
            chapters: [
              { index: 1, title: "雨夜火房", summary: "主角受罚听见剑魂低语" },
              { index: 2, title: "黑牌入手", summary: "执事逼主角参加考核" },
            ],
          },
        },
      },
    },
    chapters: [],
    volume_summaries: [],
    novel_summary: null,
  });
}

function mockAuth() {
  getRequiredUserId.mockResolvedValue("user-1");
}

const validBody = { chapter_index: 2, chapter_title: "黑牌入手", chapter_goal: "主角决定参加考核" };

describe("POST /api/novels/[id]/chapters/outline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    mockNovel();
    isRateLimited.mockResolvedValue(false);
    checkQuota.mockResolvedValue({ allowed: true });
    bibleSafeParse.mockReturnValue({
      success: true,
      data: {
        meta: { suggested_title: "逆魂纪", alternative_titles: [] },
        characters: [],
        world: { setting_summary: "", factions: [], rules: [], geography: [] },
        outline: {
          volume_1: {
            name: "卷1",
            theme: "开局",
            chapter_count_estimate: 5,
            chapters: [
              { index: 1, title: "雨夜火房", summary: "主角受罚" },
              { index: 2, title: "黑牌入手", summary: "执事逼考" },
            ],
          },
        },
      },
    });
    beatSheetSafeParse.mockImplementation((data: unknown) => {
      const d = data as Record<string, unknown>;
      return { success: Array.isArray(d?.beats), data };
    });
  });

  it("returns 401 when unauthenticated", async () => {
    getRequiredUserId.mockRejectedValue(new Error("UNAUTHORIZED"));
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/novels/novel-1/chapters/outline", {
        method: "POST",
        body: JSON.stringify(validBody),
      }),
      { params: Promise.resolve({ id: "novel-1" }) } as never,
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/novels/novel-1/chapters/outline", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "novel-1" }) } as never,
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when novel not found", async () => {
    novelFindUnique.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/novels/novel-1/chapters/outline", {
        method: "POST",
        body: JSON.stringify(validBody),
      }),
      { params: Promise.resolve({ id: "novel-1" }) } as never,
    );
    expect(res.status).toBe(404);
  });

  it("returns 429 when rate limited", async () => {
    isRateLimited.mockResolvedValue(true);
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/novels/novel-1/chapters/outline", {
        method: "POST",
        body: JSON.stringify(validBody),
      }),
      { params: Promise.resolve({ id: "novel-1" }) } as never,
    );
    expect(res.status).toBe(429);
  });

  it("returns 429 when quota exceeded", async () => {
    checkQuota.mockResolvedValue({ allowed: false });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/novels/novel-1/chapters/outline", {
        method: "POST",
        body: JSON.stringify(validBody),
      }),
      { params: Promise.resolve({ id: "novel-1" }) } as never,
    );
    expect(res.status).toBe(429);
  });

  it("generates beat sheet on success", async () => {
    chatCompletionWithRetry.mockResolvedValue({
      content: JSON.stringify({
        beats: [
          { beat: 1, scene: "主角开始行动", purpose: "建立动机" },
          { beat: 2, scene: "遇到阻碍", purpose: "制造冲突" },
        ],
      }),
    });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/novels/novel-1/chapters/outline", {
        method: "POST",
        body: JSON.stringify(validBody),
      }),
      { params: Promise.resolve({ id: "novel-1" }) } as never,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.beats).toHaveLength(2);
  });

  it("handles LLM wrapped in code fence", async () => {
    chatCompletionWithRetry.mockResolvedValue({
      content: '```json\n{"beats":[{"beat":1,"scene":"开篇","purpose":"引入"}]}\n```',
    });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/novels/novel-1/chapters/outline", {
        method: "POST",
        body: JSON.stringify(validBody),
      }),
      { params: Promise.resolve({ id: "novel-1" }) } as never,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.beats).toHaveLength(1);
  });

  it("returns 500 when LLM returns invalid beat sheet", async () => {
    chatCompletionWithRetry.mockResolvedValue({ content: '{"unrelated": true}' });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/novels/novel-1/chapters/outline", {
        method: "POST",
        body: JSON.stringify(validBody),
      }),
      { params: Promise.resolve({ id: "novel-1" }) } as never,
    );
    expect(res.status).toBe(500);
  });
});
