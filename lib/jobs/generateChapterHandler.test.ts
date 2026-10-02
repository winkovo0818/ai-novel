import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLlmCallContext } from "@/lib/llm/callContext";
const findUniqueNovel = vi.fn(), createChapter = vi.fn(), updateChapter = vi.fn(), snapshot = vi.fn();
const updateBible = vi.fn(), createJob = vi.fn(), runUpdate = vi.fn(), runLock = vi.fn(), runLatest = vi.fn();
const runChapterPipeline = vi.fn(), chatCompletionWithRetry = vi.fn(), getRun = vi.fn(), addCost = vi.fn();
const memoryLoad = vi.fn(), memorySync = vi.fn(), arcRead = vi.fn();
const markNeedsReview = vi.fn(), moderateContent = vi.fn(), evaluateChapterGate = vi.fn();
vi.mock("@/lib/db", () => ({ prisma: {
  novel: { findUnique: findUniqueNovel },
  novelGenerationRun: { updateMany: runLock },
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
    chapterDraft: { create: createChapter, update: updateChapter }, chapterVersion: { create: snapshot },
    bibleDraft: { update: updateBible }, backgroundJob: { create: createJob },
    novelGenerationRun: { update: runUpdate, updateMany: runLock, findUniqueOrThrow: runLatest },
  }),
} }));
vi.mock("@/lib/agent/storyMemory", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/agent/storyMemory")>(), loadStoryMemory: memoryLoad, syncStoryMemory: memorySync }));
vi.mock("@/lib/agent/volumePlanStore", () => ({ readVolumeArc: arcRead }));
vi.mock("@/lib/agent/chapterPipeline", () => ({ runChapterPipeline }));
vi.mock("@/lib/agent/generationRun", () => ({ getRun, addCost, markNeedsReview }));
vi.mock("@/lib/agent/qualityGate", () => ({ evaluateChapterGate }));
vi.mock("@/lib/moderation/moderate", () => ({ moderateContent }));
vi.mock("@/lib/llm/client", () => ({ chatCompletionWithRetry }));
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
    user_id: "user-1",
    bible: { id: "bible-1", content: validBible, updated_at: new Date(0) },
    chapters: [],
    volume_summaries: [],
    novel_summary: null,
  };
}


const makeRun = (extra = {}) => ({ id: "run-1", novel_id: "novel-1", user_id: "user-1", status: "running",
  current_chapter: 0, total_chapters: 8, revision_rounds: 2, quality_floor: 85,
  checkpoint_mode: "on_fail", cost_cap_cny: null, cost_cny_spent: 0, ...extra });
const payload = { novel_id: "novel-1", chapter_index: 1, run_id: "run-1" };
beforeEach(() => {
  vi.resetAllMocks();
  findUniqueNovel.mockResolvedValue(novelRow());
  memoryLoad.mockResolvedValue({ state: {}, stale_records: 0 });
  updateBible.mockResolvedValue({ updated_at: new Date(1) });
  getRun.mockResolvedValue(makeRun()); runLatest.mockResolvedValue(makeRun());
  runLock.mockResolvedValue({ count: 1 }); createChapter.mockResolvedValue({ id: "ch-1" });
  chatCompletionWithRetry.mockResolvedValue({ content: "{}" });
  moderateContent.mockResolvedValue({ allowed: true });
  evaluateChapterGate.mockReturnValue({ pass: true, reason: "clean" });
  runChapterPipeline.mockResolvedValue({ chapterIndex: 1, title: "第1章", content: "沈言走出灶房。",
    criticIssues: [], revisedRounds: 0, rawCleanupHits: [], cost: { cny: 0.01, tokenIn: 1, tokenOut: 1 }, model: "mock" });
});
const invoke = async (p = payload, execution?: Parameters<typeof import("./generateChapterHandler").handleGenerateChapter>[1]) =>
  (await import("./generateChapterHandler")).handleGenerateChapter(p, execution);

