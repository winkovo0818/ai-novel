import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface HookRuntime {
  render<T>(hook: () => T): T;
  useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  useRef<T>(initial: T): { current: T };
  useState<T>(initial: T | (() => T)): readonly [T, (next: T | ((current: T) => T)) => void];
  cleanup(): void;
}

const reactRuntime = vi.hoisted(() => ({ current: undefined as HookRuntime | undefined }));
const confirmRuntime = vi.hoisted(() => ({
  current: async () => true,
}));

function currentRuntime(): HookRuntime {
  if (!reactRuntime.current) throw new Error("hook runtime not initialized");
  return reactRuntime.current;
}

vi.mock("react", () => ({
  useCallback: (fn: unknown) => fn,
  useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) =>
    currentRuntime().useEffect(effect, deps),
  useRef: <T,>(initial: T) => currentRuntime().useRef(initial),
  useState: <T,>(initial: T | (() => T)) => currentRuntime().useState(initial),
}));

vi.mock("@/components/ui/ConfirmDialog", () => ({
  useConfirm: () => confirmRuntime.current,
}));

import type { ChapterDraftView } from "./EditorClient";
import { CHAPTER_CONTENT_MAX_CHARS } from "@/lib/validation/schemas";
import { useChapterActions } from "./useChapterActions";
import { useChapterBeatSheet } from "./useChapterBeatSheet";
import { useChapterDrafting } from "./useChapterDrafting";
import { useChapterPersistence } from "./useChapterPersistence";
import { useChapterSelection } from "./useChapterSelection";
import { useChapterStateDiff } from "./useChapterStateDiff";
import { useChapterVersions } from "./useChapterVersions";

function createHookRuntime(): HookRuntime {
  const slots: unknown[] = [];
  const cleanups: Array<() => void> = [];
  let cursor = 0;

  const runtime: HookRuntime = {
    render<T>(hook: () => T): T {
      cursor = 0;
      reactRuntime.current = runtime;
      return hook();
    },
    useEffect(effect: () => void | (() => void), deps?: readonly unknown[]) {
      const index = cursor++;
      const previous = slots[index] as readonly unknown[] | undefined;
      if (deps && previous && deps.length === previous.length && deps.every((dep, i) => Object.is(dep, previous[i]))) {
        return;
      }
      slots[index] = deps;
      const cleanup = effect();
      if (typeof cleanup === "function") cleanups.push(cleanup);
    },
    useRef<T>(initial: T) {
      const index = cursor++;
      if (slots[index] === undefined) {
        slots[index] = { current: initial };
      }
      return slots[index] as { current: T };
    },
    useState<T>(initial: T | (() => T)) {
      const index = cursor++;
      if (slots[index] === undefined) {
        slots[index] = typeof initial === "function" ? (initial as () => T)() : initial;
      }
      const setState = (next: T | ((current: T) => T)) => {
        const current = slots[index] as T;
        slots[index] = typeof next === "function" ? (next as (current: T) => T)(current) : next;
      };
      return [slots[index] as T, setState] as const;
    },
    cleanup() {
      for (const cleanup of cleanups.splice(0)) cleanup();
    },
  };

  return runtime;
}

