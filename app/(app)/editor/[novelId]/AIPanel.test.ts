import { describe, expect, it, vi } from "vitest";

import { AIPanel } from "./AIPanel";
import type { BibleDraft } from "@/lib/validation/schemas";

type ElementNode = { type: string; props: Record<string, unknown> };

vi.mock("react", () => ({
  default: { createElement },
  createElement,
  useState: <T,>(initial: T) => [initial, vi.fn()] as const,
}));

vi.mock("react/jsx-runtime", () => ({
  Fragment: "Fragment",
  jsx: createElement,
  jsxs: createElement,
}));

vi.mock("./BeatSheetPanel", () => ({
  BeatSheetPanel: (props: Record<string, unknown>) => ({ type: "BeatSheetPanel", props }),
}));

function createElement(type: unknown, props?: Record<string, unknown>, ...children: unknown[]): unknown {
  const mergedProps = props ?? {};
  if (typeof type === "function") {
    return (type as (props: Record<string, unknown>) => unknown)({
      ...mergedProps,
      children: children.length > 0 ? children : mergedProps.children,
    });
  }
  return {
    type: String(type),
    props: {
      ...mergedProps,
      children: children.length > 0 ? children : mergedProps.children,
    },
  };
}

function isNode(value: unknown): value is ElementNode {
  return value !== null && typeof value === "object" && "type" in value && "props" in value;
}

function childrenOf(value: unknown): unknown[] {
  if (!isNode(value)) return [];
  const children = value.props.children;
  if (children === undefined) return [];
  return Array.isArray(children) ? children : [children];
}

function collectText(root: unknown): string {
  if (Array.isArray(root)) return root.map(collectText).join("");
  if (typeof root === "string" || typeof root === "number") return String(root);
  if (!isNode(root)) return "";
  return childrenOf(root).map(collectText).join("");
}

function findButtons(root: unknown): ElementNode[] {
  const found: ElementNode[] = [];
  function visit(node: unknown) {
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (!isNode(node)) return;
    if (node.type === "button") found.push(node);
    for (const child of childrenOf(node)) visit(child);
  }
  visit(root);
  return found;
}

function renderPanel(overrides: Partial<Parameters<typeof AIPanel>[0]> = {}) {
  return AIPanel({
    show: true,
    isCompact: false,
    onClose: vi.fn(),
    bible,
    novelId: "novel-1",
    status: "clean",
    selectedOutline: { summary: "本章去训练室。" },
    selectedChapterIndex: 2,
    chapterTitle: "训练室",
    editorSelection: null,
    onDraftChapter: vi.fn(),
    onReviseSelection: vi.fn(),
    onDraftWithMemories: vi.fn(),
    onRunConsistency: vi.fn(),
    consistencyRunning: false,
    onGenerateStateDiff: vi.fn(),
    stateDiffLoading: false,
    beats: [],
    beatsLoading: false,
    onGenerateBeats: vi.fn(),
    onUpdateBeats: vi.fn(),
    onClearBeats: vi.fn(),
    onDraftWithBeats: vi.fn(),
    ...overrides,
  });
}

describe("AIPanel local revision actions", () => {
  it("disables local revision buttons until text is selected", () => {
    const root = renderPanel();
    const localButtons = findButtons(root).filter((button) => button.props.title === "请先选中文本");

    expect(localButtons).toHaveLength(7);
    expect(localButtons.every((button) => button.props.disabled === true)).toBe(true);
  });

  it("calls the selected local revision operation", () => {
    const onReviseSelection = vi.fn();
    const root = renderPanel({
      editorSelection: {
        selectionStart: 2,
        selectionEnd: 8,
        selectedText: "需要润色的句子",
      },
      onReviseSelection,
    });
    const polish = findButtons(root).find((button) => button.props.title === "润色选中文本");

    expect(polish?.props.disabled).toBe(false);
    (polish?.props.onClick as () => void)();

    expect(onReviseSelection).toHaveBeenCalledWith("polish");
  });

  it("exposes a humanize action for selected text", () => {
    const onReviseSelection = vi.fn();
    const root = renderPanel({
      editorSelection: {
        selectionStart: 2,
        selectionEnd: 8,
        selectedText: "这一刻，真正的考验才刚刚开始。",
      },
      onReviseSelection,
    });
    const humanize = findButtons(root).find((button) => button.props.title === "去AI味选中文本");

    expect(humanize?.props.disabled).toBe(false);
    (humanize?.props.onClick as () => void)();

    expect(onReviseSelection).toHaveBeenCalledWith("humanize");
  });

  it("uses writing-tool copy in the assistant panel", () => {
    const root = renderPanel({
      consistencyResult: { consistent: true, issues: [] },
    });
    const text = collectText(root);

    expect(text).toContain("写作操作");
    expect(text).toContain("一致性检查");
    expect(text).toContain("状态分析");
    expect(text).toContain("章节提示");
    expect(text).toContain("一致性检查结果");
    expect(text).not.toContain("逻辑审计");
    expect(text).not.toContain("一致性审计报告");
    expect(text).not.toContain("思考引擎");
    expect(text).not.toContain("Neural Creative Engine");
  });
});

const bible: BibleDraft = {
  meta: { suggested_title: "重燃之路", alternative_titles: ["重燃", "回场", "再战"] },
  characters: [
    character("protagonist", "林燃"),
    character("mentor", "老王"),
    character("antagonist", "赵锐"),
  ],
  world: {
    setting_summary: "校园篮球重生故事。",
    factions: [{ name: "校队", alignment: "中立", role: "竞技舞台" }],
    rules: ["冲突必须可追溯"],
    geography: ["球场"],
  },
  outline: {
    volume_1: {
      name: "重燃",
      theme: "回到球场",
      chapter_count_estimate: 8,
      chapters: Array.from({ length: 8 }, (_, index) => ({
        index: index + 1,
        title: `第${index + 1}章`,
        summary: "章节摘要足够长。",
      })),
    },
  },
  first_chapter_beats: Array.from({ length: 5 }, (_, index) => ({
    beat: index + 1,
    scene: `场景${index + 1}`,
    purpose: `目的${index + 1}`,
  })),
};

function character(role: "protagonist" | "mentor" | "antagonist", name: string) {
  return {
    role,
    name,
    age: 18,
    appearance: "清瘦",
    personality: "冷静",
    catchphrase: "再来",
    abilities: ["分析"],
    goals: "赢球",
    motivation: "证明自己",
    secrets: [],
    relations: [],
  };
}