describe("generation write protection", () => {
  it("saves accepted chapter, Bible, progress and next job together", async () => {
    await invoke();
    expect(createChapter).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "done", chapter_index: 1 }) });
    expect(updateBible).toHaveBeenCalledWith(expect.objectContaining({ where: { novel_id: "novel-1", updated_at: new Date(0) } }));
    expect(createJob.mock.calls.map(c => c[0].data.type)).toEqual(["summarize_chapter", "index_chapter", "generate_chapter"]);
    expect(runUpdate).toHaveBeenCalledWith({ where: { id: "run-1" }, data: { status: "running", current_chapter: 1, last_error: null, last_progress_at: expect.any(Date) } });
  });
  it("never overwrites nonempty user prose", async () => {
    const row = novelRow(); row.chapters = [{ id: "ch-1", chapter_index: 1, content: "用户正文" }] as never;
    findUniqueNovel.mockResolvedValue(row); await invoke();
    expect(runChapterPipeline).not.toHaveBeenCalled(); expect(createChapter).not.toHaveBeenCalled();
    expect(markNeedsReview).toHaveBeenCalled();
  });
  it("saves a failed verdict as a draft without advancing or changing the Bible", async () => {
    evaluateChapterGate.mockReturnValue({ pass: false, reason: "critical" }); await invoke();
    expect(createChapter).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "draft" }) });
    expect(runUpdate).toHaveBeenCalledWith({ where: { id: "run-1" }, data: expect.objectContaining({ status: "needs_review" }) });
    expect(runUpdate.mock.calls[0][0].data).not.toHaveProperty("current_chapter");
    expect(updateBible).not.toHaveBeenCalled(); expect(createJob).toHaveBeenCalledTimes(2);
  });
  it("invalid state updates prevent automatic acceptance", async () => {
    chatCompletionWithRetry.mockResolvedValue({ content: "invalid" }); await invoke();
    expect(createChapter.mock.calls[0][0].data.status).toBe("draft"); expect(updateBible).not.toHaveBeenCalled();
    expect(chatCompletionWithRetry).toHaveBeenCalledTimes(3); // judge shadow 1 次 + F7 两次 state-diff
  });
  it("recovers when the state-diff JSON parses on the second sample (F7)", async () => {
    chatCompletionWithRetry.mockResolvedValueOnce({ content: "invalid" }).mockResolvedValueOnce({ content: "{}" });
    await invoke();
    expect(createChapter.mock.calls[0][0].data.status).toBe("done"); expect(updateBible).toHaveBeenCalled();
  });
  it("honors the run's max_state_changes cap on state diffs", async () => {
    // 35 timeline events: over the default cap 30, admitted when the run config raises it to 40.
    const thirtyFive = { character_updates: [], timeline_events: Array.from({ length: 35 }, (_, i) => ({ event: `事件${i + 1}` })), plot_thread_updates: [], new_entities: [] };
    chatCompletionWithRetry.mockResolvedValue({ content: JSON.stringify(thirtyFive) });
    await invoke();
    expect(createChapter.mock.calls[0][0].data.status).toBe("draft"); expect(updateBible).not.toHaveBeenCalled();

    getRun.mockResolvedValue(makeRun({ config: { max_state_changes: 40 } }));
    await invoke();
    expect(createChapter.mock.calls[1][0].data.status).toBe("done"); expect(updateBible).toHaveBeenCalled();
  });
  it("none checkpoints may advance drafts but never label them done", async () => {
    getRun.mockResolvedValue(makeRun({ checkpoint_mode: "none" }));
    evaluateChapterGate.mockReturnValue({ pass: false, reason: "critical" }); await invoke();
    expect(createChapter.mock.calls[0][0].data.status).toBe("draft");
    expect(runUpdate.mock.calls[0][0].data.current_chapter).toBe(1); expect(createJob).toHaveBeenCalledTimes(3);
  });
  it("pausing during generation prevents all writes", async () => {
    runLock.mockResolvedValue({ count: 0 }); await invoke(); expect(createChapter).not.toHaveBeenCalled();
  });
  it("a replaced job lease prevents all writes", async () => {
    await expect(invoke(payload, { signal: new AbortController().signal, assertActive: vi.fn().mockRejectedValue(new Error("expired")) })).rejects.toThrow("expired");
    expect(createChapter).not.toHaveBeenCalled();
  });
  it("rejects another novel's run", async () => {
    getRun.mockResolvedValue(makeRun({ novel_id: "other" })); await expect(invoke()).rejects.toThrow("another novel");
  });
  it("cancelled or completed runs skip the pipeline", async () => {
    getRun.mockResolvedValue(makeRun({ status: "cancelled" })); await invoke(); expect(runChapterPipeline).not.toHaveBeenCalled();
  });
  it("stops the chain after the final accepted chapter", async () => {
    getRun.mockResolvedValue(makeRun({ total_chapters: 1 })); await invoke();
    expect(runUpdate.mock.calls[0][0].data.status).toBe("completed"); expect(createJob).toHaveBeenCalledTimes(2);
  });
  it("pauses at a volume boundary", async () => {
    const run = makeRun({ checkpoint_mode: "per_volume", current_chapter: 7, total_chapters: 12 });
    getRun.mockResolvedValue(run); runLatest.mockResolvedValue(run);
    runChapterPipeline.mockResolvedValue({ chapterIndex: 8, title: "卷末", content: "沈言走出灶房。", criticIssues: [] });
    await invoke({ ...payload, chapter_index: 8 });
    expect(runUpdate.mock.calls[0][0].data.status).toBe("paused"); expect(createJob).toHaveBeenCalledTimes(2);
  });
  it("uses actual call costs and owner attribution even when a state update fails", async () => {
    runChapterPipeline.mockImplementation(async () => {
      expect(getLlmCallContext()?.userId).toBe("user-1");
      await getLlmCallContext()?.onCost?.(0.02);
      return { chapterIndex: 1, title: "第一章", content: "正文", criticIssues: [] };
    });
    chatCompletionWithRetry.mockImplementation(async () => { await getLlmCallContext()?.onCost?.(0.01); return { content: "invalid" }; });
    await invoke(); expect(addCost.mock.calls).toEqual([["run-1", 0.02], ["run-1", 0.01], ["run-1", 0.01], ["run-1", 0.01]]); // judge shadow + F7 两次重试
  });
  it("pauses when the budget was reached during the chapter", async () => {
    runLatest.mockResolvedValue(makeRun({ cost_cap_cny: 0.1, cost_cny_spent: 0.11 })); await invoke();
    expect(runUpdate.mock.calls[0][0].data.status).toBe("paused"); expect(createJob).toHaveBeenCalledTimes(2);
  });
  it("moderation blocks output before it is persisted", async () => {
    moderateContent.mockResolvedValue({ allowed: false }); await invoke(); expect(createChapter).not.toHaveBeenCalled();
    expect(markNeedsReview).toHaveBeenCalled();
  });
  it("handles a concurrent chapter creation without overwriting", async () => {
    createChapter.mockRejectedValue({ code: "P2002" }); await invoke(); expect(markNeedsReview).toHaveBeenCalled();
  });
});