function chapter(overrides: Partial<ChapterDraftView> = {}): ChapterDraftView {
  return {
    id: "chapter-1",
    chapter_index: 1,
    title: "第一章",
    content: "旧正文",
    status: "draft",
    target_words: 1200,
    version: 1,
    updated_at: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

function okJson(data: unknown, init: { status?: number } = {}) {
  return {
    ok: init.status ? init.status >= 200 && init.status < 300 : true,
    status: init.status ?? 200,
    json: async () => data,
  };
}

function sseResponse(events: Array<{ event: string; data: unknown }>) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(
          encoder.encode(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`),
        );
      }
      controller.close();
    },
  });
  return {
    ok: true,
    status: 200,
    body,
  };
}

async function flushAsyncEffects() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("useChapterActions", () => {
  beforeEach(() => {
    reactRuntime.current = createHookRuntime();
    confirmRuntime.current = async () => true;
  });

  afterEach(() => {
    reactRuntime.current?.cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("deletes the saved chapter and resets editor state to the outline slot", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ ok: true, data: null }));
    vi.stubGlobal("fetch", fetchMock);
    let chapters = [chapter(), chapter({ id: "chapter-2", chapter_index: 2 })];
    const resetEditorState = vi.fn();
    const options = {
      novelId: "novel-1",
      selectedIndex: 1,
      chapterId: "chapter-1",
      chapterTitle: "第一章",
      selectedOutlineTitle: "开端",
      confirm: confirmRuntime.current,
      resetEditorState,
      setChapters: vi.fn((updater: (current: ChapterDraftView[]) => ChapterDraftView[]) => {
        chapters = updater(chapters);
      }),
      setStatus: vi.fn(),
      setMessage: vi.fn(),
    };

    const hook = currentRuntime().render(() => useChapterActions(options));
    await hook.deleteChapter();

    expect(fetchMock).toHaveBeenCalledWith("/api/chapters/chapter-1", { method: "DELETE" });
    expect(chapters).toHaveLength(1);
    expect(chapters[0].id).toBe("chapter-2");
    expect(resetEditorState).toHaveBeenCalledWith(
      expect.objectContaining({
        chapterId: undefined,
        title: "开端",
        content: "",
        status: "draft",
        targetWords: null,
        version: 0,
      }),
    );
    expect(options.setStatus).toHaveBeenCalledWith("idle");
    expect(options.setMessage).toHaveBeenCalledWith("章节已删除");
  });

  it("does not delete when the destructive confirmation is cancelled", async () => {
    confirmRuntime.current = async () => false;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const options = {
      novelId: "novel-1",
      selectedIndex: 1,
      chapterId: "chapter-1",
      chapterTitle: "第一章",
      selectedOutlineTitle: "开端",
      confirm: confirmRuntime.current,
      resetEditorState: vi.fn(),
      setChapters: vi.fn(),
      setStatus: vi.fn(),
      setMessage: vi.fn(),
    };

    const hook = currentRuntime().render(() => useChapterActions(options));
    await hook.deleteChapter();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(options.resetEditorState).not.toHaveBeenCalled();
  });

  it("runs the full-novel consistency check and stores the result", async () => {
    const result = {
      consistent: false,
      issues: [{ type: "timeline", chapter: 2, description: "时间线冲突" }],
    };
    const fetchMock = vi.fn().mockResolvedValue(okJson({ ok: true, data: result }));
    vi.stubGlobal("fetch", fetchMock);
    const options = {
      novelId: "novel-1",
      selectedIndex: 1,
      chapterId: "chapter-1",
      chapterTitle: "第一章",
      selectedOutlineTitle: "开端",
      confirm: confirmRuntime.current,
      resetEditorState: vi.fn(),
      setChapters: vi.fn(),
      setStatus: vi.fn(),
      setMessage: vi.fn(),
    };

    let hook = currentRuntime().render(() => useChapterActions(options));
    await hook.runConsistency();
    hook = currentRuntime().render(() => useChapterActions(options));

    expect(fetchMock).toHaveBeenCalledWith("/api/novels/novel-1/consistency", { method: "POST" });
    expect(hook.consistencyRunning).toBe(false);
    expect(hook.consistencyResult).toEqual(result);
    expect(hook.consistencyError).toBeUndefined();
  });

  it("surfaces consistency check failures without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        okJson({ ok: false, error: { message: "LLM 暂不可用" } }, { status: 500 }),
      ),
    );
    const options = {
      novelId: "novel-1",
      selectedIndex: 1,
      chapterId: "chapter-1",
      chapterTitle: "第一章",
      selectedOutlineTitle: "开端",
      confirm: confirmRuntime.current,
      resetEditorState: vi.fn(),
      setChapters: vi.fn(),
      setStatus: vi.fn(),
      setMessage: vi.fn(),
    };

    let hook = currentRuntime().render(() => useChapterActions(options));
    await hook.runConsistency();
    hook = currentRuntime().render(() => useChapterActions(options));

    expect(hook.consistencyRunning).toBe(false);
    expect(hook.consistencyResult).toBeUndefined();
    expect(hook.consistencyError).toBe("LLM 暂不可用");
  });
});

describe("useChapterSelection", () => {
  beforeEach(() => {
    reactRuntime.current = createHookRuntime();
    confirmRuntime.current = async () => true;
  });

  afterEach(() => {
    reactRuntime.current?.cleanup();
    vi.restoreAllMocks();
  });

  it("switches chapters by deriving state from the saved draft", async () => {
    const resetEditorState = vi.fn();
    const options = {
      chapters: [
        chapter(),
        chapter({
          id: "chapter-2",
          chapter_index: 2,
          title: "第二章",
          content: "第二章正文",
          status: "done" as const,
          target_words: 1800,
          version: 4,
        }),
      ],
      outlineChapters: [
        { index: 1, title: "开端" },
        { index: 2, title: "转折" },
      ],
      selectedIndex: 1,
      hasUnsavedChanges: false,
      candidateContent: "",
      confirm: confirmRuntime.current,
      clearCandidate: vi.fn(),
      resetEditorState,
      setSelectedIndex: vi.fn(),
      setConflictChapter: vi.fn(),
      setStatus: vi.fn(),
      setMessage: vi.fn(),
    };

    const hook = currentRuntime().render(() => useChapterSelection(options));
    await hook.selectChapter(2);

    expect(options.clearCandidate).toHaveBeenCalled();
    expect(options.setSelectedIndex).toHaveBeenCalledWith(2);
    expect(resetEditorState).toHaveBeenCalledWith(
      expect.objectContaining({
        chapterId: "chapter-2",
        title: "第二章",
        content: "第二章正文",
        status: "done",
        targetWords: 1800,
        version: 4,
      }),
    );
    expect(options.setConflictChapter).toHaveBeenCalledWith(null);
    expect(options.setStatus).toHaveBeenCalledWith("idle");
    expect(options.setMessage).toHaveBeenCalledWith(undefined);
  });

  it("keeps the current chapter when unsaved-change confirmation is cancelled", async () => {
    confirmRuntime.current = async () => false;
    const options = {
      chapters: [chapter(), chapter({ id: "chapter-2", chapter_index: 2 })],
      outlineChapters: [{ index: 1 }, { index: 2 }],
      selectedIndex: 1,
      hasUnsavedChanges: true,
      candidateContent: "",
      confirm: confirmRuntime.current,
      clearCandidate: vi.fn(),
      resetEditorState: vi.fn(),
      setSelectedIndex: vi.fn(),
      setConflictChapter: vi.fn(),
      setStatus: vi.fn(),
      setMessage: vi.fn(),
    };

    const hook = currentRuntime().render(() => useChapterSelection(options));
    await hook.selectChapter(2);

    expect(options.clearCandidate).not.toHaveBeenCalled();
    expect(options.resetEditorState).not.toHaveBeenCalled();
    expect(options.setSelectedIndex).not.toHaveBeenCalled();
  });

  it("keeps the current chapter when candidate discard confirmation is cancelled", async () => {
    const confirm = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const options = {
      chapters: [chapter(), chapter({ id: "chapter-2", chapter_index: 2 })],
      outlineChapters: [{ index: 1 }, { index: 2 }],
      selectedIndex: 1,
      hasUnsavedChanges: true,
      candidateContent: "待处理候选稿",
      confirm,
      clearCandidate: vi.fn(),
      resetEditorState: vi.fn(),
      setSelectedIndex: vi.fn(),
      setConflictChapter: vi.fn(),
      setStatus: vi.fn(),
      setMessage: vi.fn(),
    };

    const hook = currentRuntime().render(() => useChapterSelection(options));
    await hook.selectChapter(2);

    expect(confirm).toHaveBeenCalledTimes(2);
    expect(options.clearCandidate).not.toHaveBeenCalled();
    expect(options.resetEditorState).not.toHaveBeenCalled();
    expect(options.setSelectedIndex).not.toHaveBeenCalled();
  });
});

describe("useChapterPersistence", () => {
  beforeEach(() => {
    reactRuntime.current = createHookRuntime();
  });

  afterEach(() => {
    reactRuntime.current?.cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("saves the current chapter and syncs local editor state", async () => {
    const saved = chapter({
      content: "新正文",
      title: "新标题",
      status: "done",
      target_words: 1600,
      version: 3,
      updated_at: "2026-05-02T00:00:00.000Z",
    });
    const fetchMock = vi.fn().mockResolvedValue(okJson({ ok: true, data: saved }));
    vi.stubGlobal("fetch", fetchMock);

    let chapters = [chapter()];
    const setChapters = vi.fn((updater: (current: ChapterDraftView[]) => ChapterDraftView[]) => {
      chapters = updater(chapters);
    });
    const setters = {
      setChapterId: vi.fn(),
      setSavedTitle: vi.fn(),
      setSavedContent: vi.fn(),
      setSavedStatus: vi.fn(),
      setTargetWordsState: vi.fn(),
      setLastSavedAt: vi.fn(),
      setStatus: vi.fn(),
      setMessage: vi.fn(),
      setChapterVersion: vi.fn(),
      setConflictChapter: vi.fn(),
      setChapters,
      setPendingStateDiff: vi.fn(),
      setPendingStateDiffChapterIndex: vi.fn(),
      setAutoStateDiffError: vi.fn(),
    };

    const hook = currentRuntime().render(() =>
      useChapterPersistence({
        state: {
          chapterId: "chapter-1",
          novelId: "novel-1",
          selectedIndex: 1,
          chapterTitle: "新标题",
          content: "新正文",
          chapterStatus: "done",
          savedStatus: "done",
          chapterVersion: 2,
          targetWords: 1200,
          hasUnsavedChanges: false,
          status: "idle",
        },
        setters,
      }),
    );

    await hook.saveChapter();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chapters/chapter-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          title: "新标题",
          content: "新正文",
          status: "done",
          source: "manual",
          expected_version: 2,
        }),
      }),
    );
    expect(setters.setSavedTitle).toHaveBeenCalledWith("新标题");
    expect(setters.setSavedContent).toHaveBeenCalledWith("新正文");
    expect(setters.setSavedStatus).toHaveBeenCalledWith("done");
    expect(setters.setChapterVersion).toHaveBeenCalledWith(3);
    expect(setters.setTargetWordsState).toHaveBeenCalledWith(1600);
    expect(setters.setStatus).toHaveBeenLastCalledWith("saved");
    expect(setters.setMessage).toHaveBeenLastCalledWith("草稿已保存");
    expect(chapters[0]).toMatchObject({ content: "新正文", version: 3 });
  });

  it("stores the latest server chapter when optimistic locking conflicts", async () => {
    const latest = chapter({ content: "其他窗口的正文", version: 9 });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        okJson(
          {
            ok: false,
            error: { code: "CHAPTER_VERSION_CONFLICT", message: "章节已被另一处修改" },
            data: latest,
          },
          { status: 409 },
        ),
      ),
    );
    const setters = {
      setChapterId: vi.fn(),
      setSavedTitle: vi.fn(),
      setSavedContent: vi.fn(),
      setSavedStatus: vi.fn(),
      setTargetWordsState: vi.fn(),
      setLastSavedAt: vi.fn(),
      setStatus: vi.fn(),
      setMessage: vi.fn(),
      setChapterVersion: vi.fn(),
      setConflictChapter: vi.fn(),
      setChapters: vi.fn(),
      setPendingStateDiff: vi.fn(),
      setPendingStateDiffChapterIndex: vi.fn(),
      setAutoStateDiffError: vi.fn(),
    };

    const hook = currentRuntime().render(() =>
      useChapterPersistence({
        state: {
          chapterId: "chapter-1",
          novelId: "novel-1",
          selectedIndex: 1,
          chapterTitle: "本地标题",
          content: "本地正文",
          chapterStatus: "draft",
          savedStatus: "draft",
          chapterVersion: 1,
          targetWords: null,
          hasUnsavedChanges: false,
          status: "idle",
        },
        setters,
      }),
    );

    await expect(hook.persistChapter("本地正文")).rejects.toMatchObject({
      name: "ChapterVersionConflict",
      message: "章节已被另一处修改",
    });
    expect(setters.setConflictChapter).toHaveBeenCalledWith(latest);
  });

  it("blocks manual saves that exceed the chapter content cap before fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const setters = {
      setChapterId: vi.fn(),
      setSavedTitle: vi.fn(),
      setSavedContent: vi.fn(),
      setSavedStatus: vi.fn(),
      setTargetWordsState: vi.fn(),
      setLastSavedAt: vi.fn(),
      setStatus: vi.fn(),
      setMessage: vi.fn(),
      setChapterVersion: vi.fn(),
      setConflictChapter: vi.fn(),
      setChapters: vi.fn(),
      setPendingStateDiff: vi.fn(),
      setPendingStateDiffChapterIndex: vi.fn(),
      setAutoStateDiffError: vi.fn(),
    };

    const hook = currentRuntime().render(() =>
      useChapterPersistence({
        state: {
          chapterId: "chapter-1",
          novelId: "novel-1",
          selectedIndex: 1,
          chapterTitle: "本地标题",
          content: "x".repeat(CHAPTER_CONTENT_MAX_CHARS + 1),
          chapterStatus: "draft",
          savedStatus: "draft",
          chapterVersion: 1,
          targetWords: null,
          hasUnsavedChanges: false,
          status: "idle",
        },
        setters,
      }),
    );

    await hook.saveChapter();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(setters.setStatus).toHaveBeenLastCalledWith("error");
    expect(setters.setMessage).toHaveBeenLastCalledWith(expect.stringContaining("已超过本章上限 80,000 字"));
    expect(setters.setSavedContent).not.toHaveBeenCalled();
  });
});

describe("useChapterVersions", () => {
  beforeEach(() => {
    reactRuntime.current = createHookRuntime();
  });

  afterEach(() => {
    reactRuntime.current?.cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads chapter versions into hook state", async () => {
    const version = {
      id: "version-1",
      chapter_id: "chapter-1",
      title: "第一章",
      content: "历史正文",
      status: "draft",
      source: "manual",
      created_at: "2026-05-01T00:00:00.000Z",
    };
    const fetchMock = vi.fn().mockResolvedValue(okJson({ ok: true, data: [version] }));
    vi.stubGlobal("fetch", fetchMock);

    const options = {
      chapterId: "chapter-1",
      conflictChapter: null,
      resetEditorState: vi.fn(),
      setChapters: vi.fn(),
      setConflictChapter: vi.fn(),
      setStatus: vi.fn(),
      setMessage: vi.fn(),
      setChapterVersion: vi.fn(),
    };

    let hook = currentRuntime().render(() => useChapterVersions(options));
    await hook.openVersions();
    hook = currentRuntime().render(() => useChapterVersions(options));

    expect(fetchMock).toHaveBeenCalledWith("/api/chapters/chapter-1/versions");
    expect(hook.versionsOpen).toBe(true);
    expect(hook.versionsLoading).toBe(false);
    expect(hook.versions).toEqual([version]);
    expect(hook.versionsError).toBeUndefined();
  });

  it("restores matching chapters and patches the chapter list", () => {
    const restored = chapter({ content: "恢复正文", version: 5 });
    let chapters = [chapter()];
    const options = {
      chapterId: "chapter-1",
      conflictChapter: null,
      resetEditorState: vi.fn(),
      setChapters: vi.fn((updater: (current: ChapterDraftView[]) => ChapterDraftView[]) => {
        chapters = updater(chapters);
      }),
      setConflictChapter: vi.fn(),
      setStatus: vi.fn(),
      setMessage: vi.fn(),
      setChapterVersion: vi.fn(),
    };

    const hook = currentRuntime().render(() => useChapterVersions(options));
    hook.applyRestoredChapter(restored);

    expect(options.resetEditorState).toHaveBeenCalledWith(
      expect.objectContaining({ content: "恢复正文", version: 5 }),
    );
    expect(chapters[0]).toMatchObject({ content: "恢复正文", version: 5 });
    expect(options.setConflictChapter).toHaveBeenCalledWith(null);
    expect(options.setStatus).toHaveBeenCalledWith("saved");
    expect(options.setMessage).toHaveBeenCalledWith("已恢复历史版本");
  });

  it("keeps local conflict content by advancing to the latest server version", () => {
    const latest = chapter({ version: 11 });
    const options = {
      chapterId: "chapter-1",
      conflictChapter: latest,
      resetEditorState: vi.fn(),
      setChapters: vi.fn(),
      setConflictChapter: vi.fn(),
      setStatus: vi.fn(),
      setMessage: vi.fn(),
      setChapterVersion: vi.fn(),
    };

    const hook = currentRuntime().render(() => useChapterVersions(options));
    hook.dismissConflict();

    expect(options.setChapterVersion).toHaveBeenCalledWith(11);
    expect(options.setConflictChapter).toHaveBeenCalledWith(null);
  });
});

describe("useChapterDrafting", () => {
  beforeEach(() => {
    reactRuntime.current = createHookRuntime();
    confirmRuntime.current = async () => true;
  });

  afterEach(() => {
    reactRuntime.current?.cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("streams draft SSE events into candidate and retrieval state", async () => {
    const memories = [{ source: "summary", reason: "相关前文", score: 0.9, text: "旧线索" }];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okJson({ ok: false }, { status: 404 }))
      .mockResolvedValueOnce(
        sseResponse([
          { event: "session", data: { sessionId: "draft-session-1" } },
          { event: "retrieval", data: { status: "ok", memories } },
          { event: "chapter_delta", data: { delta: "第一段" } },
          { event: "chapter_delta", data: { delta: "第二段" } },
          { event: "done", data: { retrieval_status: "ok" } },
        ]),
      )
      .mockResolvedValueOnce(okJson({ ok: true, data: { issues: [] } }));
    vi.stubGlobal("fetch", fetchMock);

    const setStatus = vi.fn();
    const setMessage = vi.fn();
    const hookOptions = {
      novelId: "novel-1",
      selectedIndex: 1,
      chapterId: "chapter-1",
      chapterTitle: "第一章",
      content: "已有正文",
      chapterStatus: "draft" as const,
      persistChapter: vi.fn(),
      setContent: vi.fn(),
      setStatus,
      setMessage,
    };

    let hook = currentRuntime().render(() => useChapterDrafting(hookOptions));
    await flushAsyncEffects();
    await hook.draftChapter();
    hook = currentRuntime().render(() => useChapterDrafting(hookOptions));

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/novels/novel-1/chapters/draft",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          chapter_index: 1,
          title: "第一章",
          existing_content: "已有正文",
        }),
      }),
    );
    expect(hook.candidateOpen).toBe(true);
    expect(hook.candidateStreaming).toBe(false);
    expect(hook.candidateContent).toBe("第一段第二段");
    expect(hook.draftSessionId).toBe("draft-session-1");
    expect(hook.lastRetrievalStatus).toBe("ok");
    expect(hook.lastRetrievedMemories).toEqual(memories);
    expect(setStatus).toHaveBeenLastCalledWith("idle");
    expect(setMessage).toHaveBeenLastCalledWith("候选稿就绪，请选择处理方式");
  });

  it("accepts an appended candidate by snapshotting current text, saving AI text, and clearing resume state", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        okJson({
          ok: true,
          data: {
            id: "resume-1",
            status: "completed",
            buffer: "这是一个足够长的候选稿",
            error_message: null,
          },
        }),
      )
      .mockResolvedValue(okJson({ ok: true, data: { issues: [] } }));
    vi.stubGlobal("fetch", fetchMock);

    const persistChapter = vi.fn().mockResolvedValue(chapter());
    const setContent = vi.fn();
    const setStatus = vi.fn();
    const setMessage = vi.fn();
    const hookOptions = {
      novelId: "novel-1",
      selectedIndex: 1,
      chapterId: "chapter-1",
      chapterTitle: "第一章",
      content: "已有正文",
      chapterStatus: "draft" as const,
      persistChapter,
      setContent,
      setStatus,
      setMessage,
    };

    let hook = currentRuntime().render(() => useChapterDrafting(hookOptions));
    await flushAsyncEffects();
    hook = currentRuntime().render(() => useChapterDrafting(hookOptions));
    hook.applyResumableDraft();
    hook = currentRuntime().render(() => useChapterDrafting(hookOptions));

    await hook.acceptCandidate("append");
    hook = currentRuntime().render(() => useChapterDrafting(hookOptions));

    expect(persistChapter).toHaveBeenNthCalledWith(1, "已有正文", "第一章", "draft", "manual");
    expect(persistChapter).toHaveBeenNthCalledWith(
      2,
      "已有正文\n\n这是一个足够长的候选稿",
      "第一章",
      "draft",
      "ai",
    );
    expect(setContent).toHaveBeenCalledWith("已有正文\n\n这是一个足够长的候选稿");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/novels/novel-1/chapters/draft/resume?chapter_index=1",
      { method: "DELETE" },
    );
    expect(setStatus).toHaveBeenLastCalledWith("saved");
    expect(setMessage).toHaveBeenLastCalledWith("候选稿已追加到末尾");
    expect(hook.candidateContent).toBe("");
    expect(hook.candidateOpen).toBe(false);
    expect(hook.draftSessionId).toBeNull();
  });

  it("discards candidates without saving and dismisses the resumable session", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        okJson({
          ok: true,
          data: {
            id: "resume-1",
            status: "completed",
            buffer: "这是一个足够长的候选稿",
            error_message: null,
          },
        }),
      )
      .mockResolvedValue(okJson({ ok: true, data: { issues: [] } }));
    vi.stubGlobal("fetch", fetchMock);

    const persistChapter = vi.fn().mockResolvedValue(chapter());
    const setStatus = vi.fn();
    const setMessage = vi.fn();
    const hookOptions = {
      novelId: "novel-1",
      selectedIndex: 1,
      chapterId: "chapter-1",
      chapterTitle: "第一章",
      content: "已有正文",
      chapterStatus: "draft" as const,
      persistChapter,
      setContent: vi.fn(),
      setStatus,
      setMessage,
    };

    let hook = currentRuntime().render(() => useChapterDrafting(hookOptions));
    await flushAsyncEffects();
    hook = currentRuntime().render(() => useChapterDrafting(hookOptions));
    hook.applyResumableDraft();
    hook = currentRuntime().render(() => useChapterDrafting(hookOptions));

    await hook.acceptCandidate("discard");
    hook = currentRuntime().render(() => useChapterDrafting(hookOptions));

    expect(persistChapter).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/novels/novel-1/chapters/draft/resume?chapter_index=1",
      { method: "DELETE" },
    );
    expect(setStatus).toHaveBeenLastCalledWith("idle");
    expect(setMessage).toHaveBeenLastCalledWith("候选稿已丢弃，正文未改动");
    expect(hook.candidateContent).toBe("");
    expect(hook.candidateOpen).toBe(false);
    expect(hook.draftSessionId).toBeNull();
  });

  it("P1-6: persists critic failure beyond panel close and clears it on discard", async () => {
    const resumePayload = okJson({
      ok: true,
      data: {
        id: "resume-1",
        status: "completed",
        buffer: "一段长度足够的候选稿正文",
        error_message: null,
      },
    });
    const criticFailPayload = okJson({ ok: false, error: { message: "LLM 超时" } });
    // Route by URL so useEffect re-fires don't consume the critic mock and
    // skew the response order.
    const fetchMock = vi.fn(async (url: string | URL) => {
      const path = typeof url === "string" ? url : url.toString();
      if (path.includes("/draft/resume")) return resumePayload;
      if (path.includes("/chapters/critic")) return criticFailPayload;
      return okJson({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const hookOptions = {
      novelId: "novel-1",
      selectedIndex: 4,
      chapterId: "chapter-4",
      chapterTitle: "第四章",
      content: "当前正文",
      chapterStatus: "draft" as const,
      persistChapter: vi.fn().mockResolvedValue(chapter()),
      setContent: vi.fn(),
      setStatus: vi.fn(),
      setMessage: vi.fn(),
    };

    let hook = currentRuntime().render(() => useChapterDrafting(hookOptions));
    await flushAsyncEffects();
    hook = currentRuntime().render(() => useChapterDrafting(hookOptions));
    hook.applyResumableDraft();
    // Drain critic fetch microtasks (fetch -> json -> catch -> setState).
    await flushAsyncEffects();
    await flushAsyncEffects();
    hook = currentRuntime().render(() => useChapterDrafting(hookOptions));

    // Critic failed — in-panel error AND persistent failure must both be set.
    expect(hook.candidateCriticError).toBe("LLM 超时");
    expect(hook.criticFailure).toEqual({ message: "LLM 超时", chapterIndex: 4 });

    // Discard the candidate — persistent failure is no longer relevant.
    await hook.acceptCandidate("discard");
    hook = currentRuntime().render(() => useChapterDrafting(hookOptions));
    expect(hook.criticFailure).toBeNull();
  });

  it("P1-6: retryLastCritic success clears the persistent failure and surfaces a status message", async () => {
    const resumePayload = okJson({
      ok: true,
      data: {
        id: "resume-1",
        status: "completed",
        buffer: "一段长度足够的候选稿正文",
        error_message: null,
      },
    });
    let criticCalls = 0;
    const fetchMock = vi.fn(async (url: string | URL) => {
      const path = typeof url === "string" ? url : url.toString();
      if (path.includes("/draft/resume")) return resumePayload;
      if (path.includes("/chapters/critic")) {
        criticCalls += 1;
        return criticCalls === 1
          ? okJson({ ok: false, error: { message: "首次失败" } })
          : okJson({ ok: true, data: { consistent: true, issues: [] } });
      }
      return okJson({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const setMessage = vi.fn();
    const hookOptions = {
      novelId: "novel-1",
      selectedIndex: 2,
      chapterId: "chapter-2",
      chapterTitle: "第二章",
      content: "当前正文",
      chapterStatus: "draft" as const,
      persistChapter: vi.fn(),
      setContent: vi.fn(),
      setStatus: vi.fn(),
      setMessage,
    };

    let hook = currentRuntime().render(() => useChapterDrafting(hookOptions));
    await flushAsyncEffects();
    hook = currentRuntime().render(() => useChapterDrafting(hookOptions));
    hook.applyResumableDraft();
    await flushAsyncEffects();
    await flushAsyncEffects();
    hook = currentRuntime().render(() => useChapterDrafting(hookOptions));
    expect(hook.criticFailure?.message).toBe("首次失败");

    await hook.retryLastCritic();
    hook = currentRuntime().render(() => useChapterDrafting(hookOptions));
    expect(hook.criticFailure).toBeNull();
    expect(setMessage).toHaveBeenLastCalledWith("审校通过");
    expect(criticCalls).toBe(2);

    // The retry hit the critic endpoint with current chapter content.
    const criticCallBodies = (fetchMock.mock.calls as unknown as Array<[string, RequestInit | undefined]>)
      .filter((c) => typeof c[0] === "string" && c[0].includes("/chapters/critic"))
      .map((c) => c[1]?.body);
    expect(criticCallBodies[1]).toBe(
      JSON.stringify({ chapter_index: 2, content: "当前正文" }),
    );
  });

  it("P1-6: retryLastCritic finding issues clears failure and reports issue count with blocking breakdown", async () => {
    const resumePayload = okJson({
      ok: true,
      data: {
        id: "resume-1",
        status: "completed",
        buffer: "一段长度足够的候选稿正文",
        error_message: null,
      },
    });
    let criticCalls = 0;
    const fetchMock = vi.fn(async (url: string | URL) => {
      const path = typeof url === "string" ? url : url.toString();
      if (path.includes("/draft/resume")) return resumePayload;
      if (path.includes("/chapters/critic")) {
        criticCalls += 1;
        return criticCalls === 1
          ? okJson({ ok: false, error: { message: "失败" } })
          : okJson({
              ok: true,
              data: {
                consistent: false,
                issues: [
                  { type: "character", severity: "major", description: "x" },
                  { type: "tone", severity: "minor", description: "y" },
                  { type: "world_rule", severity: "critical", description: "z" },
                ],
              },
            });
      }
      return okJson({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const setMessage = vi.fn();
    const hookOptions = {
      novelId: "novel-1",
      selectedIndex: 3,
      chapterId: "chapter-3",
      chapterTitle: "第三章",
      content: "当前正文",
      chapterStatus: "draft" as const,
      persistChapter: vi.fn(),
      setContent: vi.fn(),
      setStatus: vi.fn(),
      setMessage,
    };

    let hook = currentRuntime().render(() => useChapterDrafting(hookOptions));
    await flushAsyncEffects();
    hook = currentRuntime().render(() => useChapterDrafting(hookOptions));
    hook.applyResumableDraft();
    await flushAsyncEffects();
    await flushAsyncEffects();
    hook = currentRuntime().render(() => useChapterDrafting(hookOptions));

    await hook.retryLastCritic();
    hook = currentRuntime().render(() => useChapterDrafting(hookOptions));
    expect(hook.criticFailure).toBeNull();
    expect(setMessage).toHaveBeenLastCalledWith("审校发现 3 条问题（critical/major: 2）");
  });

  it("P1-6: retryLastCritic failure updates the persistent failure with the new message", async () => {
    const resumePayload = okJson({
      ok: true,
      data: {
        id: "resume-1",
        status: "completed",
        buffer: "一段长度足够的候选稿正文",
        error_message: null,
      },
    });
    let criticCalls = 0;
    const fetchMock = vi.fn(async (url: string | URL) => {
      const path = typeof url === "string" ? url : url.toString();
      if (path.includes("/draft/resume")) return resumePayload;
      if (path.includes("/chapters/critic")) {
        criticCalls += 1;
        return criticCalls === 1
          ? okJson({ ok: false, error: { message: "首次失败" } })
          : okJson({ ok: false, error: { message: "再次失败" } });
      }
      return okJson({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const hookOptions = {
      novelId: "novel-1",
      selectedIndex: 5,
      chapterId: "chapter-5",
      chapterTitle: "第五章",
      content: "当前正文",
      chapterStatus: "draft" as const,
      persistChapter: vi.fn(),
      setContent: vi.fn(),
      setStatus: vi.fn(),
      setMessage: vi.fn(),
    };

    let hook = currentRuntime().render(() => useChapterDrafting(hookOptions));
    await flushAsyncEffects();
    hook = currentRuntime().render(() => useChapterDrafting(hookOptions));
    hook.applyResumableDraft();
    await flushAsyncEffects();
    await flushAsyncEffects();
    hook = currentRuntime().render(() => useChapterDrafting(hookOptions));
    expect(hook.criticFailure?.message).toBe("首次失败");

    await hook.retryLastCritic();
    hook = currentRuntime().render(() => useChapterDrafting(hookOptions));
    expect(hook.criticFailure).toEqual({ message: "再次失败", chapterIndex: 5 });
  });
});

describe("useChapterStateDiff", () => {
  beforeEach(() => {
    reactRuntime.current = createHookRuntime();
  });

  afterEach(() => {
    reactRuntime.current?.cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads a manual state diff into the panel", async () => {
    const diff = {
      character_updates: [],
      timeline_events: [{ event: "主角离城", chapter_index: 2 }],
      plot_thread_updates: [],
      new_entities: [],
    };
    const fetchMock = vi.fn().mockResolvedValue(okJson({ ok: true, data: diff }));
    vi.stubGlobal("fetch", fetchMock);

    let hook = currentRuntime().render(() => useChapterStateDiff({ chapterId: "chapter-1" }));
    await hook.generateStateDiff();
    hook = currentRuntime().render(() => useChapterStateDiff({ chapterId: "chapter-1" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/chapters/chapter-1/state-diff", { method: "POST" });
    expect(hook.stateDiffOpen).toBe(true);
    expect(hook.stateDiffLoading).toBe(false);
    expect(hook.stateDiff).toEqual(diff);
    expect(hook.stateDiffError).toBeUndefined();
  });

  it("opens pending auto-generated state diff and clears the pending badge", () => {
    const diff = {
      character_updates: [{ name: "主角", changes: { arc: "成长" }, confidence: "high" as const }],
      timeline_events: [],
      plot_thread_updates: [],
      new_entities: [],
    };

    let hook = currentRuntime().render(() => useChapterStateDiff({ chapterId: "chapter-1" }));
    hook.setPendingStateDiff(diff);
    hook.setPendingStateDiffChapterIndex(3);
    hook = currentRuntime().render(() => useChapterStateDiff({ chapterId: "chapter-1" }));
    hook.openPendingStateDiff();
    hook = currentRuntime().render(() => useChapterStateDiff({ chapterId: "chapter-1" }));

    expect(hook.stateDiffOpen).toBe(true);
    expect(hook.stateDiff).toEqual(diff);
    expect(hook.pendingStateDiff).toBeNull();
    expect(hook.pendingStateDiffChapterIndex).toBe(3);
  });
});

describe("useChapterBeatSheet", () => {
  beforeEach(() => {
    reactRuntime.current = createHookRuntime();
  });

  afterEach(() => {
    reactRuntime.current?.cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("refuses to generate beats for chapter one", async () => {
    let hook = currentRuntime().render(() =>
      useChapterBeatSheet({
        novelId: "novel-1",
        selectedIndex: 1,
        chapterTitle: "第一章",
        draftChapter: vi.fn(),
      }),
    );
    await hook.generateBeatSheet();
    hook = currentRuntime().render(() =>
      useChapterBeatSheet({
        novelId: "novel-1",
        selectedIndex: 1,
        chapterTitle: "第一章",
        draftChapter: vi.fn(),
      }),
    );

    expect(hook.beatsError).toBe("第 1 章节拍由 Bible 提供，无需另行生成");
  });

  it("loads generated beats and forwards them into draftChapter", async () => {
    const beats = [
      { id: "b1", summary: "发现线索", purpose: "推进主线", tension: "中" },
      { id: "b2", summary: "作出选择", purpose: "塑造人物", tension: "高" },
    ];
    const fetchMock = vi.fn().mockResolvedValue(okJson({ ok: true, data: { beats } }));
    vi.stubGlobal("fetch", fetchMock);
    const draftChapter = vi.fn().mockResolvedValue(undefined);
    const options = {
      novelId: "novel-1",
      selectedIndex: 2,
      chapterTitle: "第二章",
      draftChapter,
    };

    let hook = currentRuntime().render(() => useChapterBeatSheet(options));
    await hook.generateBeatSheet("进入新城市");
    hook = currentRuntime().render(() => useChapterBeatSheet(options));
    await hook.draftWithBeats();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/novels/novel-1/chapters/outline",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          chapter_index: 2,
          chapter_title: "第二章",
          chapter_goal: "进入新城市",
        }),
      }),
    );
    expect(hook.beats).toEqual(beats);
    expect(hook.beatsLoading).toBe(false);
    expect(hook.beatsError).toBeUndefined();
    expect(draftChapter).toHaveBeenCalledWith(beats);
  });
});
