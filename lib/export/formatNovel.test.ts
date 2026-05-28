import { describe, it, expect } from "vitest";
import {
  formatAsDocx,
  formatAsEpub,
  formatAsJson,
  formatAsZip,
  formatAsMarkdown,
  formatAsTxt,
  formatNovel,
  sanitizeFilename,
  contentTypeFor,
  fileExtensionFor,
  applyExportRange,
  parseExportRange,
  parseIncludeBibleParam,
} from "./formatNovel";

const sampleNovel = {
  title: "星辰之海",
  chapters: [
    { chapter_index: 1, title: "第一章 启航", content: "船舶离开港口，驶向茫茫大海。", status: "done" },
    { chapter_index: 2, title: "第二章 风暴", content: "暴风雨来得猛烈，船帆被撕碎了。", status: "draft" },
  ],
};

const sampleBible = {
  meta: { suggested_title: "星海", alternative_titles: ["远航", "风暴", "归途"] },
  characters: [
    {
      role: "protagonist",
      name: "林澈",
      age: 18,
      appearance: "黑发少年",
      personality: "冷静",
      catchphrase: "出发",
      abilities: ["航海"],
      goals: "抵达星海",
      motivation: "寻找真相",
      secrets: ["旧地图"],
      relations: ["与阿月同行"],
    },
  ],
  world: {
    setting_summary: "星海由许多漂浮岛屿组成，远航者依靠潮汐与星图穿行。",
    factions: [{ name: "航海 guild", alignment: "中立", role: "掌控航线" }],
    rules: ["星潮每七日逆转一次"],
    geography: ["灯塔港"],
  },
  outline: {
    volume_1: {
      name: "第一卷",
      theme: "启航",
      chapter_count_estimate: 2,
      chapters: [
        { index: 1, title: "启航", summary: "林澈离港并发现旧地图隐藏的航线。" },
        { index: 2, title: "风暴", summary: "风暴迫使船队偏航，秘密势力第一次现身。" },
      ],
    },
  },
  first_chapter_beats: [{ beat: 1, scene: "码头", purpose: "建立目标" }],
  story_state: {
    timeline: [{ chapter_index: 1, event: "林澈离港", impact: "失去回头路" }],
    plot_threads: [{ id: "map", title: "旧地图", status: "progressing" }],
  },
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

  it("formatAsMarkdown appends bible appendix when provided", () => {
    const md = formatAsMarkdown({ ...sampleNovel, bible: sampleBible });
    expect(md).toContain("## 作品设定 Bible");
    expect(md).toContain("### 角色");
    expect(md).toContain("林澈");
    expect(md).toContain("### 世界");
    expect(md).toContain("星潮每七日逆转一次");
    expect(md).toContain("第 2 章《风暴》");
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

  it("formatAsTxt appends a plain bible appendix when provided", () => {
    const txt = formatAsTxt({ ...sampleNovel, bible: sampleBible });
    expect(txt).toContain("作品设定 Bible");
    expect(txt).toContain("林澈");
    expect(txt).toContain("旧地图");
  });

  it("formatNovel dispatches to correct formatter", async () => {
    const md = await formatNovel(sampleNovel, "markdown");
    expect(md).toContain("# 星辰之海");
    const txt = await formatNovel(sampleNovel, "txt");
    expect(txt).toContain("星辰之海");
    expect(txt).not.toContain("# 星辰之海");
    const json = await formatNovel(sampleNovel, "json");
    expect(json).toContain("\"title\": \"星辰之海\"");
  });

  it("contentTypeFor returns correct MIME types", () => {
    expect(contentTypeFor("markdown")).toContain("text/markdown");
    expect(contentTypeFor("txt")).toContain("text/plain");
    expect(contentTypeFor("docx")).toContain("wordprocessingml.document");
    expect(contentTypeFor("epub")).toContain("epub+zip");
    expect(contentTypeFor("json")).toContain("application/json");
    expect(contentTypeFor("zip")).toContain("application/zip");
  });

  it("fileExtensionFor returns correct extensions", () => {
    expect(fileExtensionFor("markdown")).toBe(".md");
    expect(fileExtensionFor("txt")).toBe(".txt");
    expect(fileExtensionFor("docx")).toBe(".docx");
    expect(fileExtensionFor("epub")).toBe(".epub");
    expect(fileExtensionFor("json")).toBe(".json");
    expect(fileExtensionFor("zip")).toBe(".zip");
  });

  it("formatAsJson serializes the complete project shape", () => {
    const parsed = JSON.parse(formatAsJson({
      ...sampleNovel,
      export_schema_version: 1,
      exported_at: "2026-05-28T00:00:00.000Z",
      summaries: {
        chapters: [],
        volumes: [],
        novel: null,
      },
      memory_chunks: [
        {
          id: "chunk-1",
          chapter_id: "chapter-1",
          chapter_index: 1,
          chapter_title: "第一章 启航",
          chunk_type: "scene",
          source_kind: "chapter",
          importance: 1,
          last_used_at: null,
          text: "旧地图第一次出现。",
          metadata: { reason: "plot" },
          content_hash: "hash",
          created_at: "2026-05-28T00:00:00.000Z",
          updated_at: "2026-05-28T00:00:00.000Z",
        },
      ],
    }));

    expect(parsed.export_schema_version).toBe(1);
    expect(parsed.memory_chunks[0]).toMatchObject({
      id: "chunk-1",
      text: "旧地图第一次出现。",
      chapter_index: 1,
    });
    expect(JSON.stringify(parsed)).not.toContain("embedding");
  });

  it("formatAsDocx returns a ZIP-shaped binary", async () => {
    const buf = new Uint8Array(await formatAsDocx(sampleNovel));
    expect(buf.byteLength).toBeGreaterThan(0);
    // .docx is a ZIP archive — first two bytes are "PK".
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });

  it("formatAsEpub returns a ZIP-shaped binary", async () => {
    const buf = new Uint8Array(await formatAsEpub(sampleNovel));
    expect(buf.byteLength).toBeGreaterThan(0);
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });

  it("formatAsZip returns a ZIP-shaped archive with project data", () => {
    const buf = new Uint8Array(formatAsZip({
      ...sampleNovel,
      export_schema_version: 1,
      exported_at: "2026-05-28T00:00:00.000Z",
    }));
    expect(buf.byteLength).toBeGreaterThan(0);
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
    const text = new TextDecoder().decode(buf);
    expect(text).toContain("project.json");
    expect(text).toContain("chapters/0001-第一章_启航.md");
  });

  it("formatAsDocx tolerates empty chapter content", async () => {
    const buf = new Uint8Array(await formatAsDocx(emptyChapterNovel));
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  it("formatAsEpub tolerates empty chapter content", async () => {
    const buf = new Uint8Array(await formatAsEpub(emptyChapterNovel));
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  it("sanitizeFilename strips unsafe characters", () => {
    expect(sanitizeFilename('Hello<World>/Test:File')).toBe("HelloWorldTestFile");
    expect(sanitizeFilename("Spaces   Everywhere")).toBe("Spaces_Everywhere");
    expect(sanitizeFilename("这 是 中 文 名")).toBe("这_是_中_文_名");
    expect(sanitizeFilename("A".repeat(200))).toHaveLength(100);
  });

  it("parseExportRange accepts single chapters, spans, and comma combinations", () => {
    const parsed = parseExportRange("1, 3, 5-7");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect([...parsed.range!.indices]).toEqual([1, 3, 5, 6, 7]);
    }
    expect(parseExportRange(null)).toEqual({ ok: true, range: null });
    expect(parseExportRange("")).toEqual({ ok: true, range: null });
  });

  it("parseExportRange rejects malformed and descending ranges", () => {
    expect(parseExportRange("0").ok).toBe(false);
    expect(parseExportRange("3-1").ok).toBe(false);
    expect(parseExportRange("1--3").ok).toBe(false);
    expect(parseExportRange("1,").ok).toBe(false);
  });

  it("parseIncludeBibleParam accepts boolean-like values only", () => {
    expect(parseIncludeBibleParam(null)).toBe(false);
    expect(parseIncludeBibleParam("true")).toBe(true);
    expect(parseIncludeBibleParam("1")).toBe(true);
    expect(parseIncludeBibleParam("false")).toBe(false);
    expect(parseIncludeBibleParam("0")).toBe(false);
    expect(parseIncludeBibleParam("maybe")).toBeNull();
  });

  it("applyExportRange filters chapters while preserving original order", () => {
    const parsed = parseExportRange("2,1");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(applyExportRange(sampleNovel.chapters, parsed.range).map((chapter) => chapter.chapter_index)).toEqual([1, 2]);
  });
});
