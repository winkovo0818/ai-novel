import { beforeEach, describe, expect, it, vi } from "vitest";

const findUniqueNovel = vi.fn();
const upsertChapter = vi.fn();
const updateBible = vi.fn();
const runChapterPipeline = vi.fn();
const chatCompletionWithRetry = vi.fn();
const enqueueJob = vi.fn();
const getRun = vi.fn();
const advanceProgress = vi.fn();
const addCost = vi.fn();
const markCompleted = vi.fn();
const markNeedsReview = vi.fn();
const pause = vi.fn();
const moderateContent = vi.fn();
const evaluateChapterGate = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    novel: { findUnique: findUniqueNovel },
    chapterDraft: { upsert: upsertChapter },
    bibleDraft: { update: updateBible },
  },
}));

vi.mock("@/lib/agent/chapterPipeline", () => ({ runChapterPipeline }));
vi.mock("@/lib/agent/generationRun", () => ({ getRun, advanceProgress, addCost, markCompleted, markNeedsReview, pause }));
vi.mock("@/lib/agent/qualityGate", () => ({ evaluateChapterGate }));
vi.mock("@/lib/moderation/moderate", () => ({ moderateContent }));
vi.mock("@/lib/llm/client", () => ({ chatCompletionWithRetry }));
vi.mock("./queue", () => ({ enqueueJob }));
vi.mock("@/lib/observability/logger", () => ({ logWarn: vi.fn(), logInfo: vi.fn() }));

const validBible = {
  meta: { suggested_title: "逆魂纪", alternative_titles: ["逆魂", "魂纪", "纪逆"] },
  characters: [
    { role: "protagonist", name: "沈言", age: 18, appearance: "清瘦", personality: "隐忍机敏", catchphrase: "活下去", abilities: ["剑魂共振"], goals: "查明父母旧案", motivation: "复仇与求真", secrets: ["体内有剑鞘"], relations: [] },
    { role: "mentor", name: "剑魂", age: 999, appearance: "无形之声", personality: "苍老讥诮", catchphrase: "归鞘", abilities: ["剑魂共振"], goals: "重塑本体", motivation: "求存", secrets: ["认识沈恪"], relations: [] },
    { role: "antagonist", name: "蒋阶", age: 40, appearance: "阴冷", personality: "狡诈", catchphrase: "棋子而已", abilities: ["祭剑术"], goals: "夺取剑魂", motivation: "野心", secrets: ["祭剑阵主谋"], relations: [] },
  ],
  world: { setting_summary: "九州仙门衰微，剑魂认主不可逆的修真世界".repeat(4), factions: [{ name: "柴饦峰", alignment: "中立", role: "杂役所在" }, { name: "黑铁会", alignment: "邪恶", role: "祭剑阵主谋" }], rules: ["剑魂认主不可逆", "祭剑需以血引魂"], geography: ["柴饦峰", "后山裂井"] },
  outline: { volume_1: { name: "第一卷", theme: "觉醒", chapter_count_estimate: 10, chapters: Array.from({ length: 8 }, (_, i) => ({ index: i + 1, title: `第${i + 1}章`, summary: `第${i + 1}章梗概：覆盖本章冲突、推进方向与悬念落点，长度足以通过校验。` })) } },
  first_chapter_beats: Array.from({ length: 5 }, (_, i) => ({ beat: i + 1, scene: `场景${i + 1}`, purpose: `目的${i + 1}` })),
};

const profile = {
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
};

function novelRow() {
  return {
    id: "novel-1",
    profile,
    bible: { id: "bible-1", content: validBible },
    chapters: [],
    volume_summaries: [],
    novel_summary: null,
  };
}

