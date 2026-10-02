import { beforeEach, describe, expect, it, vi } from "vitest";

const novelFindUnique = vi.fn(), checkpointFindUnique = vi.fn();
const bibleUpdate = vi.fn(), memorySync = vi.fn();
const chat = vi.fn();
vi.mock("@/lib/db", () => ({ prisma: {
  novel: { findUnique: novelFindUnique },
  storyMemoryCheckpoint: { findUnique: checkpointFindUnique },
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
    bibleDraft: { update: bibleUpdate },
  }),
} }));
vi.mock("@/lib/agent/storyMemory", () => ({ syncStoryMemory: memorySync }));
vi.mock("@/lib/llm/client", () => ({ chatCompletionWithRetry: chat }));
vi.mock("@/lib/llm/callContext", () => ({ withLlmCallContext: (_c: unknown, fn: () => Promise<unknown>) => fn() }));
vi.mock("@/lib/agent/generationExecution", () => ({ generationCallContext: vi.fn(() => ({})) }));

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

function novelRow(chapters: Array<{ chapter_index: number }>) {
  return {
    id: "novel-1", deleted_at: null, user_id: "user-1",
    bible: { content: validBible, updated_at: new Date(0) },
    chapters: chapters.map(c => ({ id: `ch-${c.chapter_index}`, chapter_index: c.chapter_index, title: `第${c.chapter_index}章`, content: `沈言在第${c.chapter_index}章的行动。赵平出现。`, status: "done", version: 1 })),
  };
}

const diff = (n: number) => JSON.stringify({ character_updates: [], timeline_events: [{ event: `事件${n}` }], plot_thread_updates: [], new_entities: [] });
const invoke = async () => (await import("./backfillStateHandler")).handleBackfillState({ novel_id: "novel-1" });

beforeEach(() => {
  vi.resetAllMocks();
  novelFindUnique.mockResolvedValue(novelRow([{ chapter_index: 5 }, { chapter_index: 6 }]));
  checkpointFindUnique.mockResolvedValue({ latest_chapter: 4 });
  chat.mockResolvedValue({ content: diff(0) });
  bibleUpdate.mockImplementation(async ({ data }: { data: { content: unknown } }) => ({ updated_at: new Date(Number((data.content as { story_state?: { timeline?: Array<{ event: string }> } }).story_state?.timeline?.length ?? 0) * 1000) }));
});

describe("backfill_state (F1)", () => {
  it("returns silently for novels without a checkpoint (never auto-piloted)", async () => {
    checkpointFindUnique.mockResolvedValue(null); await invoke();
    expect(chat).not.toHaveBeenCalled(); expect(bibleUpdate).not.toHaveBeenCalled();
  });
  it("returns silently when the state layer is already current", async () => {
    checkpointFindUnique.mockResolvedValue({ latest_chapter: 6 }); await invoke();
    expect(chat).not.toHaveBeenCalled();
  });
  it("applies state diffs for gap chapters in order and advances the lock watermark", async () => {
    let call = 0; chat.mockImplementation(async () => ({ content: diff(++call) }));
    await invoke();
    expect(chat).toHaveBeenCalledTimes(2);
    expect(memorySync).toHaveBeenCalledTimes(2);
    expect(memorySync.mock.calls.map(c => c[4].chapterIndex)).toEqual([5, 6]);
    expect(bibleUpdate).toHaveBeenCalledTimes(2);
    // 串行推进：第二章的乐观锁水位 = 第一章提交后的 updated_at
    const firstResult = await bibleUpdate.mock.results[0].value;
    expect(bibleUpdate.mock.calls[1][0].where.updated_at).toEqual(firstResult.updated_at);
  });
  it("retries an unparseable diff once before failing (mirrors the F7 two-strike pattern)", async () => {
    chat.mockResolvedValueOnce({ content: "invalid" }).mockResolvedValueOnce({ content: diff(1) }).mockResolvedValueOnce({ content: diff(2) });
    await invoke();
    expect(chat).toHaveBeenCalledTimes(3); expect(memorySync).toHaveBeenCalledTimes(2);
    chat.mockReset(); chat.mockResolvedValue({ content: "invalid" });
    await expect(invoke()).rejects.toThrow("无法解析");
  });
  it("rejects hallucinated entities without touching the Bible", async () => {
    chat.mockResolvedValue({ content: JSON.stringify({ character_updates: [{ name: "不存在的人", changes: { current_location: "哪里" }, confidence: "high" }], timeline_events: [], plot_thread_updates: [], new_entities: [] }) });
    await expect(invoke()).rejects.toThrow("校验失败");
    expect(bibleUpdate).not.toHaveBeenCalled();
  });
});
