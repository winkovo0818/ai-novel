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
  meta: { suggested_title: "重燃之路", alternative_titles: ["重燃", "回场", "再战"] },
  characters: [
    { role: "protagonist", name: "林燃", age: 18, appearance: "清瘦", personality: "冷静", catchphrase: "再来", abilities: ["分析"], goals: "征服球场", motivation: "证明自己", secrets: ["前世死于车祸"], relations: [] },
    { role: "mentor", name: "老王", age: 45, appearance: "严厉", personality: "务实", catchphrase: "跑起来", abilities: ["训练"], goals: "赢球", motivation: "带队", secrets: ["膝盖旧伤"], relations: [] },
    { role: "antagonist", name: "赵锐", age: 18, appearance: "高大", personality: "自信", catchphrase: "随便", abilities: ["突破"], goals: "保持王牌地位", motivation: "胜利", secrets: ["家中变故"], relations: [] },
  ],
  world: { setting_summary: "校园篮球重生故事，主角林燃带着前世记忆回到高三球场，从旁观赵锐打球到主动接近校队训练。", factions: [{ name: "校队", alignment: "中立", role: "竞技舞台" }, { name: "对手校", alignment: "对立", role: "外部压力" }], rules: ["冲突必须可追溯", "系统任务触发需要铺垫"], geography: ["球场", "训练室"] },
  outline: { volume_1: { name: "重燃", theme: "回到球场", chapter_count_estimate: 8, chapters: Array.from({ length: 8 }, (_, i) => ({ index: i + 1, title: `第${i + 1}章`, summary: "章节摘要足够长，用于测试修订 prompt 的输入校验。" })) } },
  first_chapter_beats: Array.from({ length: 5 }, (_, i) => ({ beat: i + 1, scene: `场景${i + 1}`, purpose: `目的${i + 1}` })),
};

const profile = {
  genre_main: "web",
  genre_sub: "校园竞技",
  description: "",
  audience: "general",
  length: "long",
  tone: "cool",
  pace: "fast",
  pov: "third_limited",
  chapter_word_count: 3000,
  ai_freedom: "mid",
};

describe("POST /api/novels/[id]/chapters/draft/revise", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRequiredUserId.mockResolvedValue("user-1");
    findUnique.mockResolvedValue({
      id: "novel-1",
      user_id: "user-1",
      profile,
      bible: { id: "bible-1", content: validBible },
      chapters: [],
    });
  });

  it("returns revised candidate content for the owner", async () => {
    chatCompletionWithRetry.mockResolvedValue({
      content: "林燃并非偶然路过训练室。他特意放慢脚步，想观察校队训练节奏。",
      tokenIn: 100,
      tokenOut: 50,
      costCny: 0.001,
      tookMs: 1000,
      model: "deepseek-chat",
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/novels/novel-1/chapters/draft/revise", {
        method: "POST",
        body: JSON.stringify({
          chapter_index: 2,
          content: "林燃路过训练室，被叫进去陪练。",
          issues: [{ type: "timeline", severity: "major", description: "缺少过渡", suggestion: "增加主动观察动机" }],
        }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.content).toContain("特意放慢脚步");
    const call = chatCompletionWithRetry.mock.calls[0][0];
    expect(call.route).toBe("/api/novels/:id/chapters/draft/revise");
    expect(call.messages[1].content).toContain("缺少过渡");
  });

  it("rejects missing critic issues", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/novels/novel-1/chapters/draft/revise", {
        method: "POST",
        body: JSON.stringify({ chapter_index: 2, content: "正文", issues: [] }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) },
    );

    expect(response.status).toBe(400);
    expect(chatCompletionWithRetry).not.toHaveBeenCalled();
  });

  it("revises a local selection using the operation prompt", async () => {
    chatCompletionWithRetry.mockResolvedValue({
      content: "林燃放慢脚步，借着门缝看清校队的攻防节奏。",
      tokenIn: 80,
      tokenOut: 30,
      costCny: 0.0005,
      tookMs: 800,
      model: "deepseek-chat",
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/novels/novel-1/chapters/draft/revise", {
        method: "POST",
        body: JSON.stringify({
          operation: "polish",
          chapter_index: 2,
          title: "训练室",
          selected_text: "林燃路过训练室。",
          before_context: "上文说他看见赵锐训练。",
          after_context: "下文他决定加入陪练。",
        }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.content).toContain("放慢脚步");
    const call = chatCompletionWithRetry.mock.calls[0][0];
    expect(call.messages[0].content).toContain("只返回改写后的局部正文");
    expect(call.messages[0].content).toContain("润色选中段落");
    expect(call.messages[1].content).toContain("待改写选区");
    expect(call.messages[1].content).toContain("林燃路过训练室");
  });

  it("revises a local selection with the humanize prompt", async () => {
    chatCompletionWithRetry.mockResolvedValue({
      content: "林燃把球拍回地面。\n\n响声不大，赵锐却停了半拍。",
      tokenIn: 90,
      tokenOut: 35,
      costCny: 0.0006,
      tookMs: 900,
      model: "deepseek-chat",
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/novels/novel-1/chapters/draft/revise", {
        method: "POST",
        body: JSON.stringify({
          operation: "humanize",
          chapter_index: 2,
          title: "训练室",
          selected_text: "这一刻，林燃知道真正的考验才刚刚开始。",
          before_context: "赵锐把球扔过来。",
          after_context: "老王没有吹哨。",
        }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.content).toContain("赵锐却停了半拍");
    const call = chatCompletionWithRetry.mock.calls[0][0];
    expect(call.messages[0].content).toContain("去 AI 味");
    expect(call.messages[1].content).toContain("操作：humanize");
    expect(call.messages[1].content).toContain("命运的齿轮");
    expect(call.messages[1].content).toContain("三连排比");
  });

  it("rejects an invalid local revision operation", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/novels/novel-1/chapters/draft/revise", {
        method: "POST",
        body: JSON.stringify({
          operation: "rewrite_everything",
          chapter_index: 2,
          title: "训练室",
          selected_text: "林燃路过训练室。",
          before_context: "",
          after_context: "",
        }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) },
    );

    expect(response.status).toBe(400);
    expect(chatCompletionWithRetry).not.toHaveBeenCalled();
  });

  it("rejects empty selected text for local revision", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/novels/novel-1/chapters/draft/revise", {
        method: "POST",
        body: JSON.stringify({
          operation: "expand",
          chapter_index: 2,
          title: "训练室",
          selected_text: "   ",
          before_context: "",
          after_context: "",
        }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) },
    );

    expect(response.status).toBe(400);
    expect(chatCompletionWithRetry).not.toHaveBeenCalled();
  });

  it("rejects overlong local revision context", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/novels/novel-1/chapters/draft/revise", {
        method: "POST",
        body: JSON.stringify({
          operation: "dialogue",
          chapter_index: 2,
          title: "训练室",
          selected_text: "林燃路过训练室。",
          before_context: "上".repeat(4001),
          after_context: "",
        }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) },
    );

    expect(response.status).toBe(400);
    expect(chatCompletionWithRetry).not.toHaveBeenCalled();
  });

  it("hides novels from non-owners", async () => {
    findUnique.mockResolvedValue({
      id: "novel-1",
      user_id: "owner-1",
      profile,
      bible: { id: "bible-1", content: validBible },
      chapters: [],
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/novels/novel-1/chapters/draft/revise", {
        method: "POST",
        body: JSON.stringify({
          chapter_index: 2,
          content: "正文",
          issues: [{ type: "timeline", severity: "major", description: "问题" }],
        }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("NOVEL_NOT_FOUND");
  });
});