describe("handleGenerateChapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runChapterPipeline.mockResolvedValue({
      chapterIndex: 1,
      title: "第1章",
      content: "本章正文：沈言蹲在灶前，火光跳动。",
      criticIssues: [],
      revisedRounds: 0,
      rawCleanupHits: [],
      cost: { cny: 0.01, tokenIn: 100, tokenOut: 200 },
      model: "mock-model",
    });
    upsertChapter.mockResolvedValue({ id: "chap-1", chapter_index: 1 });
    updateBible.mockResolvedValue({});
    enqueueJob.mockResolvedValue({ id: "job-x" });
    moderateContent.mockResolvedValue({ allowed: true });
  });

  it("runs the pipeline, upserts the chapter as done, merges the Bible, and enqueues post-processing", async () => {
    const { handleGenerateChapter } = await import("./generateChapterHandler");
    findUniqueNovel.mockResolvedValue(novelRow());
    chatCompletionWithRetry.mockResolvedValue({ content: "{}" }); // valid (empty) state diff

    await handleGenerateChapter({ novel_id: "novel-1", chapter_index: 1 });

    expect(runChapterPipeline).toHaveBeenCalledWith(expect.objectContaining({ novelId: "novel-1", chapterIndex: 1 }));
    expect(upsertChapter).toHaveBeenCalledWith(expect.objectContaining({
      where: { novel_id_chapter_index: { novel_id: "novel-1", chapter_index: 1 } },
      create: expect.objectContaining({ novel_id: "novel-1", chapter_index: 1, title: "第1章", content: "本章正文：沈言蹲在灶前，火光跳动。", status: "done" }),
      update: expect.objectContaining({ status: "done" }),
    }));
    expect(updateBible).toHaveBeenCalledWith(expect.objectContaining({ where: { novel_id: "novel-1" } }));
    expect(enqueueJob).toHaveBeenCalledTimes(2);
    expect(enqueueJob).toHaveBeenNthCalledWith(1, { type: "summarize_chapter", payload: { chapter_id: "chap-1" }, novelId: "novel-1" });
    expect(enqueueJob).toHaveBeenNthCalledWith(2, { type: "index_chapter", payload: { novel_id: "novel-1", chapter_id: "chap-1" }, novelId: "novel-1" });
  });

  it("keeps the prior Bible (no update) when the state diff is unparseable, but still persists + enqueues", async () => {
    const { handleGenerateChapter } = await import("./generateChapterHandler");
    findUniqueNovel.mockResolvedValue(novelRow());
    chatCompletionWithRetry.mockResolvedValue({ content: "对不起，这一段不是 JSON。" });

    await handleGenerateChapter({ novel_id: "novel-1", chapter_index: 1 });

    expect(upsertChapter).toHaveBeenCalledTimes(1);
    expect(updateBible).not.toHaveBeenCalled();
    expect(enqueueJob).toHaveBeenCalledTimes(2);
  });

  it("throws on an invalid payload before touching the DB", async () => {
    const { handleGenerateChapter } = await import("./generateChapterHandler");
    await expect(handleGenerateChapter({ chapter_index: 1 } as unknown as never)).rejects.toThrow(/Invalid generate_chapter payload/);
    expect(findUniqueNovel).not.toHaveBeenCalled();
    expect(runChapterPipeline).not.toHaveBeenCalled();
  });

  it("throws when the novel or Bible is missing", async () => {
    const { handleGenerateChapter } = await import("./generateChapterHandler");
    findUniqueNovel.mockResolvedValue(null);
    await expect(handleGenerateChapter({ novel_id: "missing", chapter_index: 1 })).rejects.toThrow(/not found/);
    expect(upsertChapter).not.toHaveBeenCalled();
  });
});

