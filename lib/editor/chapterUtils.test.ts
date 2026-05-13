import { describe, it, expect } from "vitest";

import type { ChapterDraftView } from "@/app/(app)/editor/[novelId]/EditorClient";

import {
  resolveStartIndex,
  deriveChapterStateFromDraft,
  mergeChapterIntoList,
  patchChapterInList,
  hasUnsavedChapterChanges,
  shouldAutoSaveChapter,
  buildBeatSheetRequest,
  buildCandidateCriticRequest,
  buildChapterVersionsRequest,
  buildConsistencyRequest,
  buildDeleteChapterRequest,
  buildPersistChapterRequest,
  buildResumableDraftRequest,
  buildStateDiffRequest,
  buildTargetWordsRequest,
  buildDraftChapterRequest,
  applyAcceptMode,
  applyDraftSseEvent,
  candidateAcceptedMessage,
  getChapterContentLimitState,
  hasStateDiffChanges,
  normalizeResumableDraftPayload,
  resumableDraftLoadedMessage,
} from "./chapterUtils";
import { CHAPTER_CONTENT_MAX_CHARS } from "@/lib/validation/schemas";
import type { StateDiff } from "@/lib/validation/schemas";

const outline = [{ index: 1 }, { index: 2 }, { index: 3 }];

describe("resolveStartIndex", () => {
  it("returns the requested index when it exists in the outline", () => {
    expect(resolveStartIndex(outline, 2)).toBe(2);
  });

  it("falls back to chapter 1 when the requested index is missing", () => {
    expect(resolveStartIndex(outline, 99)).toBe(1);
  });

  it("falls back to chapter 1 when no index is requested", () => {
    expect(resolveStartIndex(outline, undefined)).toBe(1);
  });

  it("falls back to chapter 1 even if 1 is itself missing (last-resort)", () => {
    expect(resolveStartIndex([{ index: 2 }, { index: 3 }], undefined)).toBe(1);
  });
});

describe("deriveChapterStateFromDraft", () => {
  it("uses persisted draft fields when available", () => {
    const draft: ChapterDraftView = {
      id: "ch-1",
      chapter_index: 1,
      title: "回响",
      content: "...",
      status: "done",
      target_words: 3000,
      version: 7,
      updated_at: "2026-05-11T10:00:00Z",
    };
    const state = deriveChapterStateFromDraft(draft, "outline-title", 1);
    expect(state).toEqual({
      chapterId: "ch-1",
      title: "回响",
      content: "...",
      status: "done",
      targetWords: 3000,
      lastSavedAt: "2026-05-11T10:00:00Z",
      version: 7,
    });
  });

  it("falls back to outline title when no draft exists", () => {
    const state = deriveChapterStateFromDraft(undefined, "Outline 5", 5);
    expect(state.chapterId).toBeUndefined();
    expect(state.title).toBe("Outline 5");
    expect(state.content).toBe("");
    expect(state.status).toBe("draft");
    expect(state.targetWords).toBeNull();
    expect(state.version).toBe(0);
  });

  it("falls back to generated title when no draft and no outline title", () => {
    const state = deriveChapterStateFromDraft(undefined, undefined, 7);
    expect(state.title).toBe("第 7 章");
  });

  it("coerces unknown draft status to 'draft'", () => {
    const draft = {
      id: "ch-2",
      chapter_index: 2,
      title: "T",
      content: "C",
      status: "weird",
    } as ChapterDraftView;
    expect(deriveChapterStateFromDraft(draft, undefined, 2).status).toBe("draft");
  });
});

