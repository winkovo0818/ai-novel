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
  return { content, tokenIn: 100, tokenOut: 200, costCny: 0.003, tookMs: 10, model: "mock-model" };
}

/** Build a fake planner response covering the given chapter indices. */
function chaptersJson(indices: number[]): string {
  return JSON.stringify({
    chapters: indices.map((i) => ({
      index: i,
      title: `章节${i}的看点标题`,
      summary: `第 ${i} 章梗概：覆盖本章核心冲突、推进方向与悬念落点，长度足以通过 schema 校验。`,
    })),
  });
}

const seedInput = { novelId: "novel-1", bible, profile };

describe("planOutline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fills the outline up to targetChapters when the seed is shorter", async () => {
    chatCompletionWithRetry.mockResolvedValue(mockResult(chaptersJson([9, 10, 11, 12])));
    const { planOutline } = await import("./planOutline");

    const result = await planOutline({ ...seedInput, targetChapters: 12 });

    expect(result.addedChapters).toBe(4);
    expect(result.bible.outline.volume_1.chapters).toHaveLength(12);
    expect(result.bible.outline.volume_1.chapters.map((c) => c.index)).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 1),
    );
    expect(result.cost.cny).toBeGreaterThan(0);
    expect(result.model).toBe("mock-model");
    expect(chatCompletionWithRetry).toHaveBeenCalledTimes(1);
  });

  it("is a no-op (no LLM call) when the outline already covers the target", async () => {
    const { planOutline } = await import("./planOutline");

    const result = await planOutline({ ...seedInput, targetChapters: 8 });

    expect(result.addedChapters).toBe(0);
    expect(result.cost.cny).toBe(0);
    expect(result.model).toBe("none");
    expect(result.bible).toBe(bible);
    expect(chatCompletionWithRetry).not.toHaveBeenCalled();
  });

  it("throws when the model leaves a gap in the requested range", async () => {
    chatCompletionWithRetry.mockResolvedValue(mockResult(chaptersJson([9, 10, 11])));
    const { planOutline } = await import("./planOutline");

    await expect(planOutline({ ...seedInput, targetChapters: 12 })).rejects.toThrow(/index 12/);
  });

  it("throws when the model output is not parseable JSON", async () => {
    chatCompletionWithRetry.mockResolvedValue(mockResult("抱歉，这里是一段不是 JSON 的模型废话。"));
    const { planOutline } = await import("./planOutline");

    await expect(planOutline({ ...seedInput, targetChapters: 12 })).rejects.toThrow(/index 9/);
  });

  it("drops out-of-range and duplicate indices, keeping a clean continuous range", async () => {
    chatCompletionWithRetry.mockResolvedValue(mockResult(chaptersJson([9, 9, 10, 11, 12, 13])));
    const { planOutline } = await import("./planOutline");

    const result = await planOutline({ ...seedInput, targetChapters: 12 });

    expect(result.addedChapters).toBe(4);
    expect(result.bible.outline.volume_1.chapters).toHaveLength(12);
    expect(result.bible.outline.volume_1.chapters.some((c) => c.index === 13)).toBe(false);
  });
  it("keeps existing volume boundaries while extending the final volume", async () => {
    const { planOutline } = await import("./planOutline");
    const second = { name: "第二卷", theme: "追凶", chapter_count_estimate: 4, chapters: bible.outline.volume_1.chapters.slice(4) };
    const multi = { ...bible, outline: { volume_1: { ...bible.outline.volume_1, chapters: bible.outline.volume_1.chapters.slice(0, 4) }, volumes: [second] } };
    chatCompletionWithRetry.mockResolvedValue(mockResult(chaptersJson([9, 10])));
    const result = await planOutline({ ...seedInput, bible: multi, targetChapters: 10 });
    expect(result.bible.outline.volume_1.chapters.at(-1)?.index).toBe(4);
    expect(result.bible.outline.volumes?.[0].chapters.at(-1)?.index).toBe(10);
  });
  it("refuses an existing outline with gaps", async () => {
    const { planOutline } = await import("./planOutline");
    const broken = { ...bible, outline: { volume_1: { ...bible.outline.volume_1, chapters: bible.outline.volume_1.chapters.slice(1) } } };
    await expect(planOutline({ ...seedInput, bible: broken, targetChapters: 8 })).rejects.toThrow("gaps");
  });

});

