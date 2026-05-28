import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BibleDraft } from "@/lib/validation/schemas";
import type { ChapterDraftView } from "./EditorClient";

interface TestElement {
  type: string;
  props: Record<string, unknown>;
}

interface HookRuntime {
  render<T>(component: () => T): T;
  useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  useMemo<T>(factory: () => T, deps?: readonly unknown[]): T;
  useState<T>(initial: T | (() => T)): readonly [T, (next: T | ((current: T) => T)) => void];
  cleanup(): void;
}

interface KeyEvent {
  ctrlKey?: boolean;
  metaKey?: boolean;
  key: string;
  preventDefault(): void;
}

interface ChangeEvent {
  target: {
    value: string;
    selectionStart: number;
    selectionEnd: number;
  };
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const runtimeRef = vi.hoisted(() => ({ current: undefined as HookRuntime | undefined }));
const editorRef = vi.hoisted(() => ({ current: undefined as Record<string, unknown> | undefined }));
const elements = vi.hoisted(() => {
  function childrenArray(children: unknown): unknown[] {
    if (children === undefined) return [];
    return Array.isArray(children) ? children : [children];
  }

  function create(type: unknown, props?: Record<string, unknown>, ...children: unknown[]): unknown {
    const mergedProps = props ?? {};
    const mergedChildren = children.length > 0 ? children : childrenArray(mergedProps.children);
    if (typeof type === "function") {
      return (type as (props: Record<string, unknown>) => unknown)({
        ...mergedProps,
        children: mergedChildren,
      });
    }
    return {
      type: String(type),
      props: {
        ...mergedProps,
        children: mergedChildren,
      },
    };
  }

  function marker(type: string, props: Record<string, unknown>): TestElement {
    return { type, props };
  }

  return { create, marker };
});

function currentRuntime(): HookRuntime {
  if (!runtimeRef.current) throw new Error("runtime not initialized");
  return runtimeRef.current;
}

function currentEditor(): Record<string, unknown> {
  if (!editorRef.current) throw new Error("editor not initialized");
  return editorRef.current;
}

vi.mock("react", () => ({
  default: {},
  useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) =>
    currentRuntime().useEffect(effect, deps),
  useMemo: <T,>(factory: () => T, deps?: readonly unknown[]) =>
    currentRuntime().useMemo(factory, deps),
  useState: <T,>(initial: T | (() => T)) => currentRuntime().useState(initial),
}));

vi.mock("react/jsx-runtime", () => ({
  Fragment: "Fragment",
  jsx: elements.create,
  jsxs: elements.create,
}));

vi.mock("react/jsx-dev-runtime", () => ({
  Fragment: "Fragment",
  jsxDEV: elements.create,
}));

vi.mock("next/link", () => ({
  default: (props: Record<string, unknown>) => elements.create("a", props),
}));

vi.mock("./useChapterEditor", () => ({
  useChapterEditor: () => currentEditor(),
}));

vi.mock("./EditorSidebar", () => ({
  EditorSidebar: (props: Record<string, unknown>) => elements.marker("EditorSidebar", props),
}));

vi.mock("./EditorToolbar", () => ({
  EditorToolbar: (props: Record<string, unknown>) => elements.marker("EditorToolbar", props),
}));

vi.mock("./AIPanel", () => ({
  AIPanel: (props: Record<string, unknown>) => elements.marker("AIPanel", props),
}));

vi.mock("./VersionsModal", () => ({
  VersionsModal: (props: Record<string, unknown>) => elements.marker("VersionsModal", props),
}));

vi.mock("./StateDiffPanel", () => ({
  StateDiffPanel: (props: Record<string, unknown>) => elements.marker("StateDiffPanel", props),
}));

vi.mock("./CandidatePanel", () => ({
  CandidatePanel: (props: Record<string, unknown>) => elements.marker("CandidatePanel", props),
}));

vi.mock("./JobsBadge", () => ({
  JobsBadge: (props: Record<string, unknown>) => elements.marker("JobsBadge", props),
}));

vi.mock("@/components/ui/StatusTag", () => ({
  StatusTag: (props: Record<string, unknown>) => elements.marker("StatusTag", props),
}));

vi.mock("@/lib/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => true,
}));

import { EditorClient } from "./EditorClient";
import { ExportMenu } from "./ExportMenu";

