import { describe, expect, it, vi } from "vitest";

import { CandidatePanel, getCandidateActionState } from "./CandidatePanel";

vi.mock("react", () => ({
  default: { createElement },
  useEffect: (effect: () => void) => effect(),
  useState: <T,>(initial: T) => [initial, vi.fn()] as const,
}));

vi.mock("react/jsx-runtime", () => ({
  Fragment: "Fragment",
  jsx: createElement,
  jsxs: createElement,
}));

vi.stubGlobal("React", { createElement });

function createElement(type: unknown, props?: Record<string, unknown>, ...children: unknown[]): unknown {
  if (typeof type === "function") {
    return (type as (props: Record<string, unknown>) => unknown)({
      ...(props ?? {}),
      children: children.length > 0 ? children : props?.children,
    });
  }
  return {
    type: String(type),
    props: {
      ...(props ?? {}),
      children: children.length > 0 ? children : props?.children,
    },
  };
}

function textContent(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(textContent).join("");
  if (!value || typeof value !== "object") return "";
  const props = (value as { props?: { children?: unknown } }).props;
  return textContent(props?.children);
}

describe("getCandidateActionState", () => {
  it("does not allow applying an empty candidate", () => {
    expect(getCandidateActionState({
      content: "   \n\t",
      streaming: false,
      criticLoading: false,
    })).toEqual({
      hasCandidateText: false,
      canApply: false,
      canDiscard: true,
    });
  });

  it("allows applying a non-empty candidate once idle", () => {
    expect(getCandidateActionState({
      content: "候选正文",
      streaming: false,
      criticLoading: false,
    })).toEqual({
      hasCandidateText: true,
      canApply: true,
      canDiscard: true,
    });
  });

  it("blocks applying and discarding while streaming", () => {
    expect(getCandidateActionState({
      content: "部分正文",
      streaming: true,
      criticLoading: false,
    })).toEqual({
      hasCandidateText: true,
      canApply: false,
      canDiscard: false,
    });
  });

  it("blocks applying while critic or revision work is running", () => {
    expect(getCandidateActionState({
      content: "候选正文",
      streaming: false,
      criticLoading: true,
    }).canApply).toBe(false);

    expect(getCandidateActionState({
      content: "候选正文",
      streaming: false,
      criticLoading: false,
      revisionLoading: true,
    }).canApply).toBe(false);
  });

  it("renders structured retrieval explanations for cited memories", () => {
    const rendered = CandidatePanel({
      content: "候选正文",
      streaming: false,
      criticLoading: false,
      hasExistingContent: true,
      currentContent: "旧正文",
      editorSelection: null,
      retrievalStatus: "success",
      retrievalExplanation: {
        queryTexts: ["主线 query", "角色 query"],
        keywordFilters: ["沈言", "柴饦门"],
      },
      retrievedMemories: [
        {
          id: "chunk-1",
          source: "chapter:1",
          reason: "类型：plot_thread，相似度：90.0%",
          score: 0.9,
          text: "沈言发现剑魂伏笔。",
          explanation: {
            chunkType: "plot_thread",
            similarity: 0.9,
            chapterDistance: 2,
            timeDecay: 0.83,
            importance: 1.5,
            matchedKeywords: ["沈言"],
          },
        },
      ],
      onAccept: vi.fn(),
      onMemoryFeedback: vi.fn(),
      onClose: vi.fn(),
    });

    const text = textContent(rendered);
    expect(text).toContain("Query expansion：主线 query / 角色 query");
    expect(text).toContain("Keyword filters：沈言 · 柴饦门");
    expect(text).toContain("类型 plot_thread");
    expect(text).toContain("相似度 90.0%");
    expect(text).toContain("距离 2 章");
    expect(text).toContain("衰减 83%");
    expect(text).toContain("重要性 1.50");
    expect(text).toContain("关键词 沈言");
    expect(text).toContain("有用");
    expect(text).toContain("不相关");
  });
});
