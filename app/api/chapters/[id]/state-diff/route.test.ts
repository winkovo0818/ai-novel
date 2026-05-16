import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const chatCompletionWithRetry = vi.fn();
const getRequiredUserId = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    chapterDraft: { findUnique },
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
  outline: { volume_1: { name: "第一卷", theme: "启程", chapter_count_estimate: 10, chapters: Array.from({ length: 8 }, (_, i) => ({ index: i + 1, title: `第${i + 1}章`, summary: `章节摘要${i + 1}`.repeat(5) })) } },
  first_chapter_beats: [
    { beat: 1, scene: "主角村庄被毁", purpose: "引入主角和动机" },
    { beat: 2, scene: "主角觉醒力量", purpose: "展示世界观" },
    { beat: 3, scene: "导师出现", purpose: "引入关键角色" },
    { beat: 4, scene: "踏上旅程", purpose: "开启主线" },
    { beat: 5, scene: "首次战斗", purpose: "展示能力体系" },
    { beat: 6, scene: "获得伙伴", purpose: "丰富角色关系" },
  ],
};

describe("POST /api/chapters/[id]/state-diff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRequiredUserId.mockResolvedValue("user-1");
  });

  it("returns structured state diff for chapter owner", async () => {
    const { POST } = await import("./route");
    findUnique.mockResolvedValue({
      id: "chapter-1",
      chapter_index: 1,
      title: "第一章",
      content: "主角离开村庄，遇到了导师。",
      novel: {
        user_id: "user-1",
        bible: { id: "bible-1", content: validBible },
      },
    });
    chatCompletionWithRetry.mockResolvedValue({
      content: JSON.stringify({
        character_updates: [
          { name: "主角", changes: { current_location: "村庄外" }, confidence: "high" },
        ],
        timeline_events: [{ event: "主角离开村庄", impact: "开启主线旅程" }],
        plot_thread_updates: [],
        new_entities: [],
      }),
      tokenIn: 100,
      tokenOut: 50,
      costCny: 0.001,
      tookMs: 1000,
      model: "deepseek-chat",
    });

    const response = await POST(
      new Request("http://localhost/api/chapters/chapter-1/state-diff", { method: "POST" }),
      { params: Promise.resolve({ id: "chapter-1" }) }
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.character_updates).toHaveLength(1);
    expect(json.data.character_updates[0].name).toBe("主角");
  });

  it("returns 404 when chapter not found", async () => {
    const { POST } = await import("./route");
    findUnique.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/chapters/missing/state-diff", { method: "POST" }),
      { params: Promise.resolve({ id: "missing" }) }
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("CHAPTER_NOT_FOUND");
  });

  it("returns 401 when not authenticated", async () => {
    const { POST } = await import("./route");
    findUnique.mockResolvedValue({
      id: "chapter-1",
      chapter_index: 1,
      title: "第一章",
      content: "正文",
      novel: {
        user_id: "user-1",
        bible: { id: "bible-1", content: validBible },
      },
    });
    getRequiredUserId.mockRejectedValue(new Error("UNAUTHORIZED"));

    const response = await POST(
      new Request("http://localhost/api/chapters/chapter-1/state-diff", { method: "POST" }),
      { params: Promise.resolve({ id: "chapter-1" }) }
    );
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("hides chapter from non-owner", async () => {
    const { POST } = await import("./route");
    findUnique.mockResolvedValue({
      id: "chapter-1",
      chapter_index: 1,
      title: "第一章",
      content: "正文",
      novel: {
        user_id: "owner-1",
        bible: { id: "bible-1", content: validBible },
      },
    });
    getRequiredUserId.mockResolvedValue("user-2");

    const response = await POST(
      new Request("http://localhost/api/chapters/chapter-1/state-diff", { method: "POST" }),
      { params: Promise.resolve({ id: "chapter-1" }) }
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("CHAPTER_NOT_FOUND");
    expect(chatCompletionWithRetry).not.toHaveBeenCalled();
  });

  it("returns 400 for empty chapter content", async () => {
    const { POST } = await import("./route");
    findUnique.mockResolvedValue({
      id: "chapter-1",
      chapter_index: 1,
      title: "第一章",
      content: "   ",
      novel: {
        user_id: "user-1",
        bible: { id: "bible-1", content: validBible },
      },
    });

    const response = await POST(
      new Request("http://localhost/api/chapters/chapter-1/state-diff", { method: "POST" }),
      { params: Promise.resolve({ id: "chapter-1" }) }
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("EMPTY_CONTENT");
  });
});