function createHookRuntime(): HookRuntime {
  const slots: unknown[] = [];
  const cleanups: Array<() => void> = [];
  let cursor = 0;

  const runtime: HookRuntime = {
    render<T>(component: () => T): T {
      cursor = 0;
      runtimeRef.current = runtime;
      return component();
    },
    useEffect(effect: () => void | (() => void), deps?: readonly unknown[]) {
      const index = cursor;
      cursor += 1;
      const previous = slots[index] as readonly unknown[] | undefined;
      if (deps && previous && deps.length === previous.length && deps.every((dep, i) => Object.is(dep, previous[i]))) {
        return;
      }
      slots[index] = deps;
      const cleanup = effect();
      if (typeof cleanup === "function") cleanups.push(cleanup);
    },
    useMemo<T>(factory: () => T, deps?: readonly unknown[]): T {
      const index = cursor;
      cursor += 1;
      const previous = slots[index] as { deps?: readonly unknown[]; value: T } | undefined;
      if (deps && previous?.deps && deps.length === previous.deps.length && deps.every((dep, i) => Object.is(dep, previous.deps?.[i]))) {
        return previous.value;
      }
      const value = factory();
      slots[index] = { deps, value };
      return value;
    },
    useState<T>(initial: T | (() => T)) {
      const index = cursor;
      cursor += 1;
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

function isElement(value: unknown): value is TestElement {
  return value !== null && typeof value === "object" && "type" in value && "props" in value;
}

function childNodes(value: unknown): unknown[] {
  if (!isElement(value)) return [];
  const children = value.props.children;
  return Array.isArray(children) ? children : children === undefined ? [] : [children];
}

function findByType(root: unknown, type: string): TestElement {
  if (isElement(root) && root.type === type) return root;
  for (const child of childNodes(root)) {
    try {
      return findByType(child, type);
    } catch {
      // Keep scanning siblings.
    }
  }
  throw new Error(`element not found: ${type}`);
}

function findByProp(root: unknown, prop: string, value: unknown): TestElement {
  if (isElement(root) && Object.is(root.props[prop], value)) return root;
  for (const child of childNodes(root)) {
    try {
      return findByProp(child, prop, value);
    } catch {
      // Keep scanning siblings.
    }
  }
  throw new Error(`element not found: ${prop}=${String(value)}`);
}

function textContent(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(textContent).join("");
  if (!isElement(value)) return "";
  return textContent(value.props.children);
}

function findButtonByText(root: unknown, text: string): TestElement {
  if (isElement(root) && root.type === "button" && textContent(root) === text) return root;
  for (const child of childNodes(root)) {
    try {
      return findButtonByText(child, text);
    } catch {
      // Keep scanning siblings.
    }
  }
  throw new Error(`button not found: ${text}`);
}

function makeStorage(initial: Record<string, string> = {}): StorageLike {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

function editor(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    autoStateDiffError: null,
    acceptCandidate: vi.fn(),
    applyResumableDraft: vi.fn(),
    applyRestoredChapter: vi.fn(),
    beats: [],
    beatsError: undefined,
    beatsLoading: false,
    candidateContent: "",
    candidateCriticError: undefined,
    candidateCriticLoading: false,
    candidateCriticResult: undefined,
    candidateOpen: false,
    candidateStreaming: false,
    chapterId: "chapter-1",
    chapterStatus: "draft",
    chapterTitle: "第一章",
    characterCount: 2,
    chapters: [chapter()],
    clearBeats: vi.fn(),
    closeStateDiff: vi.fn(),
    closeVersions: vi.fn(),
    conflictChapter: null,
    consistencyError: undefined,
    consistencyResult: undefined,
    consistencyRunning: false,
    content: "正文",
    deleteChapter: vi.fn(),
    dismissAutoStateDiffError: vi.fn(),
    dismissConflict: vi.fn(),
    dismissResumableDraft: vi.fn(),
    draftChapter: vi.fn(),
    draftWithBeats: vi.fn(),
    generateBeatSheet: vi.fn(),
    generateStateDiff: vi.fn(),
    hasUnsavedChanges: false,
    lastRetrievalError: undefined,
    lastRetrievalStatus: undefined,
    lastRetrievedMemories: [],
    lastSavedAt: "2026-05-01T00:00:00.000Z",
    localRevisionError: undefined,
    localRevisionLoading: false,
    loadLatestChapter: vi.fn(),
    message: undefined,
    openPendingStateDiff: vi.fn(),
    openVersions: vi.fn(),
    pendingStateDiff: null,
    pendingStateDiffChapterIndex: null,
    resumableDraft: null,
    runConsistency: vi.fn(),
    saveOfflineDraft: vi.fn(),
    saveChapter: vi.fn(),
    selectedDraft: chapter(),
    selectedIndex: 1,
    selectedOutline: { index: 1, title: "第一章", summary: "第一章摘要" },
    selectChapter: vi.fn(),
    reviseSelection: vi.fn(),
    setBeats: vi.fn(),
    setChapterStatus: vi.fn(),
    setChapterTitle: vi.fn(),
    setContent: vi.fn(),
    setEditorSelection: vi.fn(),
    setStatus: vi.fn(),
    setTargetWords: vi.fn(),
    stateDiff: undefined,
    stateDiffError: undefined,
    stateDiffLoading: false,
    stateDiffOpen: false,
    status: "clean",
    targetWords: 1200,
    versions: [],
    versionsError: undefined,
    versionsLoading: false,
    versionsOpen: false,
    ...overrides,
  };
}

function chapter(overrides: Partial<ChapterDraftView> = {}): ChapterDraftView {
  return {
    id: "chapter-1",
    chapter_index: 1,
    title: "第一章",
    content: "正文",
    status: "draft",
    target_words: 1200,
    version: 1,
    updated_at: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

function renderEditor(): unknown {
  return currentRuntime().render(() =>
    EditorClient({
      novelId: "novel-1",
      title: "测试小说",
      bible: {} as BibleDraft,
      initialChapters: [chapter()],
      initialChapterIndex: 1,
    }),
  );
}

describe("EditorClient interactions", () => {
  beforeEach(() => {
    runtimeRef.current = createHookRuntime();
    editorRef.current = editor();
    vi.stubGlobal("window", {
      localStorage: makeStorage(),
    });
    vi.stubGlobal("React", {
      Fragment: "Fragment",
      createElement: elements.create,
    });
  });

  afterEach(() => {
    runtimeRef.current?.cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("routes Ctrl+S to saveChapter when the editor can save", () => {
    const root = renderEditor();
    const event: KeyEvent = {
      ctrlKey: true,
      key: "s",
      preventDefault: vi.fn(),
    };

    (findByType(root, "div").props.onKeyDown as (event: KeyEvent) => void)(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(currentEditor().saveChapter).toHaveBeenCalledTimes(1);
  });

  it("does not save from Ctrl+S while drafting", () => {
    editorRef.current = editor({ status: "drafting" });
    const root = renderEditor();
    const event: KeyEvent = {
      metaKey: true,
      key: "s",
      preventDefault: vi.fn(),
    };

    (findByType(root, "div").props.onKeyDown as (event: KeyEvent) => void)(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(currentEditor().saveChapter).not.toHaveBeenCalled();
  });

  it("marks saved status dirty when title and body are edited", () => {
    editorRef.current = editor({ status: "saved" });
    const root = renderEditor();
    const toolbar = findByType(root, "EditorToolbar");
    const textarea = findByType(root, "textarea");

    (toolbar.props.onTitleChange as (title: string) => void)("新标题");
    (textarea.props.onChange as (event: ChangeEvent) => void)({
      target: { value: "新正文", selectionStart: 3, selectionEnd: 3 },
    });

    expect(currentEditor().setChapterTitle).toHaveBeenCalledWith("新标题");
    expect(currentEditor().setContent).toHaveBeenCalledWith("新正文");
    expect(currentEditor().setEditorSelection).toHaveBeenCalledWith({
      selectionStart: 3,
      selectionEnd: 3,
      selectedText: "",
    });
    expect(currentEditor().setStatus).toHaveBeenCalledWith("dirty");
  });

  it("tracks selected text and passes it to the candidate panel", () => {
    editorRef.current = editor({ candidateOpen: true, candidateContent: "候选正文" });
    const root = renderEditor();
    const textarea = findByType(root, "textarea");

    (textarea.props.onSelect as (event: ChangeEvent) => void)({
      target: { value: "abcdef", selectionStart: 1, selectionEnd: 4 },
    });
    const nextRoot = renderEditor();

    expect(currentEditor().setEditorSelection).toHaveBeenCalledWith({
      selectionStart: 1,
      selectionEnd: 4,
      selectedText: "bcd",
    });
    expect(findByType(nextRoot, "CandidatePanel").props.editorSelection).toEqual({
      selectionStart: 1,
      selectionEnd: 4,
      selectedText: "bcd",
    });
    expect(findByType(nextRoot, "AIPanel").props.editorSelection).toEqual({
      selectionStart: 1,
      selectionEnd: 4,
      selectedText: "bcd",
    });
  });

  it("clears editor selection when switching chapters", () => {
    const root = renderEditor();
    const sidebar = findByType(root, "EditorSidebar");

    (sidebar.props.onSelectChapter as (index: number) => void)(2);

    expect(currentEditor().selectChapter).toHaveBeenCalledWith(2);
    expect(currentEditor().setEditorSelection).toHaveBeenCalledWith(null);
  });

  it("offers explicit actions for a recovered offline draft", async () => {
    const offlineDraft = {
      novelId: "novel-1",
      chapterIndex: 1,
      chapterId: "chapter-1",
      title: "离线标题",
      content: "离线正文",
      status: "draft",
      version: 1,
      savedAt: "2026-05-27T00:00:00.000Z",
    };
    const storage = makeStorage({
      "ai-novel:offline-chapter:novel-1:1": JSON.stringify(offlineDraft),
    });
    vi.stubGlobal("window", { localStorage: storage });

    renderEditor();
    const root = renderEditor();
    const syncButton = findButtonByText(root, "同步本地草稿");

    await (syncButton.props.onClick as () => Promise<void>)();

    expect(currentEditor().saveOfflineDraft).toHaveBeenCalledWith(offlineDraft);
    expect(storage.getItem("ai-novel:offline-chapter:novel-1:1")).toBeNull();
  });

  it("loads an offline draft into the editor without overwriting the cloud copy", () => {
    const offlineDraft = {
      novelId: "novel-1",
      chapterIndex: 1,
      chapterId: "chapter-1",
      title: "离线标题",
      content: "离线正文",
      status: "done",
      version: 1,
      savedAt: "2026-05-27T00:00:00.000Z",
    };
    const storage = makeStorage({
      "ai-novel:offline-chapter:novel-1:1": JSON.stringify(offlineDraft),
    });
    vi.stubGlobal("window", { localStorage: storage });

    renderEditor();
    const root = renderEditor();
    const loadButton = findButtonByText(root, "载入编辑器");

    (loadButton.props.onClick as () => void)();

    expect(currentEditor().setChapterTitle).toHaveBeenCalledWith("离线标题");
    expect(currentEditor().setContent).toHaveBeenCalledWith("离线正文");
    expect(currentEditor().setChapterStatus).toHaveBeenCalledWith("done");
    expect(currentEditor().setStatus).toHaveBeenCalledWith("dirty");
    expect(currentEditor().saveOfflineDraft).not.toHaveBeenCalled();
    expect(storage.getItem("ai-novel:offline-chapter:novel-1:1")).toBeNull();
  });

  it("toggles the AI panel from the top bar", () => {
    let root = renderEditor();
    expect(findByType(root, "AIPanel").props.show).toBe(true);

    (findByProp(root, "title", "写作助手").props.onClick as () => void)();
    root = renderEditor();

    expect(findByType(root, "AIPanel").props.show).toBe(false);
  });

  it("links the editor top bar to the memory library", () => {
    const root = renderEditor();
    const memoryLink = findByProp(root, "aria-label", "打开记忆库");

    expect(memoryLink.type).toBe("a");
    expect(memoryLink.props.href).toBe("/novels/novel-1/memories");
  });

  it("passes state diff conflict warnings to the review panel", () => {
    const diff = {
      character_updates: [
        { name: "主角", changes: { current_location: "城镇" }, confidence: "high" as const },
        { name: "主角", changes: { current_location: "山谷" }, confidence: "high" as const },
      ],
      timeline_events: [],
      plot_thread_updates: [],
      new_entities: [],
    };
    editorRef.current = editor({
      stateDiffOpen: true,
      stateDiff: diff,
    });

    const root = currentRuntime().render(() =>
      EditorClient({
        novelId: "novel-1",
        title: "测试小说",
        bible: { story_state: {} } as BibleDraft,
        initialChapters: [chapter()],
        initialChapterIndex: 1,
      }),
    );
    const panel = findByType(root, "StateDiffPanel");

    expect(panel.props.warnings).toEqual([
      {
        type: "character_location",
        section: "character_updates",
        index: 1,
        message: "主角 在同一次状态更新中同时出现「城镇」和「山谷」两个位置。",
      },
    ]);
  });
});

describe("ExportMenu", () => {
  beforeEach(() => {
    vi.stubGlobal("React", {
      Fragment: "Fragment",
      createElement: elements.create,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("links the editor export control to the export center", () => {
    const node = ExportMenu({ novelId: "novel-1" });

    expect(findByType(node, "a").props.href).toBe("/novels/novel-1/export");
    expect(findByType(node, "a").props["aria-label"]).toBe("打开导出中心");
  });
});
