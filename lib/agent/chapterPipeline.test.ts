import { beforeEach, describe, expect, it, vi } from "vitest";

import { BibleDraftSchema, NovelProfileSchema } from "@/lib/validation/schemas";

const chatCompletionWithRetry = vi.fn();

vi.mock("@/lib/llm/client", () => ({
  chatCompletionWithRetry,
}));

const bible = BibleDraftSchema.parse({
  meta: { suggested_title: "逆魂纪", alternative_titles: ["逆魂", "魂纪", "纪逆"] },
  characters: [
    { role: "protagonist", name: "沈言", age: 18, appearance: "清瘦", personality: "隐忍机敏", catchphrase: "活下去", abilities: ["剑魂共振"], goals: "查明父母旧案", motivation: "复仇与求真", secrets: ["体内有剑鞘"], relations: [] },
    { role: "mentor", name: "剑魂", age: 999, appearance: "无形之声", personality: "苍老讥诮", catchphrase: "归鞘", abilities: ["剑魂共振"], goals: "重塑本体", motivation: "求存", secrets: ["认识沈恪"], relations: [] },
    { role: "antagonist", name: "蒋阶", age: 40, appearance: "阴冷", personality: "狡诈", catchphrase: "棋子而已", abilities: ["祭剑术"], goals: "夺取剑魂", motivation: "野心", secrets: ["祭剑阵主谋"], relations: [] },
  ],
  world: { setting_summary: "九州仙门衰微，剑魂认主不可逆的修真世界".repeat(4), factions: [{ name: "柴饦峰", alignment: "中立", role: "杂役所在" }, { name: "黑铁会", alignment: "邪恶", role: "祭剑阵主谋" }], rules: ["剑魂认主不可逆", "祭剑需以血引魂"], geography: ["柴饦峰", "后山裂井"] },
  outline: { volume_1: { name: "第一卷", theme: "觉醒", chapter_count_estimate: 10, chapters: Array.from({ length: 8 }, (_, i) => ({ index: i + 1, title: `第${i + 1}章`, summary: `第${i + 1}章梗概：覆盖本章冲突、推进方向与悬念落点，长度足以通过校验。` })) } },
  first_chapter_beats: Array.from({ length: 5 }, (_, i) => ({ beat: i + 1, scene: `场景${i + 1}`, purpose: `目的${i + 1}` })),
});

const profile = NovelProfileSchema.parse({
  genre_main: "web",
  genre_sub: "玄幻",
  description: "",
  audience: "general",
  length: "long",
  tone: "cool",
  pace: "fast",
  pov: "third_limited",
  chapter_word_count: 3000,
  ai_freedom: "mid",
});

function mockResult(content: string) {
  return { content, tokenIn: 100, tokenOut: 200, costCny: 0.002, tookMs: 10, model: "mock-model" };
}

const baseInput = { novelId: "novel-1", bible, profile, chapters: [], chapterIndex: 1, skipRetrieval: true };

describe("runChapterPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the cleaned draft without revising when the first critic passes", async () => {
    const { runChapterPipeline } = await import("./chapterPipeline");
    chatCompletionWithRetry.mockImplementation(async (opts: { agent?: string; route: string }) => {
      if (opts.agent === "critic") return mockResult(JSON.stringify({ consistent: true }));
      return mockResult("沈言蹲在灶前，火光在他脸上跳动，这是一段足够长的初稿正文，用来验证流水线产出。");
    });

    const result = await runChapterPipeline({ ...baseInput });

    expect(result.revisedRounds).toBe(0);
    expect(result.criticIssues).toEqual([]);
    expect(result.title).toBe("第1章");
    expect(result.content).toContain("初稿正文");
    expect(result.cost.cny).toBeGreaterThan(0);
    expect(result.model).toBe("mock-model");
    expect(chatCompletionWithRetry).toHaveBeenCalledTimes(2); // writer + 1 critic
  });

  it("revises once when the critic flags a major issue, then stops once clean", async () => {
    const { runChapterPipeline } = await import("./chapterPipeline");
    const criticQueue = [
      JSON.stringify({ consistent: false, issues: [{ type: "logic_chain", severity: "major", description: "事件堆叠无因果" }] }),
      JSON.stringify({ consistent: true }),
    ];
    chatCompletionWithRetry.mockImplementation(async (opts: { agent?: string; route: string }) => {
      if (opts.agent === "critic") return mockResult(criticQueue.shift() ?? JSON.stringify({ consistent: true }));
      if (opts.route.endsWith("/revise")) return mockResult("修订后的正文，补上了因为/所以的因果链。");
      return mockResult("初稿正文，事件平铺直叙。");
    });

    const result = await runChapterPipeline({ ...baseInput, revisionRounds: 2 });

    expect(result.revisedRounds).toBe(1);
    expect(result.content).toContain("修订后的正文");
    expect(chatCompletionWithRetry).toHaveBeenCalledTimes(4); // writer + critic1 + revise1 + critic2
  });

  it("caps revise passes at revisionRounds when the critic never clears", async () => {
    const { runChapterPipeline } = await import("./chapterPipeline");
    chatCompletionWithRetry.mockImplementation(async (opts: { agent?: string; route: string }) => {
      if (opts.agent === "critic") {
        return mockResult(JSON.stringify({ consistent: false, issues: [{ type: "world_rule", severity: "critical", description: "违背剑魂认主不可逆" }] }));
      }
      return mockResult("正文片段。");
    });

    const result = await runChapterPipeline({ ...baseInput, revisionRounds: 2 });

    expect(result.revisedRounds).toBe(2);
    expect(result.criticIssues).toHaveLength(1);
    expect(result.criticIssues[0].severity).toBe("critical");
    expect(chatCompletionWithRetry).toHaveBeenCalledTimes(5); // writer + 2×(critic+revise)
  });

  it("retries once on unparseable critic JSON and proceeds when the retry parses", async () => {
    const { runChapterPipeline } = await import("./chapterPipeline");
    const criticQueue = [
      "抱歉，这里是一段不是 JSON 的模型废话。",
      JSON.stringify({ consistent: true }),
    ];
    chatCompletionWithRetry.mockImplementation(async (opts: { agent?: string; route: string }) => {
      if (opts.agent === "critic") return mockResult(criticQueue.shift() ?? JSON.stringify({ consistent: true }));
      return mockResult("正文内容。");
    });

    const result = await runChapterPipeline({ ...baseInput });

    expect(result.revisedRounds).toBe(0);
    expect(result.criticIssues).toEqual([]);
    expect(chatCompletionWithRetry).toHaveBeenCalledTimes(3); // writer + critic(bad) + critic(retry ok)
  });

  it("fails closed with a synthetic major issue when critic JSON is unparseable twice", async () => {
    const { runChapterPipeline } = await import("./chapterPipeline");
    chatCompletionWithRetry.mockImplementation(async (opts: { agent?: string; route: string }) => {
      if (opts.agent === "critic") return mockResult("抱歉，这里是一段不是 JSON 的模型废话。");
      return mockResult("正文内容。");
    });

    const result = await runChapterPipeline({ ...baseInput });

    // No revise (nothing concrete to fix), but the chapter must NOT pass as reviewed-clean:
    // the synthetic major issue flows into criticIssues → quality gate / needs_review.
    expect(result.revisedRounds).toBe(0);
    expect(result.criticIssues).toHaveLength(1);
    expect(result.criticIssues[0].severity).toBe("major");
    expect(result.criticIssues[0].description).toContain("未经一致性审校");
    expect(chatCompletionWithRetry).toHaveBeenCalledTimes(3); // writer + critic + critic retry, no revise
  });
});
