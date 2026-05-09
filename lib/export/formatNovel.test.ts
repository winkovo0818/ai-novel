import { describe, it, expect } from "vitest";
import { formatAsMarkdown, formatAsTxt, formatNovel, sanitizeFilename, contentTypeFor, fileExtensionFor } from "./formatNovel";

const sampleNovel = {
  title: "星辰之海",
  chapters: [
    { chapter_index: 1, title: "第一章 启航", content: "船舶离开港口，驶向茫茫大海。", status: "done" },
    { chapter_index: 2, title: "第二章 风暴", content: "暴风雨来得猛烈，船帆被撕碎了。", status: "draft" },
  ],
};

const emptyChapterNovel = {
  title: "空白书",
  chapters: [
    { chapter_index: 1, title: "第一章 未写", content: "", status: "draft" },
  ],
};

describe("formatNovel", () => {
  it("formatAsMarkdown produces markdown headers and content", () => {
    const md = formatAsMarkdown(sampleNovel);
    expect(md).toContain("# 星辰之海");
    expect(md).toContain("## 第一章 启航");
    expect(md).toContain("船舶离开港口，驶向茫茫大海。");
    expect(md).toContain("## 第二章 风暴");
    expect(md).toContain("暴风雨来得猛烈，船帆被撕碎了。");
  });

  it("formatAsMarkdown shows italic placeholder for empty chapters", () => {
    const md = formatAsMarkdown(emptyChapterNovel);
    expect(md).toContain("*(本章暂无内容)*");
  });

  it("formatAsTxt produces plain text with underlines", () => {
    const txt = formatAsTxt(sampleNovel);
    expect(txt).toContain("星辰之海");
    expect(txt).toContain("第一章 启航");
    expect(txt).toContain("船舶离开港口，驶向茫茫大海。");
    expect(txt).toContain("------");
  });

  it("formatAsTxt shows plain placeholder for empty chapters", () => {
    const txt = formatAsTxt(emptyChapterNovel);
    expect(txt).toContain("(本章暂无内容)");
  });

  it("formatNovel dispatches to correct formatter", () => {
    const md = formatNovel(sampleNovel, "markdown");
    expect(md).toContain("# 星辰之海");
    const txt = formatNovel(sampleNovel, "txt");
    expect(txt).toContain("星辰之海");
    expect(txt).not.toContain("# 星辰之海");
  });

  it("contentTypeFor returns correct MIME types", () => {
    expect(contentTypeFor("markdown")).toContain("text/markdown");
    expect(contentTypeFor("txt")).toContain("text/plain");
  });

  it("fileExtensionFor returns correct extensions", () => {
    expect(fileExtensionFor("markdown")).toBe(".md");
    expect(fileExtensionFor("txt")).toBe(".txt");
  });

  it("sanitizeFilename strips unsafe characters", () => {
    expect(sanitizeFilename('Hello<World>/Test:File')).toBe("HelloWorldTestFile");
    expect(sanitizeFilename("Spaces   Everywhere")).toBe("Spaces_Everywhere");
    expect(sanitizeFilename("这 是 中 文 名")).toBe("这_是_中_文_名");
    expect(sanitizeFilename("A".repeat(200))).toHaveLength(100);
  });
});