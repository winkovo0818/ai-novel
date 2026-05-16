import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const bibleUpdate = vi.fn();
const getRequiredUserId = vi.fn();
const moderateContent = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    novel: { findUnique },
    bibleDraft: { update: bibleUpdate },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getRequiredUserId,
}));

vi.mock("@/lib/moderation/moderate", () => ({
  moderateContent,
  stringifyForModeration: (value: unknown) =>
    typeof value === "string" ? value : JSON.stringify(value),
}));

function makeChapter(i: number) {
  return { index: i, title: `第${i}章`, summary: `章节摘要${i}`.repeat(5) };
}

const validBible = {
  meta: { suggested_title: "逆魂纪", alternative_titles: ["逆魂", "魂纪", "纪逆"] },
  characters: [
    { role: "protagonist", name: "主角", age: 20, appearance: "英俊潇洒", personality: "勇敢正直", catchphrase: "冲啊", abilities: ["剑术"], goals: "复仇", motivation: "正义", secrets: ["秘密1"], relations: [] },
    { role: "mentor", name: "导师", age: 60, appearance: "白发苍苍", personality: "睿智沉稳", catchphrase: "智慧之言", abilities: ["法术"], goals: "传承", motivation: "守护", secrets: ["秘密2"], relations: [] },
    { role: "antagonist", name: "反派", age: 35, appearance: "阴冷诡异", personality: "狡猾多端", catchphrase: "哈哈哈", abilities: ["阴谋"], goals: "统治", motivation: "野心", secrets: ["秘密3"], relations: [] },
  ],
  world: { setting_summary: "这是一个充满魔法和剑术的奇幻世界".repeat(3), factions: [{ name: "正义盟", alignment: "正义", role: "守护世界" }, { name: "黑暗会", alignment: "邪恶", role: "破坏秩序" }], rules: ["魔法需要消耗精神力", "强者不能随意屠杀弱者"], geography: ["龙脊山脉", "无尽之海"] },
  outline: { volume_1: { name: "第一卷", theme: "启程", chapter_count_estimate: 10, chapters: Array.from({ length: 8 }, (_, i) => makeChapter(i + 1)) } },
  first_chapter_beats: [
    { beat: 1, scene: "主角村庄被毁", purpose: "引入主角和动机" },
    { beat: 2, scene: "主角觉醒力量", purpose: "展示世界观" },
    { beat: 3, scene: "导师出现", purpose: "引入关键角色" },
    { beat: 4, scene: "踏上旅程", purpose: "开启主线" },
    { beat: 5, scene: "首次战斗", purpose: "展示能力体系" },
    { beat: 6, scene: "获得伙伴", purpose: "丰富角色关系" },
  ],
};

describe("PATCH /api/novels/[id]/bible", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRequiredUserId.mockResolvedValue("user-1");
    moderateContent.mockResolvedValue({ allowed: true });
  });

  it("updates Bible content for the novel owner", async () => {
    const { PATCH } = await import("./route");
    const updatedBible = {
      ...validBible,
      characters: validBible.characters.map((c, i) => (i === 0 ? { ...c, name: "新主角名" } : c)),
    };

    findUnique.mockResolvedValue({
      id: "novel-1",
      user_id: "user-1",
      bible: { id: "bible-1", content: validBible },
    });
    bibleUpdate.mockResolvedValue({ id: "bible-1", novel_id: "novel-1", content: updatedBible });

    const response = await PATCH(
      new Request("http://localhost/api/novels/novel-1/bible", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: updatedBible }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) }
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(bibleUpdate).toHaveBeenCalledWith({
      where: { novel_id: "novel-1" },
      data: { content: updatedBible },
    });
  });

  it("returns 404 when novel or bible not found", async () => {
    const { PATCH } = await import("./route");
    findUnique.mockResolvedValue({ id: "novel-1", user_id: "user-1", bible: null });

    const response = await PATCH(
      new Request("http://localhost/api/novels/novel-1/bible", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: validBible }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) }
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("NOVEL_NOT_FOUND");
  });

  it("returns 401 when not authenticated", async () => {
    const { PATCH } = await import("./route");
    findUnique.mockResolvedValue({
      id: "novel-1",
      user_id: "user-1",
      bible: { id: "bible-1", content: validBible },
    });
    getRequiredUserId.mockRejectedValue(new Error("UNAUTHORIZED"));

    const response = await PATCH(
      new Request("http://localhost/api/novels/novel-1/bible", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: validBible }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) }
    );
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("hides Bible from non-owner user", async () => {
    const { PATCH } = await import("./route");
    findUnique.mockResolvedValue({
      id: "novel-1",
      user_id: "owner-1",
      bible: { id: "bible-1", content: validBible },
    });
    getRequiredUserId.mockResolvedValue("user-2");

    const response = await PATCH(
      new Request("http://localhost/api/novels/novel-1/bible", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: validBible }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) }
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("NOVEL_NOT_FOUND");
    expect(bibleUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid Bible content", async () => {
    const { PATCH } = await import("./route");
    findUnique.mockResolvedValue({
      id: "novel-1",
      user_id: "user-1",
      bible: { id: "bible-1", content: validBible },
    });

    const response = await PATCH(
      new Request("http://localhost/api/novels/novel-1/bible", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: { meta: "invalid" } }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) }
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("INVALID_INPUT");
    expect(bibleUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 MODERATION_BLOCKED and skips DB write when moderation rejects (P0-4)", async () => {
    const { PATCH } = await import("./route");
    findUnique.mockResolvedValue({
      id: "novel-1",
      user_id: "user-1",
      bible: { id: "bible-1", content: validBible },
    });
    moderateContent.mockResolvedValue({
      allowed: false,
      code: "MODERATION_BLOCKED",
      reason: "包含敏感词",
    });

    const response = await PATCH(
      new Request("http://localhost/api/novels/novel-1/bible", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: validBible }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) }
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("MODERATION_BLOCKED");
    expect(json.error.message).toBe("包含敏感词");
    expect(bibleUpdate).not.toHaveBeenCalled();
    // Confirm the moderation call saw the whole flattened Bible — not just
    // one field — so a banned phrase planted in any sub-object still
    // gets caught.
    expect(moderateContent).toHaveBeenCalledWith({
      route: "/api/novels/:id/bible",
      text: JSON.stringify(validBible),
      userId: "user-1",
      novelId: "novel-1",
    });
  });
});
