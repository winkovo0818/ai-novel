import { describe, it, expect } from "vitest";

import type { ChapterDraftView } from "@/app/(app)/editor/[novelId]/EditorClient";

import {
  resolveStartIndex,
  deriveChapterStateFromDraft,
  mergeChapterIntoList,
  applyAcceptMode,
} from "./chapterUtils";

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
