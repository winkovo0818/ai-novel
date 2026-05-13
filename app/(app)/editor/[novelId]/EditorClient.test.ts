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
  };
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
    loadLatestChapter: vi.fn(),
    message: undefined,
    openPendingStateDiff: vi.fn(),
    openVersions: vi.fn(),
    pendingStateDiff: null,
    pendingStateDiffChapterIndex: null,
    resumableDraft: null,
    runConsistency: vi.fn(),
    saveChapter: vi.fn(),
    selectedDraft: chapter(),
    selectedIndex: 1,
    selectedOutline: { index: 1, title: "第一章", summary: "第一章摘要" },
    selectChapter: vi.fn(),
    setBeats: vi.fn(),
    setChapterStatus: vi.fn(),
    setChapterTitle: vi.fn(),
    setContent: vi.fn(),
    setCursorPos: vi.fn(),
    setStatus: vi.fn(),
    setTargetWords: vi.fn(),
    stateDiff: undefined,
    stateDiffError: undefined,
    stateDiffLoading: false,
    stateDiffOpen: false,
    status: "idle",
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

  it("marks saved status idle when title and body are edited", () => {
    editorRef.current = editor({ status: "saved" });
    const root = renderEditor();
    const toolbar = findByType(root, "EditorToolbar");
    const textarea = findByType(root, "textarea");

    (toolbar.props.onTitleChange as (title: string) => void)("新标题");
    (textarea.props.onChange as (event: ChangeEvent) => void)({
      target: { value: "新正文", selectionStart: 3 },
    });

    expect(currentEditor().setChapterTitle).toHaveBeenCalledWith("新标题");
    expect(currentEditor().setContent).toHaveBeenCalledWith("新正文");
    expect(currentEditor().setCursorPos).toHaveBeenCalledWith(3);
    expect(currentEditor().setStatus).toHaveBeenCalledWith("idle");
  });

  it("toggles the AI panel from the top bar", () => {
    let root = renderEditor();
    expect(findByType(root, "AIPanel").props.show).toBe(true);

    (findByProp(root, "title", "AI 创作助手").props.onClick as () => void)();
    root = renderEditor();

    expect(findByType(root, "AIPanel").props.show).toBe(false);
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
