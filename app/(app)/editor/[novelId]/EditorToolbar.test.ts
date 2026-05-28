import { describe, expect, it } from "vitest";

import { getEditorSaveDisplay } from "./EditorToolbar";
import { StatusTag } from "@/components/ui/StatusTag";

type ElementNode = { type: string; props: Record<string, unknown> };

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

describe("getEditorSaveDisplay", () => {
  it("summarizes clean and recently saved states", () => {
    expect(getEditorSaveDisplay("clean", false, "刚刚")).toMatchObject({
      label: "已保存 · 刚刚",
      detail: "上次保存：刚刚",
    });
    expect(getEditorSaveDisplay("saved", false, "2 分钟前", "草稿已保存")).toMatchObject({
      label: "已保存 · 2 分钟前",
      detail: "草稿已保存",
    });
  });

  it("prioritizes dirty, saving, drafting, conflict, offline, and error labels", () => {
    expect(getEditorSaveDisplay("dirty", true, "刚刚").label).toBe("有未保存修改");
    expect(getEditorSaveDisplay("saving", true, "刚刚").label).toBe("正在保存");
    expect(getEditorSaveDisplay("drafting", true, "刚刚").label).toBe("AI 生成中");
    expect(getEditorSaveDisplay("conflict", true, "刚刚").label).toBe("版本冲突");
    expect(getEditorSaveDisplay("offline", true, "刚刚").label).toBe("离线未同步");
    expect(getEditorSaveDisplay("error", true, "刚刚").label).toBe("保存失败");
  });

  it("keeps the status width stable via the toolbar class contract", () => {
    const display = getEditorSaveDisplay("saving", true, "刚刚");
    expect(display.className).toContain("border-blue-200");
    expect(display.dotClass).toBe("bg-blue-500");
    expect(display.pulse).toBe(true);
  });

  it("uses direct status tag labels for editor states", () => {
    expect(collectText(StatusTag({ type: "drafting" }))).toBe("正在生成");
    expect(collectText(StatusTag({ type: "error" }))).toBe("需要处理");
    expect(collectText(StatusTag({ type: "ai" }))).toBe("写作辅助");
  });
});
