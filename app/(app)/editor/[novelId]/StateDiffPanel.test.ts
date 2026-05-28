import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StateDiff } from "@/lib/validation/schemas";
import type { StateDiffConflictWarning } from "@/lib/validation/stateDiffMerge";

interface TestElement {
  type: string;
  props: Record<string, unknown>;
}

interface HookRuntime {
  render<T>(component: () => T): T;
  useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  useMemo<T>(factory: () => T, deps?: readonly unknown[]): T;
  useState<T>(initial: T | (() => T)): readonly [T, (next: T | ((current: T) => T)) => void];
}

const runtimeRef = vi.hoisted(() => ({ current: undefined as HookRuntime | undefined }));
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

  return { create };
});

function currentRuntime(): HookRuntime {
  if (!runtimeRef.current) throw new Error("runtime not initialized");
  return runtimeRef.current;
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

import { StateDiffPanel } from "./StateDiffPanel";

function createHookRuntime(): HookRuntime {
  const slots: unknown[] = [];
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
      effect();
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

function textContent(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(textContent).join("");
  if (!isElement(value)) return "";
  return textContent(value.props.children);
}

function findByLabel(root: unknown, label: string): TestElement {
  if (Array.isArray(root)) {
    for (const child of root) {
      try {
        return findByLabel(child, label);
      } catch {
        // Keep scanning siblings.
      }
    }
  }
  if (isElement(root) && root.props["aria-label"] === label) return root;
  for (const child of childNodes(root)) {
    try {
      return findByLabel(child, label);
    } catch {
      // Keep scanning siblings.
    }
  }
  throw new Error(`element not found: ${label}`);
}

function findButtonByText(root: unknown, text: string): TestElement {
  if (Array.isArray(root)) {
    for (const child of root) {
      try {
        return findButtonByText(child, text);
      } catch {
        // Keep scanning siblings.
      }
    }
  }
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

const diff: StateDiff = {
  character_updates: [
    { name: "沈言", changes: { current_location: "柴饦门" }, confidence: "high" },
  ],
  timeline_events: [
    { event: "沈言抵达柴饦门", impact: "进入宗门线" },
  ],
  plot_thread_updates: [
    { title: "剑魂伏笔", status: "progressing", notes: "剑鸣再次出现" },
  ],
  new_entities: [
    { type: "location", name: "柴饦门", description: "外门山门" },
    { type: "item", name: "残破玉佩", description: "伏笔：与旧案有关" },
  ],
};

function renderPanel(overrides: Partial<Parameters<typeof StateDiffPanel>[0]> = {}) {
  return currentRuntime().render(() =>
    StateDiffPanel({
      loading: false,
      diff,
      onClose: vi.fn(),
      onAccept: vi.fn(),
      ...overrides,
    }),
  );
}

describe("StateDiffPanel", () => {
  beforeEach(() => {
    runtimeRef.current = createHookRuntime();
    vi.stubGlobal("React", {
      Fragment: "Fragment",
      createElement: elements.create,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("accepts every diff item by default", () => {
    const onAccept = vi.fn();
    const root = renderPanel({ onAccept });

    expect(textContent(root)).toContain("已选择 5 / 5 项");
    (findButtonByText(root, "采纳选中变更").props.onClick as () => void)();

    expect(onAccept).toHaveBeenCalledWith(diff);
  });

  it("submits only the selected diff items", () => {
    const onAccept = vi.fn();
    let root = renderPanel({ onAccept });

    (findByLabel(root, "选择新实体：柴饦门").props.onChange as () => void)();
    (findByLabel(root, "选择新实体：残破玉佩").props.onChange as () => void)();
    root = renderPanel({ onAccept });

    expect(textContent(root)).toContain("已选择 3 / 5 项");
    (findButtonByText(root, "采纳选中变更").props.onClick as () => void)();

    expect(onAccept).toHaveBeenCalledWith({
      character_updates: diff.character_updates,
      timeline_events: diff.timeline_events,
      plot_thread_updates: diff.plot_thread_updates,
      new_entities: [],
    });
  });

  it("disables accepting when the selection is empty", () => {
    let root = renderPanel();

    (findButtonByText(root, "清空").props.onClick as () => void)();
    root = renderPanel();

    const acceptButton = findButtonByText(root, "采纳选中变更");
    expect(textContent(root)).toContain("已选择 0 / 5 项");
    expect(acceptButton.props.disabled).toBe(true);
  });

  it("shows non-blocking conflict warnings", () => {
    const warnings: StateDiffConflictWarning[] = [
      {
        type: "character_location",
        message: "沈言 在同一次状态更新中同时出现两个位置。",
        section: "character_updates",
        index: 0,
      },
    ];
    const root = renderPanel({ warnings });

    expect(textContent(root)).toContain("检测到 1 条需要确认的状态冲突");
    expect(textContent(root)).toContain("沈言 在同一次状态更新中同时出现两个位置。");
    expect(findButtonByText(root, "采纳选中变更").props.disabled).toBe(false);
  });
});
