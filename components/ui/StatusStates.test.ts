import { describe, expect, it, vi } from "vitest";

vi.mock("react/jsx-runtime", () => ({
  Fragment: "Fragment",
  jsx: createElement,
  jsxs: createElement,
}));

vi.stubGlobal("React", { createElement });

type TestElement = { type: string; props: Record<string, unknown> };

function createElement(type: unknown, props?: Record<string, unknown>, ...children: unknown[]): unknown {
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

function rootClass(value: unknown): string {
  return String((value as TestElement).props.className ?? "");
}

import { EmptyState } from "./StatusStates";

describe("StatusStates", () => {
  it("renders compact empty states for smaller panels", () => {
    const rendered = EmptyState({
      size: "compact",
      title: "还没有生成记录",
      description: "使用写作助手后，最近调用会显示在这里。",
      className: "bg-secondary/10",
    });

    expect(textContent(rendered)).toContain("还没有生成记录");
    expect(textContent(rendered)).toContain("使用写作助手后，最近调用会显示在这里。");
    expect(rootClass(rendered)).toContain("py-8");
    expect(rootClass(rendered)).toContain("bg-secondary/10");
  });
});
