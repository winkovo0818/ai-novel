import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface TestElement {
  type: string;
  props: Record<string, unknown>;
}

interface TestJobRow {
  id: string;
  type: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  finished_at: string | null;
}

interface HookRuntime {
  render<T>(component: () => T): T;
  useCallback<T extends (...args: never[]) => unknown>(callback: T, deps?: readonly unknown[]): T;
  useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  useState<T>(initial: T | (() => T)): readonly [T, (next: T | ((current: T) => T)) => void];
  cleanup(): void;
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
  useCallback: <T extends (...args: never[]) => unknown>(callback: T, deps?: readonly unknown[]) =>
    currentRuntime().useCallback(callback, deps),
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

import { JobsBadge } from "./JobsBadge";

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
    useCallback<T extends (...args: never[]) => unknown>(callback: T, deps?: readonly unknown[]): T {
      const index = cursor;
      cursor += 1;
      const previous = slots[index] as { deps?: readonly unknown[]; value: T } | undefined;
      if (deps && previous?.deps && deps.length === previous.deps.length && deps.every((dep, i) => Object.is(dep, previous.deps?.[i]))) {
        return previous.value;
      }
      slots[index] = { deps, value: callback };
      return callback;
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
  if (Array.isArray(value)) return value;
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

function renderBadge(intervalMs = 1000): unknown {
  return currentRuntime().render(() => JobsBadge({ novelId: "novel-1", intervalMs }));
}

function jobsResponse(summary: { pending: number; running: number; failed: number }, jobs: TestJobRow[] = []) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      ok: true,
      data: { summary, jobs },
    }),
  });
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("JobsBadge", () => {
  beforeEach(() => {
    runtimeRef.current = createHookRuntime();
    vi.useFakeTimers();
    vi.stubGlobal("React", {
      Fragment: "Fragment",
      createElement: elements.create,
    });
  });

  afterEach(() => {
    runtimeRef.current?.cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads the compact badge once but does not poll while closed", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        ok: true,
        data: {
          summary: { pending: 1, running: 0, failed: 0 },
          jobs: [],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    let root = renderBadge(500);
    await flushPromises();
    root = renderBadge(500);

    expect(textContent(root)).toContain("记忆刷新 1");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("polls recent jobs while the panel is open", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ok: true,
          data: {
            summary: { pending: 1, running: 0, failed: 0 },
            jobs: [],
          },
        }),
      })
      .mockResolvedValue(jobsResponse(
        { pending: 0, running: 1, failed: 0 },
        [{ id: "j-1", type: "index_chapter", status: "running", attempts: 1, last_error: null, created_at: "2026-05-27T00:00:00.000Z", finished_at: null }],
      ));
    vi.stubGlobal("fetch", fetchMock);

    let root = renderBadge(500);
    await flushPromises();
    root = renderBadge(500);
    (findButtonByText(root, "记忆刷新 1").props.onClick as () => void)();
    root = renderBadge(500);
    await flushPromises();
    root = renderBadge(500);

    expect(textContent(root)).toContain("最近 20 个记忆任务");
    expect(textContent(root)).toContain("章节索引");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(500);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries failed jobs and refreshes the panel", async () => {
    const failedJob = {
      id: "j-failed",
      type: "summarize_chapter",
      status: "failed",
      attempts: 3,
      last_error: "boom",
      created_at: "2026-05-27T00:00:00.000Z",
      finished_at: null,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jobsResponse({ pending: 0, running: 0, failed: 1 }, [failedJob]))
      .mockResolvedValueOnce(jobsResponse({ pending: 0, running: 0, failed: 1 }, [failedJob]))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, data: { id: "j-failed", status: "pending", last_error: null } }),
      })
      .mockResolvedValueOnce(jobsResponse(
        { pending: 1, running: 0, failed: 0 },
        [{ ...failedJob, status: "pending", attempts: 0, last_error: null }],
      ));
    vi.stubGlobal("fetch", fetchMock);

    let root = renderBadge(0);
    await flushPromises();
    root = renderBadge(0);
    (findButtonByText(root, "1 失败").props.onClick as () => void)();
    root = renderBadge(0);
    await flushPromises();
    root = renderBadge(0);

    await (findButtonByText(root, "重试").props.onClick as () => Promise<void>)();

    expect(fetchMock).toHaveBeenCalledWith("/api/novels/novel-1/jobs/j-failed/retry", {
      method: "POST",
    });
    expect(fetchMock).toHaveBeenLastCalledWith("/api/novels/novel-1/jobs");
  });
});