describe("mergeChapterIntoList", () => {
  const a: ChapterDraftView = { id: "a", chapter_index: 1, title: "A", content: "", status: "draft" };
  const b: ChapterDraftView = { id: "b", chapter_index: 3, title: "B", content: "", status: "draft" };
  const c: ChapterDraftView = { id: "c", chapter_index: 2, title: "C", content: "", status: "draft" };

  it("inserts a new chapter and re-sorts by chapter_index", () => {
    const result = mergeChapterIntoList([a, b], c);
    expect(result.map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("patches an existing chapter in place without re-sorting", () => {
    const updated: ChapterDraftView = { ...a, title: "A-edited" };
    const result = mergeChapterIntoList([a, b], updated);
    expect(result.map((r) => r.id)).toEqual(["a", "b"]);
    expect(result[0].title).toBe("A-edited");
  });

  it("starts a list when given empty input", () => {
    expect(mergeChapterIntoList([], a)).toEqual([a]);
  });
});

describe("patchChapterInList", () => {
  it("merges the restored row into the existing chapter without reordering", () => {
    const a: ChapterDraftView = { id: "a", chapter_index: 1, title: "A", content: "", status: "draft" };
    const b: ChapterDraftView = { id: "b", chapter_index: 2, title: "B", content: "", status: "draft" };
    const result = patchChapterInList([a, b], { ...b, title: "Restored", version: 3 });
    expect(result).toEqual([a, { ...b, title: "Restored", version: 3 }]);
  });

  it("leaves the list unchanged when the restored row is not present", () => {
    const a: ChapterDraftView = { id: "a", chapter_index: 1, title: "A", content: "", status: "draft" };
    const missing: ChapterDraftView = { id: "missing", chapter_index: 9, title: "M", content: "", status: "draft" };
    expect(patchChapterInList([a], missing)).toEqual([a]);
  });
});

describe("hasUnsavedChapterChanges", () => {
  const saved = { title: "T", content: "C", status: "draft" as const };

  it("returns false when the current text state matches the saved baseline", () => {
    expect(hasUnsavedChapterChanges(saved, saved)).toBe(false);
  });

  it("returns true when title, content, or status differs", () => {
    expect(hasUnsavedChapterChanges({ ...saved, title: "T2" }, saved)).toBe(true);
    expect(hasUnsavedChapterChanges({ ...saved, content: "C2" }, saved)).toBe(true);
    expect(hasUnsavedChapterChanges({ ...saved, status: "done" }, saved)).toBe(true);
  });
});

describe("shouldAutoSaveChapter", () => {
  it("requires unsaved changes and a non-empty title", () => {
    expect(shouldAutoSaveChapter({
      hasUnsavedChanges: false,
      status: "idle",
      title: "T",
    })).toBe(false);
    expect(shouldAutoSaveChapter({
      hasUnsavedChanges: true,
      status: "idle",
      title: "   ",
    })).toBe(false);
  });

  it("does not autosave while saving or drafting", () => {
    expect(shouldAutoSaveChapter({
      hasUnsavedChanges: true,
      status: "saving",
      title: "T",
    })).toBe(false);
    expect(shouldAutoSaveChapter({
      hasUnsavedChanges: true,
      status: "drafting",
      title: "T",
    })).toBe(false);
  });

  it("allows autosave for dirty idle/saved/error states", () => {
    expect(shouldAutoSaveChapter({
      hasUnsavedChanges: true,
      status: "idle",
      title: "T",
    })).toBe(true);
    expect(shouldAutoSaveChapter({
      hasUnsavedChanges: true,
      status: "saved",
      title: "T",
    })).toBe(true);
    expect(shouldAutoSaveChapter({
      hasUnsavedChanges: true,
      status: "error",
      title: "T",
    })).toBe(true);
  });
});

describe("getChapterContentLimitState", () => {
  it("stays ok below the 95% warning threshold", () => {
    const state = getChapterContentLimitState("x".repeat(Math.floor(CHAPTER_CONTENT_MAX_CHARS * 0.95) - 1));
    expect(state).toMatchObject({
      level: "ok",
      currentChars: 75_999,
      maxChars: CHAPTER_CONTENT_MAX_CHARS,
      remainingChars: 4_001,
    });
    expect(state.message).toBeUndefined();
  });

  it("warns at the 95% threshold", () => {
    const state = getChapterContentLimitState("x".repeat(76_000));
    expect(state.level).toBe("near");
    expect(state.remainingChars).toBe(4_000);
    expect(state.message).toContain("76,000 / 80,000");
    expect(state.message).toContain("剩余 4,000 字");
  });

  it("switches to the hard-cap message exactly at 80,000 chars", () => {
    const state = getChapterContentLimitState("x".repeat(CHAPTER_CONTENT_MAX_CHARS));
    expect(state).toMatchObject({
      level: "at",
      currentChars: 80_000,
      remainingChars: 0,
    });
    expect(state.message).toContain("已达到本章上限 80,000 字");
  });

  it("reports the overflow amount above the schema cap", () => {
    const state = getChapterContentLimitState("x".repeat(CHAPTER_CONTENT_MAX_CHARS + 3));
    expect(state).toMatchObject({
      level: "over",
      currentChars: 80_003,
      remainingChars: 0,
    });
    expect(state.message).toContain("请删减 3 字");
  });
});

describe("buildPersistChapterRequest", () => {
  it("builds a PATCH request with source and optimistic-lock version for saved chapters", () => {
    expect(buildPersistChapterRequest({
      chapterId: "ch-1",
      novelId: "novel-1",
      selectedIndex: 2,
      title: "T",
      content: "C",
      status: "done",
      source: "manual",
      expectedVersion: 7,
    })).toEqual({
      url: "/api/chapters/ch-1",
      method: "PATCH",
      payload: {
        title: "T",
        content: "C",
        status: "done",
        source: "manual",
        expected_version: 7,
      },
    });
  });

  it("builds a POST request with chapter_index for unsaved chapters", () => {
    expect(buildPersistChapterRequest({
      novelId: "novel-1",
      selectedIndex: 3,
      title: "T",
      content: "C",
      status: "draft",
      source: "autosave",
      expectedVersion: 0,
    })).toEqual({
      url: "/api/novels/novel-1/chapters",
      method: "POST",
      payload: {
        title: "T",
        content: "C",
        status: "draft",
        chapter_index: 3,
      },
    });
  });
});

describe("request builders", () => {
  it("builds resumable draft GET and DELETE requests", () => {
    expect(buildResumableDraftRequest("n-1", 4)).toEqual({
      url: "/api/novels/n-1/chapters/draft/resume?chapter_index=4",
      method: "GET",
      payload: undefined,
    });
    expect(buildResumableDraftRequest("n-1", 4, "DELETE")).toEqual({
      url: "/api/novels/n-1/chapters/draft/resume?chapter_index=4",
      method: "DELETE",
      payload: undefined,
    });
  });

  it("builds candidate critic requests", () => {
    expect(buildCandidateCriticRequest({
      novelId: "n-1",
      selectedIndex: 3,
      content: "正文",
    })).toEqual({
      url: "/api/novels/n-1/chapters/critic",
      method: "POST",
      payload: {
        chapter_index: 3,
        content: "正文",
      },
    });
  });

  it("builds simple chapter utility requests", () => {
    expect(buildConsistencyRequest("n-1")).toEqual({
      url: "/api/novels/n-1/consistency",
      method: "POST",
      payload: undefined,
    });
    expect(buildChapterVersionsRequest("ch-1")).toEqual({
      url: "/api/chapters/ch-1/versions",
      method: "GET",
      payload: undefined,
    });
    expect(buildStateDiffRequest("ch-1")).toEqual({
      url: "/api/chapters/ch-1/state-diff",
      method: "POST",
      payload: undefined,
    });
    expect(buildDeleteChapterRequest("ch-1")).toEqual({
      url: "/api/chapters/ch-1",
      method: "DELETE",
      payload: undefined,
    });
  });

  it("builds beat sheet requests with an optional chapter goal", () => {
    expect(buildBeatSheetRequest({
      novelId: "n-1",
      selectedIndex: 2,
      chapterTitle: "遭遇",
    })).toEqual({
      url: "/api/novels/n-1/chapters/outline",
      method: "POST",
      payload: {
        chapter_index: 2,
        chapter_title: "遭遇",
      },
    });
    expect(buildBeatSheetRequest({
      novelId: "n-1",
      selectedIndex: 2,
      chapterTitle: "遭遇",
      chapterGoal: "制造误会",
    }).payload.chapter_goal).toBe("制造误会");
  });
});

describe("buildTargetWordsRequest", () => {
  it("builds a manual PATCH carrying the optimistic-lock version", () => {
    expect(buildTargetWordsRequest("ch-1", 3200, 9)).toEqual({
      url: "/api/chapters/ch-1",
      method: "PATCH",
      payload: {
        target_words: 3200,
        source: "manual",
        expected_version: 9,
      },
    });
  });

  it("supports clearing the target words", () => {
    expect(buildTargetWordsRequest("ch-1", null, 10).payload.target_words).toBeNull();
  });
});

describe("buildDraftChapterRequest", () => {
  it("builds a draft POST without beat_sheet when no beats are present", () => {
    expect(buildDraftChapterRequest({
      novelId: "n-1",
      selectedIndex: 4,
      title: "转折",
      existingContent: "old",
      beats: [],
    })).toEqual({
      url: "/api/novels/n-1/chapters/draft",
      method: "POST",
      payload: {
        chapter_index: 4,
        title: "转折",
        existing_content: "old",
      },
    });
  });

  it("includes editable beat_sheet when beats are present", () => {
    const beats = [{ index: 1, description: "冲突升级" }];
    expect(buildDraftChapterRequest({
      novelId: "n-1",
      selectedIndex: 4,
      title: "转折",
      existingContent: "old",
      beats,
    }).payload.beat_sheet).toEqual({ beats });
  });
});

describe("applyAcceptMode", () => {
  it("replace overwrites the whole body", () => {
    expect(applyAcceptMode("old", "new", "replace", null)).toBe("new");
  });

  it("append joins with a blank line, trimming trailing whitespace on the original", () => {
    expect(applyAcceptMode("line1\n\n", "line2", "append", null)).toBe("line1\n\nline2");
  });

  it("append onto empty content returns the candidate verbatim", () => {
    expect(applyAcceptMode("", "candidate", "append", null)).toBe("candidate");
  });

  it("insert at cursor splices the candidate in", () => {
    expect(applyAcceptMode("hello world", "<NEW>", "insert", 5)).toBe("hello<NEW> world");
  });

  it("insert with null cursor appends to the end", () => {
    expect(applyAcceptMode("abc", "X", "insert", null)).toBe("abcX");
  });

  it("insert clamps an out-of-range cursor to the content length", () => {
    expect(applyAcceptMode("abc", "X", "insert", 999)).toBe("abcX");
  });

  it("insert clamps a negative cursor to zero", () => {
    expect(applyAcceptMode("abc", "X", "insert", -5)).toBe("Xabc");
  });
});

describe("candidateAcceptedMessage", () => {
  it("returns the user-facing success message for each productive mode", () => {
    expect(candidateAcceptedMessage("replace")).toBe("候选稿已替换正文");
    expect(candidateAcceptedMessage("append")).toBe("候选稿已追加到末尾");
    expect(candidateAcceptedMessage("insert")).toBe("候选稿已插入光标处");
  });
});

describe("resumableDraftLoadedMessage", () => {
  it("distinguishes completed sessions from interrupted sessions", () => {
    expect(resumableDraftLoadedMessage("completed")).toBe("已加载上次未完成的候选稿");
    expect(resumableDraftLoadedMessage("streaming")).toBe("已加载上次中断的部分候选稿，可继续编辑或丢弃");
    expect(resumableDraftLoadedMessage("failed")).toBe("已加载上次中断的部分候选稿，可继续编辑或丢弃");
  });
});

describe("applyDraftSseEvent", () => {
  it("captures session id", () => {
    expect(applyDraftSseEvent({ generated: "", done: false }, {
      event: "session",
      data: { sessionId: "ds-1" },
    }).sessionId).toBe("ds-1");
  });

  it("accumulates chapter deltas", () => {
    const first = applyDraftSseEvent({ generated: "", done: false }, {
      event: "chapter_delta",
      data: { delta: "甲" },
    });
    expect(applyDraftSseEvent(first, {
      event: "chapter_delta",
      data: { delta: "乙" },
    }).generated).toBe("甲乙");
  });

  it("normalizes retrieval payload and drops malformed memories", () => {
    const state = applyDraftSseEvent({ generated: "", done: false }, {
      event: "retrieval",
      data: {
        status: "success",
        error: "ignored when present",
        memories: [
          { source: "chapter:1", reason: "近似", score: 0.9, text: "片段" },
          { source: "bad", reason: "bad", score: "0.1", text: "bad" },
        ],
      },
    });
    expect(state.retrievalStatus).toBe("success");
    expect(state.retrievalError).toBe("ignored when present");
    expect(state.retrievedMemories).toEqual([
      { source: "chapter:1", reason: "近似", score: 0.9, text: "片段" },
    ]);
  });

  it("captures error events with a default message", () => {
    expect(applyDraftSseEvent({ generated: "", done: false }, {
      event: "error",
      data: {},
    }).streamError).toBe("章节起草失败");
  });

  it("marks done and carries retrieval_status forward", () => {
    const state = applyDraftSseEvent({ generated: "正文", done: false, retrievalStatus: "empty" }, {
      event: "done",
      data: { retrieval_status: "success" },
    });
    expect(state.done).toBe(true);
    expect(state.retrievalStatus).toBe("success");
  });

  it("ignores unknown events", () => {
    const initial = { generated: "正文", done: false };
    expect(applyDraftSseEvent(initial, { event: "heartbeat", data: {} })).toBe(initial);
  });
});

function emptyDiff(overrides: Partial<StateDiff> = {}): StateDiff {
  return {
    character_updates: [],
    timeline_events: [],
    plot_thread_updates: [],
    new_entities: [],
    ...overrides,
  };
}

describe("hasStateDiffChanges", () => {
  it("returns false when every diff bucket is empty", () => {
    expect(hasStateDiffChanges(emptyDiff())).toBe(false);
  });

  it("returns true when any diff bucket has content", () => {
    expect(hasStateDiffChanges(emptyDiff({
      character_updates: [{ name: "A", changes: { goal: "x" }, confidence: "high" }],
    }))).toBe(true);
    expect(hasStateDiffChanges(emptyDiff({ timeline_events: [{ event: "x" }] }))).toBe(true);
    expect(hasStateDiffChanges(emptyDiff({
      plot_thread_updates: [{ title: "x", status: "open" }],
    }))).toBe(true);
    expect(hasStateDiffChanges(emptyDiff({
      new_entities: [{ name: "x", type: "location", description: "d" }],
    }))).toBe(true);
  });
});

describe("normalizeResumableDraftPayload", () => {
  it("returns null for unsuccessful responses", () => {
    expect(normalizeResumableDraftPayload({ ok: false })).toBeNull();
  });

  it("returns null for near-empty buffers", () => {
    expect(normalizeResumableDraftPayload({
      ok: true,
      data: { id: "s1", status: "completed", buffer: " tiny " },
    })).toBeNull();
  });

  it("normalizes a valid payload", () => {
    expect(normalizeResumableDraftPayload({
      ok: true,
      data: {
        id: "s1",
        status: "failed",
        buffer: "这是一段足够长的候选稿内容",
        error_message: "timeout",
      },
    })).toEqual({
      sessionId: "s1",
      status: "failed",
      buffer: "这是一段足够长的候选稿内容",
      errorMessage: "timeout",
    });
  });

  it("defaults unknown status to streaming and missing error to null", () => {
    expect(normalizeResumableDraftPayload({
      ok: true,
      data: { id: "s2", status: "weird", buffer: "这是一段足够长的候选稿内容" },
    })).toEqual({
      sessionId: "s2",
      status: "streaming",
      buffer: "这是一段足够长的候选稿内容",
      errorMessage: null,
    });
  });
});
