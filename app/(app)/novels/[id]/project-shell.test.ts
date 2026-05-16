import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface TestElement {
  type: string;
  props: Record<string, unknown>;
}

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  llmFindMany: vi.fn(),
  getRequiredUserId: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
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

  function marker(type: string, props: Record<string, unknown>): TestElement {
    return { type, props };
  }

  return { create, marker };
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
  notFound: mocks.notFound,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    novel: { findUnique: mocks.findUnique },
    llmUsage: { findMany: mocks.llmFindMany },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getRequiredUserId: mocks.getRequiredUserId,
}));

vi.mock("./export/ExportCenterClient", () => ({
  ExportCenterClient: (props: Record<string, unknown>) =>
    elements.marker("ExportCenterClient", props),
}));

vi.mock("./history/HistoryClient", () => ({
  HistoryClient: (props: Record<string, unknown>) => elements.marker("HistoryClient", props),
}));

import NovelDetailPage from "./page";
import ExportCenterPage from "./export/page";
import GenerationHistoryPage from "./history/page";

function isElement(value: unknown): value is TestElement {
  return value !== null && typeof value === "object" && "type" in value && "props" in value;
}

function childNodes(value: unknown): unknown[] {
  if (!isElement(value)) return [];
  const children = value.props.children;
  return Array.isArray(children) ? children : children === undefined ? [] : [children];
}

function collectText(root: unknown): string {
  if (typeof root === "string" || typeof root === "number") return String(root);
  if (!isElement(root)) return "";
  return childNodes(root).map(collectText).join("");
}

function collectHrefs(root: unknown): string[] {
  const hrefs: string[] = [];
  function walk(node: unknown) {
    if (!isElement(node)) return;
    if (typeof node.props.href === "string") hrefs.push(node.props.href);
    for (const child of childNodes(node)) walk(child);
  }
  walk(root);
  return hrefs;
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

function bibleDraft() {
  const chapters = Array.from({ length: 8 }, (_, index) => ({
    index: index + 1,
    title: `第${index + 1}章`,
    summary: `这是第${index + 1}章的剧情摘要，长度足够用于测试页面渲染和统计。`,
  }));
  return {
    meta: {
      suggested_title: "星河纪",
      alternative_titles: ["星河录", "远航记", "归途书"],
    },
    characters: [
      character("protagonist", "林舟"),
      character("ally", "许岚"),
      character("antagonist", "黑塔"),
    ],
    world: {
      setting_summary: "人类在星际移民后重新发现旧地球遗迹，各方势力围绕失落航道展开竞争。",
      factions: [
        { name: "远航会", alignment: "秩序", role: "探索旧航道" },
        { name: "黑塔", alignment: "混乱", role: "封锁遗迹" },
      ],
      rules: ["跃迁需要灯塔校准", "遗迹会记录记忆"],
      geography: ["近地环带", "深空灯塔"],
    },
    outline: {
      volume_1: {
        name: "远航卷",
        theme: "离开故土之后重新理解故土",
        chapter_count_estimate: 8,
        chapters,
      },
    },
    first_chapter_beats: Array.from({ length: 5 }, (_, index) => ({
      beat: index + 1,
      scene: `场景${index + 1}`,
      purpose: `推动主角发现线索${index + 1}`,
    })),
  };
}

function character(role: string, name: string) {
  return {
    role,
    name,
    age: 28,
    appearance: "黑发灰眼，穿旧式航行服",
    personality: "谨慎但愿意冒险",
    catchphrase: "灯塔还亮着",
    abilities: ["导航"],
    goals: "找到失落航道",
    motivation: "证明故乡仍有未来",
    secrets: ["曾经见过遗迹核心"],
    relations: [],
  };
}

function chapter(overrides: Record<string, unknown> = {}) {
  return {
    id: "chapter-1",
    chapter_index: 1,
    title: "第一章",
    content: "正文",
    status: "draft",
    target_words: 1200,
    version: 1,
    updated_at: new Date("2026-05-01T00:00:00.000Z"),
    ...overrides,
  };
}

function novel(overrides: Record<string, unknown> = {}) {
  return {
    id: "novel-1",
    user_id: "user-1",
    title: "星河纪",
    profile: { genre_main: "web", genre_sub: "科幻" },
    created_at: new Date("2026-04-01T00:00:00.000Z"),
    bible: {
      id: "bible-1",
      content: bibleDraft(),
    },
    chapters: [
      chapter({
        id: "chapter-2",
        chapter_index: 2,
        title: "第二章",
        status: "done",
        updated_at: new Date("2026-05-02T00:00:00.000Z"),
      }),
      chapter(),
    ],
    ...overrides,
  };
}

describe("project shell pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("React", {
      Fragment: "Fragment",
      createElement: elements.create,
    });
    mocks.getRequiredUserId.mockResolvedValue("user-1");
    mocks.findUnique.mockResolvedValue(novel());
    mocks.llmFindMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the owned novel detail shell with editor/export/history entry points", async () => {
    const root = await NovelDetailPage({ params: Promise.resolve({ id: "novel-1" }) });

    const text = collectText(root);
    const hrefs = collectHrefs(root);
    expect(text).toContain("星河纪");
    expect(text).toContain("继续写作 (第 2 章)");
    expect(hrefs).toContain("/editor/novel-1?chapter=2");
    expect(hrefs).toContain("/novels/novel-1/export");
    expect(hrefs).toContain("/novels/novel-1/history");
    expect(hrefs).toContain("/novels/novel-1/chapters");
    expect(mocks.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "novel-1" },
      }),
    );
  });

  it("hides foreign novels behind notFound", async () => {
    mocks.findUnique.mockResolvedValue(novel({ user_id: "other-user" }));

    await expect(
      NovelDetailPage({ params: Promise.resolve({ id: "novel-1" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mocks.notFound).toHaveBeenCalledOnce();
  });

  it("renders export center stats and disables export when the owned novel has no body", async () => {
    mocks.findUnique.mockResolvedValue(novel({ chapters: [chapter({ content: "" })] }));

    const root = await ExportCenterPage({ params: Promise.resolve({ id: "novel-1" }) });

    expect(collectText(root)).toContain("导出中心");
    const client = findByType(root, "ExportCenterClient");
    expect(client.props).toMatchObject({
      novelId: "novel-1",
      disabled: true,
    });
  });

  it("scopes generation history by user and novel before passing rows to the client", async () => {
    mocks.llmFindMany.mockResolvedValue([
      {
        id: "usage-1",
        agent: "writer",
        route: "/api/novels/[id]/chapters/draft",
        model: "deepseek-chat",
        status: "err",
        error_code: "LLM_TIMEOUT",
        token_in: 10,
        token_out: 20,
        cost_cny: 0.123456,
        took_ms: null,
        created_at: new Date("2026-05-03T00:00:00.000Z"),
      },
    ]);

    const root = await GenerationHistoryPage({
      params: Promise.resolve({ id: "novel-1" }),
      searchParams: Promise.resolve({ agent: "writer", status: "err" }),
    });

    expect(mocks.llmFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          novel_id: "novel-1",
          user_id: "user-1",
          agent: "writer",
          status: "err",
        },
        take: 100,
      }),
    );
    expect(findByType(root, "HistoryClient").props).toMatchObject({
      novelId: "novel-1",
      initialAgent: "writer",
      initialStatus: "err",
      initialData: [
        {
          id: "usage-1",
          agent: "writer",
          status: "err",
          error_code: "LLM_TIMEOUT",
          took_ms: undefined,
          created_at: "2026-05-03T00:00:00.000Z",
        },
      ],
    });
  });
});
