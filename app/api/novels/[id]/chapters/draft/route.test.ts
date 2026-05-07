import { describe, expect, it, vi } from "vitest";

import type { BibleDraft, NovelProfile } from "@/lib/validation/schemas";

const streamChatCompletionWithRetry = vi.fn();
const findUnique = vi.fn();

vi.mock("@/lib/llm/client", () => ({
  streamChatCompletionWithRetry,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    novel: { findUnique },
  },
}));

const profile: NovelProfile = {
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

const bible: BibleDraft = {
  meta: { suggested_title: "逆魂纪", alternative_titles: ["剑魂歌", "裁逆者", "柴门主"] },
  characters: [
    character("protagonist", "沈言"),
    character("mentor", "几"),
    character("antagonist", "蒋阶"),
  ],
  world: {
    setting_summary:
      "九州碎裂，十二仙脉争夺资源；修仙体系十境，剑魂为上古遗产，可越阶辅助体质；柴饦门为废柴宗门，主角被扣押在此。",
    factions: [
      { name: "柴饦门", alignment: "中立", role: "废柴宗门" },
      { name: "天代宗", alignment: "正道", role: "宿敌宗门" },
    ],
    rules: ["剑魂认主不可逆", "弟子三年不出师即逐出"],
    geography: ["雨宗", "柴饦峰"],
  },
  outline: {
    volume_1: {
      name: "柴饦起",
      theme: "从被扣押到逆袭宗门",
      chapter_count_estimate: 8,
      chapters: Array.from({ length: 8 }, (_, index) => ({
        index: index + 1,
        title: `第${index + 1}章`,
        summary: "这是一段长度足够通过校验的章节梗概，覆盖本章冲突与推进方向。",
      })),
    },
  },
  first_chapter_beats: [
    { beat: 1, scene: "雨夜火房", purpose: "建立反差" },
    { beat: 2, scene: "执事逼迫", purpose: "制造冲突" },
    { beat: 3, scene: "剑魂初鸣", purpose: "悬念钩子" },
    { beat: 4, scene: "后山裂井", purpose: "引出秘密" },
    { beat: 5, scene: "考核木牌", purpose: "给出目标" },
  ],
};

describe("POST /api/novels/[id]/chapters/draft", () => {
  it("emits an SSE error event when the LLM times out", async () => {
    const { POST } = await import("./route");
    findUnique.mockResolvedValue({
      id: "novel-1",
      profile,
      bible: { content: bible },
      chapters: [],
    });
    streamChatCompletionWithRetry.mockRejectedValue(new Error("DeepSeek stream timed out after 60000ms"));

    const response = await POST(
      new Request("http://localhost/api/novels/novel-1/chapters/draft", {
        method: "POST",
        body: JSON.stringify({ chapter_index: 1, title: "第1章" }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) },
    );
    const text = await response.text();

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(text).toContain("event: error");
    expect(text).toContain('"code":"LLM_TIMEOUT"');
    expect(text).toContain('"retryable":true');
  });
});

function character(role: "protagonist" | "mentor" | "antagonist", name: string) {
  return {
    role,
    name,
    age: role === "mentor" ? "上古" : 16,
    appearance: "平头讷讨，手腕上有同门留下的疤",
    personality: "表面懦弱实则冷静记仇",
    catchphrase: "我没有，你别乱说。",
    abilities: ["琉璃体质"],
    goals: "短期活下去，长期查清父母之死",
    motivation: "三岁时亲眼看到父母被同门灭口",
    secrets: ["体内封印上古剑魂"],
    relations: [],
  };
}
