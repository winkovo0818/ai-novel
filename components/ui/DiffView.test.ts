import { describe, expect, it, vi } from "vitest";

vi.mock("react/jsx-runtime", () => ({
  Fragment: "Fragment",
  jsx: createElement,
  jsxs: createElement,
}));

vi.stubGlobal("React", { createElement });

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

import { DiffView } from "./DiffView";

describe("DiffView", () => {
  it("collapses unchanged context beyond eight lines by default", () => {
    const before = Array.from({ length: 12 }, (_, index) => `line ${index + 1}`).join("\n");
    const after = before.replace("line 1", "line one");
    const rendered = DiffView({ before, after });

    expect(textContent(rendered)).toContain("省略 3 行未变");
  });
});
