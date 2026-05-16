import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const chatCompletionWithRetry = vi.fn();
const getRequiredUserId = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    novel: { findUnique },
  },
}));

vi.mock("@/lib/llm/client", () => ({
  chatCompletionWithRetry,
}));

vi.mock("@/lib/auth/session", () => ({
  getRequiredUserId,
}));

const validBible = {
  meta: { suggested_title: "逆魂纪", alternative_titles: ["逆魂", "魂纪", "纪逆"] },
  characters: [
    { role: "protagonist", name: "主角", age: 20, appearance: "英俊潇洒", personality: "勇敢正直", catchphrase: "冲啊", abilities: ["剑术"], goals: "复仇", motivation: "正义", secrets: ["秘密1"], relations: [] },
    { role: "mentor", name: "导师", age: 60, appearance: "白发苍苍", personality: "睿智沉稳", catchphrase: "智慧之言", abilities: ["法术"], goals: "传承", motivation: "守护", secrets: ["秘密2"], relations: [] },
    { role: "antagonist", name: "反派", age: 35, appearance: "阴冷诡异", personality: "狡猾多端", catchphrase: "哈哈哈", abilities: ["阴谋"], goals: "统治", motivation: "野心", secrets: ["秘密3"], relations: [] },
  ],
  world: { setting_summary: "这是一个充满魔法和剑术的奇幻世界".repeat(3), factions: [{ name: "正义盟", alignment: "正义", role: "守护世界" }, { name: "黑暗会", alignment: "邪恶", role: "破坏秩序" }], rules: ["魔法需要消耗精神力", "强者不能随意屠杀弱者"], geography: ["龙脊山脉", "无尽之海"] },
  outline: { volume_1: { name: "第一卷", theme: "启程", chapter_count_estimate: 10, chapters: Array.from({ length: 8 }, (_, i) => ({ index: i + 1, title: `第${i + 1}章`, summary: `这是一段长度足够通过校验的章节梗概${i + 1}，覆盖本章冲突与推进方向。` })) } },
  first_chapter_beats: Array.from({ length: 5 }, (_, i) => ({ beat: i + 1, scene: `场景${i + 1}`, purpose: `目的${i + 1}` })),
};

const profile = {
  genre_main: "web",
  genre_sub: "玄幻",
  audience: "general",
  length: "long",
  tone: "cool",
  pace: "fast",
  pov: "third_limited",
  chapter_word_count: 3000,
  ai_freedom: "mid",
};

describe("POST /api/novels/[id]/chapters/critic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRequiredUserId.mockResolvedValue("user-1");
  });

  it("returns critic result for owner with issues", async () => {
    const { POST } = await import("./route");
    findUnique.mockResolvedValue({
      id: "novel-1",
      user_id: "user-1",
      profile,
      bible: { id: "bible-1", content: validBible },
      chapters: [],
    });
    chatCompletionWithRetry.mockResolvedValue({
      content: JSON.stringify({
        consistent: false,
        issues: [
          { type: "character", severity: "major", description: "主角行为与性格矛盾", suggestion: "修改动机" },
        ],
      }),
      tokenIn: 100,
      tokenOut: 50,
      costCny: 0.001,
      tookMs: 1000,
      model: "deepseek-chat",
    });

    const response = await POST(
      new Request("http://localhost/api/novels/novel-1/chapters/critic", {
        method: "POST",
        body: JSON.stringify({ chapter_index: 1, content: "主角突然变得很懦弱。" }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) }
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.consistent).toBe(false);
    expect(json.data.issues).toHaveLength(1);
    expect(json.data.issues[0].severity).toBe("major");
  });

  it("returns consistent when no issues", async () => {
    const { POST } = await import("./route");
    findUnique.mockResolvedValue({
      id: "novel-1",
      user_id: "user-1",
      profile,
      bible: { id: "bible-1", content: validBible },
      chapters: [],
    });
    chatCompletionWithRetry.mockResolvedValue({
      content: JSON.stringify({ consistent: true, issues: [] }),
      tokenIn: 100,
      tokenOut: 50,
      costCny: 0.001,
      tookMs: 1000,
      model: "deepseek-chat",
    });

    const response = await POST(
      new Request("http://localhost/api/novels/novel-1/chapters/critic", {
        method: "POST",
        body: JSON.stringify({ chapter_index: 1, content: "主角勇敢地面对敌人。" }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) }
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.consistent).toBe(true);
  });

  it("returns 404 when novel not found", async () => {
    const { POST } = await import("./route");
    findUnique.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/novels/missing/chapters/critic", {
        method: "POST",
        body: JSON.stringify({ chapter_index: 1, content: "正文" }),
      }),
      { params: Promise.resolve({ id: "missing" }) }
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("NOVEL_NOT_FOUND");
  });

  it("returns 401 when not authenticated", async () => {
    const { POST } = await import("./route");
    findUnique.mockResolvedValue({
      id: "novel-1",
      user_id: "user-1",
      profile,
      bible: { id: "bible-1", content: validBible },
      chapters: [],
    });
    getRequiredUserId.mockRejectedValue(new Error("UNAUTHORIZED"));

    const response = await POST(
      new Request("http://localhost/api/novels/novel-1/chapters/critic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapter_index: 1, content: "正文" }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) }
    );
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("hides novel from non-owner", async () => {
    const { POST } = await import("./route");
    findUnique.mockResolvedValue({
      id: "novel-1",
      user_id: "owner-1",
      profile,
      bible: { id: "bible-1", content: validBible },
      chapters: [],
    });
    getRequiredUserId.mockResolvedValue("user-2");

    const response = await POST(
      new Request("http://localhost/api/novels/novel-1/chapters/critic", {
        method: "POST",
        body: JSON.stringify({ chapter_index: 1, content: "正文" }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) }
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("NOVEL_NOT_FOUND");
    expect(chatCompletionWithRetry).not.toHaveBeenCalled();
  });

  it("returns 400 for empty content", async () => {
    const { POST } = await import("./route");
    findUnique.mockResolvedValue({
      id: "novel-1",
      user_id: "user-1",
      profile,
      bible: { id: "bible-1", content: validBible },
      chapters: [],
    });

    const response = await POST(
      new Request("http://localhost/api/novels/novel-1/chapters/critic", {
        method: "POST",
        body: JSON.stringify({ chapter_index: 1, content: "   " }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) }
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("EMPTY_CONTENT");
  });
});