describe("continuous chapter completion", () => {
  const continuous = (extra = {}) => makeRun({ total_chapters: 1, config: { continuous: true, planning_window: 10 }, ...extra });
  it("continues with a planning job after the current horizon", async () => {
    getRun.mockResolvedValue(continuous()); runLatest.mockResolvedValue(continuous()); await invoke();
    expect(runUpdate.mock.calls[0][0].data).toMatchObject({ status: "planning", current_chapter: 1, total_chapters: 11 });
    expect(createJob.mock.calls.at(-1)![0].data).toMatchObject({ type: "plan_outline", payload: { target_chapters: 11, run_id: "run-1" } });
  });
  it("pauses at the budget even when a continuous horizon finishes", async () => {
    getRun.mockResolvedValue(continuous({ cost_cap_cny: 1 })); runLatest.mockResolvedValue(continuous({ cost_cap_cny: 1, cost_cny_spent: 1.1 }));
    await invoke(); expect(runUpdate.mock.calls[0][0].data.status).toBe("paused");
    expect(createJob.mock.calls.map(c => c[0].data.type)).toEqual(["summarize_chapter", "index_chapter"]);
  });
  it("keeps a failing continuous chapter for review instead of planning more", async () => {
    getRun.mockResolvedValue(continuous()); evaluateChapterGate.mockReturnValue({ pass: false, reason: "continuity" }); await invoke();
    expect(runUpdate.mock.calls[0][0].data.status).toBe("needs_review"); expect(runUpdate.mock.calls[0][0].data).not.toHaveProperty("total_chapters");
  });
  it("does not confuse the end of an outlined batch with a completed volume", async () => {
    getRun.mockResolvedValue(continuous({ current_chapter: 7, total_chapters: 8, checkpoint_mode: "per_volume" }));
    runChapterPipeline.mockResolvedValue({ chapterIndex: 8, title: "第8章", content: "沈言前往后山。", criticIssues: [], rawCleanupHits: [] });
    await invoke({ ...payload, chapter_index: 8 }); expect(runUpdate.mock.calls[0][0].data.status).toBe("planning");
  });
  it("uses the chosen model for the state updater too", async () => {
    getRun.mockResolvedValue(continuous({ config: { continuous: true, model: "chosen" } })); await invoke();
    expect(chatCompletionWithRetry.mock.calls[0][0].model).toBe("chosen");
  });
});