describe("rolling and multi-volume planning", () => {
  beforeEach(() => vi.clearAllMocks());
  const expanded = (count: number) => ({ ...bible, outline: { volume_1: { ...bible.outline.volume_1,
    chapters: Array.from({ length: Math.min(count, 80) }, (_, i) => ({ ...bible.outline.volume_1.chapters[0], index: i + 1 })),
  }, volumes: Array.from({ length: Math.ceil(Math.max(0, count - 80) / 80) }, (_, v) => ({ name: `第${v + 2}卷`, theme: "继续推进", chapter_count_estimate: 80,
    chapters: Array.from({ length: Math.min(80, count - 80 - v * 80) }, (_, i) => ({ ...bible.outline.volume_1.chapters[0], index: 81 + v * 80 + i })) })) } });
  it("splits at chapter 80 without changing earlier outlines", async () => {
    const { planOutline } = await import("./planOutline"); const seed = expanded(78);
    chatCompletionWithRetry.mockResolvedValue(mockResult(chaptersJson(Array.from({ length: 10 }, (_, i) => i + 79))));
    const result = await planOutline({ ...seedInput, bible: seed, targetChapters: 88, continuous: true });
    expect(result.bible.outline.volume_1.chapters).toHaveLength(80);
    expect(result.bible.outline.volumes![0].chapters.map(c => c.index)).toEqual([81, 82, 83, 84, 85, 86, 87, 88]);
    expect(seed.outline.volume_1.chapters).toHaveLength(78); expect(BibleDraftSchema.safeParse(result.bible).success).toBe(true);
  });
  it("supports chapters past 1000 and more than 20 volumes", async () => {
    const { planOutline } = await import("./planOutline");
    chatCompletionWithRetry.mockResolvedValue(mockResult(chaptersJson([1681, 1682])));
    const result = await planOutline({ ...seedInput, bible: expanded(1680), targetChapters: 1682, continuous: true });
    expect(result.bible.outline.volumes).toHaveLength(21); expect(BibleDraftSchema.safeParse(result.bible).success).toBe(true);
  });
  it("refuses an oversized single model request", async () => {
    const { planOutline } = await import("./planOutline");
    await expect(planOutline({ ...seedInput, targetChapters: 40 })).rejects.toThrow("batch exceeds 20");
    expect(chatCompletionWithRetry).not.toHaveBeenCalled();
  });
  it("uses bounded recent history and actual plot state for continuous planning", async () => {
    const { planOutline } = await import("./planOutline");
    const long = expanded(80); long.story_state = { plot_threads: [{ id: "p", title: "悬而未决的父母旧案", status: "open" }] };
    long.outline.volume_1.chapters[0].title = "不应注入的首章旧标题";
    long.outline.volume_1.chapters[79].title = "应注入的最新标题";
    chatCompletionWithRetry.mockResolvedValue(mockResult(chaptersJson([81])));
    await planOutline({ ...seedInput, bible: long, targetChapters: 81, continuous: true, model: "chosen" });
    const opts = chatCompletionWithRetry.mock.calls[0][0]; const prompt = opts.messages.map((m: {content: string}) => m.content).join("\n");
    expect(opts.model).toBe("chosen"); expect(prompt).not.toContain("不应注入的首章旧标题");
    expect(prompt).toContain("应注入的最新标题"); expect(prompt).toContain("悬而未决的父母旧案"); expect(prompt).toContain("不是全书结局");
  });
});