describe("handleGenerateChapter self-chaining", () => {
  const runningRun = { id: "run-1", status: "running", total_chapters: 5, revision_rounds: 2 };

  beforeEach(() => {
    vi.clearAllMocks();
    runChapterPipeline.mockResolvedValue({
      chapterIndex: 1,
      title: "第1章",
      content: "本章正文：沈言蹲在灶前，火光跳动。",
      criticIssues: [],
      revisedRounds: 0,
      rawCleanupHits: [],
      cost: { cny: 0.01, tokenIn: 100, tokenOut: 200 },
      model: "mock-model",
    });
    upsertChapter.mockResolvedValue({ id: "chap-1", chapter_index: 1 });
    updateBible.mockResolvedValue({});
    enqueueJob.mockResolvedValue({ id: "job-x" });
    findUniqueNovel.mockResolvedValue(novelRow());
    chatCompletionWithRetry.mockResolvedValue({ content: "{}" });
    advanceProgress.mockResolvedValue({});
    addCost.mockResolvedValue({});
    markCompleted.mockResolvedValue({});
    markNeedsReview.mockResolvedValue({});
    pause.mockResolvedValue({});
    moderateContent.mockResolvedValue({ allowed: true });
    evaluateChapterGate.mockReturnValue({ pass: true, scorePct: 95, failedDims: [], reason: "通过", report: {} });
  });

  it("advances progress/cost and enqueues the next chapter while the run is active", async () => {
    getRun.mockResolvedValue({ ...runningRun });
    const { handleGenerateChapter } = await import("./generateChapterHandler");

    await handleGenerateChapter({ novel_id: "novel-1", chapter_index: 1, run_id: "run-1" });

    expect(advanceProgress).toHaveBeenCalledWith("run-1", 1);
    expect(addCost).toHaveBeenCalledWith("run-1", 0.01);
    expect(markCompleted).not.toHaveBeenCalled();
    expect(enqueueJob).toHaveBeenCalledWith({
      type: "generate_chapter",
      payload: { novel_id: "novel-1", chapter_index: 2, run_id: "run-1" },
      novelId: "novel-1",
    });
  });

  it("marks the run completed on the final chapter without chaining further", async () => {
    getRun.mockResolvedValue({ ...runningRun, total_chapters: 5 });
    runChapterPipeline.mockResolvedValue({
      chapterIndex: 5,
      title: "第5章",
      content: "末章正文，收束主线。",
      criticIssues: [],
      revisedRounds: 0,
      rawCleanupHits: [],
      cost: { cny: 0.01, tokenIn: 1, tokenOut: 1 },
      model: "mock-model",
    });
    const { handleGenerateChapter } = await import("./generateChapterHandler");

    await handleGenerateChapter({ novel_id: "novel-1", chapter_index: 5, run_id: "run-1" });

    expect(markCompleted).toHaveBeenCalledWith("run-1");
    expect(enqueueJob).not.toHaveBeenCalledWith(expect.objectContaining({ type: "generate_chapter" }));
  });

  it("halts the chain when the run was paused while the chapter was generating", async () => {
    getRun
      .mockResolvedValueOnce({ ...runningRun }) // pre-flight: still active
      .mockResolvedValueOnce({ ...runningRun, status: "paused" }); // post-persist re-read: paused
    const { handleGenerateChapter } = await import("./generateChapterHandler");

    await handleGenerateChapter({ novel_id: "novel-1", chapter_index: 1, run_id: "run-1" });

    expect(advanceProgress).toHaveBeenCalledWith("run-1", 1);
    expect(enqueueJob).not.toHaveBeenCalledWith(expect.objectContaining({ type: "generate_chapter" }));
  });

  it("skips the chapter entirely when the run is already cancelled before it runs", async () => {
    getRun.mockResolvedValue({ ...runningRun, status: "cancelled" });
    const { handleGenerateChapter } = await import("./generateChapterHandler");

    await handleGenerateChapter({ novel_id: "novel-1", chapter_index: 3, run_id: "run-1" });

    expect(runChapterPipeline).not.toHaveBeenCalled();
    expect(upsertChapter).not.toHaveBeenCalled();
    expect(advanceProgress).not.toHaveBeenCalled();
  });

  it("throws when run_id is given but the run is missing", async () => {
    getRun.mockResolvedValue(null);
    const { handleGenerateChapter } = await import("./generateChapterHandler");

    await expect(
      handleGenerateChapter({ novel_id: "novel-1", chapter_index: 1, run_id: "ghost" }),
    ).rejects.toThrow(/run ghost not found/);
    expect(runChapterPipeline).not.toHaveBeenCalled();
  });

  it("simulates the worker draining the chain: 3 chapters to completion", async () => {
    getRun.mockResolvedValue({ ...runningRun, total_chapters: 3 });
    const { handleGenerateChapter } = await import("./generateChapterHandler");

    type ChainPayload = { novel_id: string; chapter_index: number; run_id: string };
    const queue: ChainPayload[] = [{ novel_id: "novel-1", chapter_index: 1, run_id: "run-1" }];
    enqueueJob.mockImplementation(async (job: { type: string; payload: Record<string, unknown> }) => {
      if (job.type === "generate_chapter") queue.push(job.payload as ChainPayload);
      return { id: "job-x" };
    });

    let processed = 0;
    while (processed <= 10) {
      const next = queue.shift();
      if (!next) break;
      await handleGenerateChapter(next);
      processed += 1;
    }

    expect(processed).toBe(3);
    expect(markCompleted).toHaveBeenCalledTimes(1);
  });

  it("halts with needs_review when the quality gate fails under on_fail checkpoint", async () => {
    getRun.mockResolvedValue({ ...runningRun, checkpoint_mode: "on_fail" });
    evaluateChapterGate.mockReturnValue({
      pass: false,
      scorePct: 72,
      failedDims: [{ key: "ai_voice", label: "ai_voice", score: 4, max: 10, floor: 6 }],
      reason: "未达标：ai_voice(ai_voice) 4 < 6",
      report: {},
    });
    const { handleGenerateChapter } = await import("./generateChapterHandler");

    await handleGenerateChapter({ novel_id: "novel-1", chapter_index: 1, run_id: "run-1" });

    expect(markNeedsReview).toHaveBeenCalledWith("run-1", expect.stringContaining("质量门未过"));
    expect(markCompleted).not.toHaveBeenCalled();
    expect(enqueueJob).not.toHaveBeenCalledWith(expect.objectContaining({ type: "generate_chapter" }));
  });

  it("logs but keeps chaining when the gate fails under checkpoint_mode none", async () => {
    getRun.mockResolvedValue({ ...runningRun, checkpoint_mode: "none" });
    evaluateChapterGate.mockReturnValue({ pass: false, scorePct: 70, failedDims: [], reason: "未达标：总分 70% < 阈值 85%", report: {} });
    const { handleGenerateChapter } = await import("./generateChapterHandler");

    await handleGenerateChapter({ novel_id: "novel-1", chapter_index: 1, run_id: "run-1" });

    expect(markNeedsReview).not.toHaveBeenCalled();
    expect(enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({ type: "generate_chapter", payload: expect.objectContaining({ chapter_index: 2 }) }),
    );
  });

  it("pauses (resumable) when accumulated spend exceeds the cost cap, before scoring quality", async () => {
    getRun.mockResolvedValue({ ...runningRun, cost_cap_cny: 0.005 });
    addCost.mockResolvedValue({ ...runningRun, cost_cny_spent: 0.012 });
    const { handleGenerateChapter } = await import("./generateChapterHandler");

    await handleGenerateChapter({ novel_id: "novel-1", chapter_index: 1, run_id: "run-1" });

    expect(pause).toHaveBeenCalledWith("run-1", expect.stringContaining("成本超上限"));
    expect(evaluateChapterGate).not.toHaveBeenCalled();
    expect(enqueueJob).not.toHaveBeenCalledWith(expect.objectContaining({ type: "generate_chapter" }));
  });

  it("halts with needs_review and never persists when output moderation blocks the chapter", async () => {
    getRun.mockResolvedValue({ ...runningRun });
    moderateContent.mockResolvedValue({ allowed: false, code: "MODERATION_BLOCKED", reason: "色情内容" });
    const { handleGenerateChapter } = await import("./generateChapterHandler");

    await handleGenerateChapter({ novel_id: "novel-1", chapter_index: 1, run_id: "run-1" });

    expect(upsertChapter).not.toHaveBeenCalled();
    expect(advanceProgress).not.toHaveBeenCalled();
    expect(markNeedsReview).toHaveBeenCalledWith("run-1", expect.stringContaining("内容审核"));
    expect(enqueueJob).not.toHaveBeenCalled();
  });
});
