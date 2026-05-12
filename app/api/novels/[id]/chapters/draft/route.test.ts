import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BibleDraft, NovelProfile } from "@/lib/validation/schemas";

const streamChatCompletionWithRetry = vi.fn();
const findUnique = vi.fn();
const getRequiredUserId = vi.fn();
const retrieveMemories = vi.fn();
const matchBlockedKeywords = vi.fn();
const failDraftSession = vi.fn().mockResolvedValue(undefined);
const completeDraftSession = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/llm/client", () => ({
  streamChatCompletionWithRetry,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    novel: { findUnique },
  },
}));

vi.mock("@/utils/supabase/auth", () => ({
  getRequiredUserId,
}));

vi.mock("@/lib/agent/retrieval", () => ({
  retrieveMemories,
}));

vi.mock("@/lib/agent/draftSession", () => ({
  createDraftSession: vi.fn().mockResolvedValue("ds-test"),
  createDraftBufferFlusher: vi.fn(() => ({
    schedule: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  })),
  completeDraftSession,
  failDraftSession,
}));

vi.mock("@/lib/moderation/moderate", () => ({
  moderateContent: () => Promise.resolve({ allowed: true }),
  stringifyForModeration: (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v)),
  matchBlockedKeywords,
  BLOCKED_KEYWORDS: [] as readonly RegExp[],
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
  beforeEach(() => {
    vi.clearAllMocks();
    getRequiredUserId.mockResolvedValue("user-1");
    retrieveMemories.mockResolvedValue({ status: "empty", memories: [] });
    // P0-8: guard scans every segment via matchBlockedKeywords. Default
    // to clean pass; tests that exercise the block path override
    // per-call with mockImplementationOnce / mockImplementation.
    matchBlockedKeywords.mockReturnValue(null);
  });

  it("emits an SSE error event when the LLM times out", async () => {
    const { POST } = await import("./route");
    findUnique.mockResolvedValue({
      id: "novel-1",
      user_id: "user-1",
      profile,
      bible: { content: bible },
      chapters: [],
      volume_summaries: [],
      novel_summary: null,
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

  it("hides a user-owned novel from a different user", async () => {
    const { POST } = await import("./route");
    findUnique.mockResolvedValue({
      id: "novel-1",
      user_id: "owner-1",
      profile,
      bible: { content: bible },
      chapters: [],
      volume_summaries: [],
      novel_summary: null,
    });
    getRequiredUserId.mockResolvedValue("owner-2");

    const response = await POST(
      new Request("http://localhost/api/novels/novel-1/chapters/draft", {
        method: "POST",
        body: JSON.stringify({ chapter_index: 1, title: "第1章" }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error.code).toBe("NOVEL_NOT_FOUND");
    expect(streamChatCompletionWithRetry).not.toHaveBeenCalled();
  });

  it("returns 401 when not authenticated", async () => {
    const { POST } = await import("./route");
    findUnique.mockResolvedValue({
      id: "novel-1",
      user_id: null,
      profile,
      bible: { content: bible },
      chapters: [],
      volume_summaries: [],
      novel_summary: null,
    });
    getRequiredUserId.mockRejectedValue(new Error("UNAUTHORIZED"));

    const response = await POST(
      new Request("http://localhost/api/novels/novel-1/chapters/draft", {
        method: "POST",
        body: JSON.stringify({ chapter_index: 1, title: "第1章" }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("emits a retrieval SSE event with truncated memory chunks before the LLM stream", async () => {
    const { POST } = await import("./route");
    findUnique.mockResolvedValue({
      id: "novel-1",
      user_id: "user-1",
      profile,
      bible: { content: bible },
      chapters: [],
      volume_summaries: [],
      novel_summary: null,
    });
    retrieveMemories.mockResolvedValue({
      status: "success",
      memories: [
        {
          source: "chapter:3",
          reason: "shared protagonist arc",
          score: 0.873,
          text: "短记忆片段 ABC",
        },
        {
          // Long text should be truncated to 200 chars + ellipsis
          source: "world:rule:1",
          reason: "rule referenced in beat sheet",
          score: 0.612,
          text: "长".repeat(300),
        },
      ],
    });
    streamChatCompletionWithRetry.mockImplementation(async (_args, callbacks) => {
      callbacks?.onDelta?.("章节正文片段");
      return { tokenIn: 100, tokenOut: 50, costCny: 0.0001, tookMs: 10 };
    });

    const response = await POST(
      new Request("http://localhost/api/novels/novel-1/chapters/draft", {
        method: "POST",
        body: JSON.stringify({ chapter_index: 1, title: "第1章" }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) },
    );
    const text = await response.text();

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(text).toContain("event: retrieval");
    expect(text).toContain('"status":"success"');
    expect(text).toContain('"source":"chapter:3"');
    expect(text).toContain('"score":0.873');
    expect(text).toContain('"reason":"shared protagonist arc"');
    // Truncated payload — exactly 200 "长" plus ellipsis, never the full 300
    expect(text).toContain(`${"长".repeat(200)}…`);
    expect(text).not.toContain("长".repeat(201));
    // Retrieval event is emitted before any chapter_delta
    expect(text.indexOf("event: retrieval")).toBeLessThan(text.indexOf("event: chapter_delta"));
  });

  // ─────────────────────────────────────────────
  // P0-8: segment-level moderation integration
  // ─────────────────────────────────────────────

  function setupOwnedNovel() {
    findUnique.mockResolvedValue({
      id: "novel-1",
      user_id: "user-1",
      profile,
      bible: { content: bible },
      chapters: [],
      volume_summaries: [],
      novel_summary: null,
    });
  }

  it("forwards every segment to the client when content is clean (P0-8)", async () => {
    const { POST } = await import("./route");
    setupOwnedNovel();
    streamChatCompletionWithRetry.mockImplementation(async (_args, callbacks) => {
      callbacks?.onDelta?.("一段普通文字。");
      callbacks?.onDelta?.("第二段也很普通!");
      callbacks?.onDelta?.("收尾无标点");
      return { tokenIn: 50, tokenOut: 100, costCny: 0.0002, tookMs: 30 };
    });

    const response = await POST(
      new Request("http://localhost/api/novels/novel-1/chapters/draft", {
        method: "POST",
        body: JSON.stringify({ chapter_index: 1, title: "第1章" }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) },
    );
    const text = await response.text();

    // Three segments → three chapter_delta events. The first two are
    // sentence-terminated, the third is flushed by flushTail() after
    // the stream completes.
    expect(text.match(/event: chapter_delta/g)).toHaveLength(3);
    expect(text).toContain('"delta":"一段普通文字。"');
    expect(text).toContain('"delta":"第二段也很普通!"');
    expect(text).toContain('"delta":"收尾无标点"');
    // done event present, no error
    expect(text).toContain("event: done");
    expect(text).not.toContain("event: error");
    expect(failDraftSession).not.toHaveBeenCalled();
    expect(completeDraftSession).toHaveBeenCalledOnce();
  });

  it("blocks an in-stream keyword hit with MODERATION_BLOCKED_INLINE + aborts the LLM (P0-8)", async () => {
    const { POST } = await import("./route");
    setupOwnedNovel();
    // Banned phrase appears inside the first segment ("制作炸弹").
    matchBlockedKeywords.mockImplementation((text: string) =>
      /制作炸弹/.test(text)
        ? { pattern: /制作炸弹/, reason: "内容包含违规关键词" }
        : null,
    );

    let abortSignalSeen: AbortSignal | undefined;
    let secondDeltaCalled = false;
    streamChatCompletionWithRetry.mockImplementation(async (args, callbacks) => {
      abortSignalSeen = args.signal;
      // First delta contains the banned phrase and ends with `。`, so
      // the guard runs synchronously inside onDelta and throws
      // ModerationBlockError. Let it propagate — the route's catch
      // branch keys on `instanceof ModerationBlockError`, so wrapping
      // it here would push us onto the generic LLM_TIMEOUT/INTERNAL
      // path and defeat the test.
      callbacks?.onDelta?.("引子。这里有制作炸弹的步骤。");
      // Should be unreachable: the line above throws.
      secondDeltaCalled = true;
      callbacks?.onDelta?.("永远不应该出现的第二段。");
      return { tokenIn: 10, tokenOut: 10, costCny: 0, tookMs: 5 };
    });

    const response = await POST(
      new Request("http://localhost/api/novels/novel-1/chapters/draft", {
        method: "POST",
        body: JSON.stringify({ chapter_index: 1, title: "第1章" }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) },
    );
    const text = await response.text();

    // The SSE error event uses the inline code so we can tell it apart
    // from the legacy full-text moderation (MODERATION_BLOCKED).
    expect(text).toContain("event: error");
    expect(text).toContain('"code":"MODERATION_BLOCKED_INLINE"');
    expect(text).toContain('"retryable":false');
    // The banned segment must NOT have been sent to the client.
    expect(text).not.toContain("制作炸弹");
    // The session row landed in failed state with the inline code.
    expect(failDraftSession).toHaveBeenCalledWith(
      "ds-test",
      expect.objectContaining({
        code: "MODERATION_BLOCKED_INLINE",
      }),
    );
    expect(completeDraftSession).not.toHaveBeenCalled();
    // The abort fired on the route's controller, and it's the same
    // signal that got handed to the LLM client.
    expect(abortSignalSeen?.aborted).toBe(true);
    // We never re-entered onDelta after the throw.
    expect(secondDeltaCalled).toBe(false);
  });

  it("catches keywords split across two segments via the sliding tail (P0-8 D-02)", async () => {
    const { POST } = await import("./route");
    setupOwnedNovel();
    matchBlockedKeywords.mockImplementation((text: string) =>
      /制作炸弹/.test(text)
        ? { pattern: /制作炸弹/, reason: "内容包含违规关键词" }
        : null,
    );

    // Construct a real cross-segment hit. The segmenter's natural
    // boundary chars (。!?\n) are themselves part of the emitted
    // segment, so a keyword can only span two segments when the
    // first segment ends via the 200-char HARD CAP rather than a
    // punctuation char. Build a payload that runs exactly to that
    // cap with "制" as the last char, then has the rest of the
    // banned word at the start of the next delta.
    const firstSegmentTail = "啊".repeat(199) + "制"; // 200 chars, no punctuation → hard-cap flush
    streamChatCompletionWithRetry.mockImplementation(async (_args, callbacks) => {
      callbacks?.onDelta?.(firstSegmentTail);
      callbacks?.onDelta?.("作炸弹的方法。"); // sliding tail of seg1 + this seg's head = "...制作炸弹..."
      return { tokenIn: 5, tokenOut: 5, costCny: 0, tookMs: 1 };
    });

    const response = await POST(
      new Request("http://localhost/api/novels/novel-1/chapters/draft", {
        method: "POST",
        body: JSON.stringify({ chapter_index: 1, title: "第1章" }),
      }),
      { params: Promise.resolve({ id: "novel-1" }) },
    );
    const text = await response.text();

    expect(text).toContain('"code":"MODERATION_BLOCKED_INLINE"');
    // First segment (200 啊+制) was clean in isolation and got forwarded.
    expect(text).toContain(firstSegmentTail);
    // The cross-boundary segment that completed the banned phrase
    // was rejected and never reached the client.
    expect(text).not.toContain("作炸弹的方法");
    expect(failDraftSession).toHaveBeenCalledWith(
      "ds-test",
      expect.objectContaining({ code: "MODERATION_BLOCKED_INLINE" }),
    );
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
