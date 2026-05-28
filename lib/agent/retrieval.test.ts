import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  updateManyMemoryChunk: vi.fn(),
  createEmbeddings: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    memoryChunk: { updateMany: mocks.updateManyMemoryChunk },
  },
}));

vi.mock("@/lib/llm/embeddings", () => ({
  createEmbeddings: mocks.createEmbeddings,
}));

import type { BibleDraft } from "@/lib/validation/schemas";
import { retrieveMemories } from "./retrieval";

const ORIGINAL_ENV = { ...process.env };

const bible: BibleDraft = {
  meta: {
    suggested_title: "逆魂纪",
    alternative_titles: ["剑魂歌", "柴门逆", "裁逆者"],
  },
  characters: [
    character("protagonist", "沈言"),
    character("mentor", "几"),
    character("antagonist", "蒋阶"),
  ],
  world: {
    setting_summary: "九州仙门衰落，剑魂是上古遗留的力量核心。",
    factions: [
      { name: "柴饦门", alignment: "中立", role: "沈言所在宗门" },
      { name: "天代宗", alignment: "正道", role: "外部压力来源" },
    ],
    rules: ["剑魂认主不可逆"],
    geography: ["柴饦峰", "雨宗古道"],
  },
  outline: {
    volume_1: {
      name: "柴门起",
      theme: "被收留者反过来审判收留者",
      chapter_count_estimate: 8,
      chapters: [
        {
          index: 1,
          title: "第1章",
          summary: "沈言在雨夜火房听见剑魂低语。",
        },
      ],
    },
  },
  first_chapter_beats: [
    { beat: 1, scene: "雨夜火房", purpose: "交代沈言处境" },
    { beat: 2, scene: "执事责罚", purpose: "制造压迫" },
    { beat: 3, scene: "后山裂井", purpose: "引出剑魂" },
    { beat: 4, scene: "残魂试探", purpose: "建立张力" },
    { beat: 5, scene: "门主召见", purpose: "抛出危机" },
  ],
};

describe("retrieveMemories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it("returns a deterministic retrieval error in mock scenario mode", async () => {
    process.env.LLM_MOCK = "1";
    process.env.LLM_MOCK_SCENARIO = "retrieval-error";

    const result = await retrieveMemories("novel-1", bible, 1, 5);

    expect(result).toEqual({
      status: "error",
      memories: [],
      errorMessage: "Mock retrieval failure requested by LLM_MOCK_SCENARIO.",
    });
    expect(mocks.createEmbeddings).not.toHaveBeenCalled();
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });

  it("updates last_used_at for chunks returned to the writer", async () => {
    mocks.createEmbeddings.mockResolvedValue([Array.from({ length: 1024 }, () => 0.1)]);
    mocks.queryRaw.mockResolvedValue([
      {
        id: "chunk-1",
        text: "沈言在火房发现剑魂线索，这段记忆需要在后续章节召回。",
        chunk_type: "plot_thread",
        chapter_id: "chapter-1",
        chapter_index: 1,
        similarity: 0.9,
        importance: 1.5,
      },
    ]);
    mocks.updateManyMemoryChunk.mockResolvedValue({ count: 1 });

    const result = await retrieveMemories("novel-1", bible, 1, 3);

    expect(result.status).toBe("success");
    expect(result.memories).toHaveLength(1);
    expect(mocks.updateManyMemoryChunk).toHaveBeenCalledWith({
      where: { id: { in: ["chunk-1"] } },
      data: { last_used_at: expect.any(Date) },
    });
  });
});

function character(role: "protagonist" | "mentor" | "antagonist", name: string) {
  return {
    role,
    name,
    age: role === "mentor" ? "上古" : 16,
    appearance: "瘦削少年，腕有旧疤",
    personality: "表面懦弱，实则冷静记仇",
    catchphrase: "我没有，你别乱说。",
    abilities: ["剑魂共振"],
    goals: "短期活过宗门考核，长期查清父母旧案。",
    motivation: "他第一次拥有追问真相的能力。",
    secrets: ["体内封着上古剑魂"],
    relations: [],
  };
}