describe("long-term memory and payoff gates", () => {
  it.each([{ stale_records: 1 }, { historical_available: false }])("pauses before generation when remembered history is unsafe %j", async extra => {
    memoryLoad.mockResolvedValue({ state: {}, stale_records: 0, ...extra }); await invoke();
    expect(markNeedsReview).toHaveBeenCalledWith("run-1", expect.stringContaining("校准")); expect(runChapterPipeline).not.toHaveBeenCalled(); expect(createChapter).not.toHaveBeenCalled();
  });
  it("passes recalled facts and the volume plan into the pipeline and state updater", async () => {
    const state = { characters: [{ name: "沈言", current_location: "旧井" }] }; memoryLoad.mockResolvedValue({ state, stale_records: 0 });
    arcRead.mockResolvedValue({ plan: { thread_targets: [] } }); await invoke();
    expect(runChapterPipeline.mock.calls[0][0]).toMatchObject({ bible: { story_state: state }, volumeArc: { plan: { thread_targets: [] } } });
    expect(chatCompletionWithRetry.mock.calls[1][0].messages.map((m: {content: string}) => m.content).join("\n")).toContain("旧井"); // [0] 为 judge shadow 调用
  });
  it("holds a due but unresolved payoff for review without committing state or progress", async () => {
    arcRead.mockResolvedValue({ plan: { thread_targets: [{ kind: "plot_threads", title: "旧案", action: "resolve", deadline_chapter: 1 }] } }); await invoke();
    expect(createChapter.mock.calls[0][0].data.status).toBe("draft"); expect(runUpdate.mock.calls[0][0].data.last_error).toContain("回收期限");
    expect(runUpdate.mock.calls[0][0].data).not.toHaveProperty("current_chapter"); expect(updateBible).not.toHaveBeenCalled(); expect(memorySync).not.toHaveBeenCalled();
  });
  it("does not enforce advance-only or future targets early", async () => {
    arcRead.mockResolvedValue({ plan: { thread_targets: [{ kind: "plot_threads", title: "旧案", action: "advance", deadline_chapter: 1 }, { kind: "foreshadowing", title: "木牌", action: "resolve", deadline_chapter: 2 }] } }); await invoke();
    expect(createChapter.mock.calls[0][0].data.status).toBe("done");
  });
  it("commits accepted memory with the saved chapter version and propagates sync failure", async () => {
    createChapter.mockResolvedValue({ id: "ch-1", version: 1 }); await invoke(); expect(memorySync.mock.calls[0][4]).toEqual({ kind: "generated_chapter", chapterIndex: 1, chapterId: "ch-1", chapterVersion: 1 });
    memorySync.mockRejectedValue(new Error("memory failed")); await expect(invoke()).rejects.toThrow("memory failed");
  });
});

describe("evaluation stop and resource deferral", () => {
  it("accepts chapter 100 and never queues chapter 101", async () => {
    const run = makeRun({current_chapter: 99, total_chapters: 100, config: {continuous: true, unlimited_budget: true, stop_after_chapter: 100}});
    getRun.mockResolvedValue(run); runLatest.mockResolvedValue(run);
    runChapterPipeline.mockResolvedValue({chapterIndex: 100, title: "百章", content: "沈言走出灶房。", criticIssues: []});
    await invoke({...payload, chapter_index: 100});
    expect(runUpdate.mock.calls[0][0].data).toMatchObject({status: "completed", current_chapter: 100});
    expect(createJob.mock.calls.map(c => c[0].data.type)).toEqual(["summarize_chapter", "index_chapter"]);
  });
  it("does not mistake a resource wait in the state updater for a rejected draft", async () => {
    const {JobDeferredError} = await import("./deferred");
    const wait = new JobDeferredError(new Date(Date.now()+1000), "wait");
    chatCompletionWithRetry.mockRejectedValue(wait);
    await expect(invoke()).rejects.toBe(wait);
    expect(createChapter).not.toHaveBeenCalled(); expect(markNeedsReview).not.toHaveBeenCalled();
  });
});

describe("LLM judge gating (P2)", () => {
  const verdict = (macro: number) => JSON.stringify({
    scores: ["continuity", "logic", "character_consistency", "plot_progress", "world_rules", "ai_voice", "prose_readability",
      "clue_payoff", "situation_change", "arc_progress"].map((key) => ({ key, score: macro, evidence: "原文摘录" })),
    summary: "宏观评估", confidence: "medium",
  });
  it("shadow mode records the verdict without blocking acceptance", async () => {
    chatCompletionWithRetry.mockResolvedValueOnce({ content: verdict(3) }).mockResolvedValue({ content: "{}" });
    await invoke();
    expect(createChapter.mock.calls[0][0].data.status).toBe("done");
  });
  it("enforce mode blocks when the macro average is below 5", async () => {
    getRun.mockResolvedValue(makeRun({ config: { judge_mode: "enforce" } }));
    chatCompletionWithRetry.mockResolvedValueOnce({ content: verdict(3) }).mockResolvedValue({ content: "{}" });
    await invoke();
    expect(createChapter.mock.calls[0][0].data.status).toBe("draft");
    expect(runUpdate.mock.calls[0][0].data.last_error).toContain("宏观结构");
  });
  it("enforce mode accepts when the macro average clears the floor", async () => {
    getRun.mockResolvedValue(makeRun({ config: { judge_mode: "enforce" } }));
    chatCompletionWithRetry.mockResolvedValueOnce({ content: verdict(7) }).mockResolvedValue({ content: "{}" });
    await invoke();
    expect(createChapter.mock.calls[0][0].data.status).toBe("done");
  });
});
