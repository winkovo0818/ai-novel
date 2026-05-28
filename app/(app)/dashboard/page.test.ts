import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface TestElement {
  type: string;
  props: Record<string, unknown>;
}

const mocks = vi.hoisted(() => ({
  novelFindMany: vi.fn(),
  usageFindMany: vi.fn(),
  usageAggregate: vi.fn(),
  jobsFindMany: vi.fn(),
  getRequiredUserId: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

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

vi.mock("react", () => ({
  default: { Fragment: "Fragment", createElement: elements.create },
  Fragment: "Fragment",
  createElement: elements.create,
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

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    novel: { findMany: mocks.novelFindMany },
    llmUsage: {
      findMany: mocks.usageFindMany,
      aggregate: mocks.usageAggregate,
    },
    backgroundJob: { findMany: mocks.jobsFindMany },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getRequiredUserId: mocks.getRequiredUserId,
}));

vi.mock("@/components/ui/PageHeader", () => ({
  PageHeader: (props: Record<string, unknown>) =>
    elements.create("PageHeader", props, props.title, props.description, props.actions),
}));

vi.mock("@/components/ui/StatCard", () => ({
  StatCard: (props: Record<string, unknown>) =>
    elements.create("StatCard", props, props.label, props.value, props.subValue),
}));

vi.mock("@/components/ui/SectionCard", () => ({
  SectionCard: (props: Record<string, unknown>) =>
    elements.create("SectionCard", props, props.title, props.subtitle, props.actions, props.children),
}));

import DashboardPage from "./page";

function isElement(value: unknown): value is TestElement {
  return value !== null && typeof value === "object" && "type" in value && "props" in value;
}

function childNodes(value: unknown): unknown[] {
  if (!isElement(value)) return [];
  const children = value.props.children;
  return Array.isArray(children) ? children : children === undefined ? [] : [children];
}

function collectText(root: unknown): string {
  if (Array.isArray(root)) return root.map(collectText).join("");
  if (typeof root === "string" || typeof root === "number") return String(root);
  if (!isElement(root)) return "";
  return childNodes(root).map(collectText).join("");
}

function collectAriaLabels(root: unknown): string[] {
  const labels: string[] = [];
  function walk(node: unknown) {
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (!isElement(node)) return;
    if (typeof node.props["aria-label"] === "string") labels.push(node.props["aria-label"]);
    for (const child of childNodes(node)) walk(child);
  }
  walk(root);
  return labels;
}

function novel(overrides: Record<string, unknown> = {}) {
  return {
    id: "novel-1",
    title: "星河纪",
    created_at: new Date("2026-05-01T00:00:00.000Z"),
    chapters: [
      {
        id: "chapter-1",
        chapter_index: 1,
        title: "第一章",
        status: "draft",
        updated_at: new Date("2026-05-03T00:00:00.000Z"),
      },
    ],
    ...overrides,
  };
}

describe("DashboardPage copy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("React", {
      Fragment: "Fragment",
      createElement: elements.create,
    });
    mocks.getRequiredUserId.mockResolvedValue("user-1");
    mocks.usageFindMany.mockResolvedValue([]);
    mocks.usageAggregate.mockResolvedValue({
      _sum: { token_in: 100, token_out: 200, cost_cny: 1.23 },
      _count: 2,
    });
    mocks.jobsFindMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses practical next-step copy for continuing writing", async () => {
    mocks.novelFindMany
      .mockResolvedValueOnce([{ id: "novel-1" }])
      .mockResolvedValueOnce([novel()]);

    const root = await DashboardPage();
    const text = collectText(root);

    expect(text).toContain("下一步建议");
    expect(text).toContain("继续写作《星河纪》");
    expect(text).toContain("最近有编辑记录的作品");
    expect(collectAriaLabels(root)).toContain(
      "下一步建议: 继续写作《星河纪》. 还有 1 个章节处于草稿状态，可以从最近的作品继续。",
    );
    expect(text).not.toContain("智能创作协议");
    expect(text).not.toContain("DIRECTIVE");
    expect(text).not.toContain("PROTOCOL ALERT");
    expect(text).not.toContain("系统协议");
  });

  it("surfaces failed jobs without protocol-style language", async () => {
    mocks.novelFindMany
      .mockResolvedValueOnce([{ id: "novel-1" }])
      .mockResolvedValueOnce([novel({ chapters: [] })]);
    mocks.jobsFindMany.mockResolvedValue([
      { id: "job-1", status: "failed", created_at: new Date("2026-05-04T00:00:00.000Z") },
    ]);

    const root = await DashboardPage();
    const text = collectText(root);

    expect(text).toContain("处理 1 个失败任务");
    expect(text).toContain("任务状态");
    expect(text).toContain("有失败任务。请进入最近作品的编辑器，在顶部任务面板中重试。");
    expect(text).not.toContain("PROTOCOL ALERT");
    expect(text).not.toContain("核心异步队列");
  });
});
