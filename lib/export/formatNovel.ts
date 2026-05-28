import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import epub from "epub-gen-memory";

export type ExportFormat = "markdown" | "txt" | "docx" | "epub" | "json" | "zip";

export interface ExportChapter {
  id?: string;
  chapter_index: number;
  title: string;
  content: string;
  status: string;
  target_words?: number | null;
  version?: number;
  summary_dirty?: boolean;
  index_dirty?: boolean;
  created_at?: string;
  updated_at?: string;
  summary?: {
    id: string;
    summary: string;
    created_at?: string;
    updated_at: string;
  } | null;
}

export interface ExportNovel {
  export_schema_version?: number;
  exported_at?: string;
  id?: string;
  title: string;
  profile?: unknown;
  created_at?: string;
  /** Optional author / byline shown in EPUB metadata. Falls back to "佚名". */
  author?: string;
  chapters: ExportChapter[];
  bible?: ExportBible;
  bible_draft?: {
    id: string;
    content: unknown;
    created_at: string;
    updated_at: string;
  } | null;
  bible_updated_at?: string;
  story_state?: unknown;
  summaries?: {
    chapters: Array<{
      id: string;
      chapter_id: string;
      chapter_index: number;
      title: string;
      summary: string;
      created_at?: string;
      updated_at: string;
    }>;
    volumes: Array<{
      id: string;
      volume_index: number;
      summary: string;
      covered_chapters: string[];
      created_at?: string;
      updated_at: string;
    }>;
    novel: {
      id: string;
      summary: string;
      created_at?: string;
      updated_at: string;
    } | null;
  };
  memory_chunks?: Array<{
    id: string;
    chapter_id?: string | null;
    chapter_index?: number;
    chapter_title?: string;
    chunk_type: string;
    source_kind: string;
    importance: number;
    last_used_at?: string | null;
    text: string;
    metadata?: unknown;
    content_hash?: string | null;
    created_at: string;
    updated_at: string;
  }>;
}

export interface ExportBible {
  meta?: {
    suggested_title?: string;
    alternative_titles?: string[];
  };
  characters?: Array<{
    role: string;
    name: string;
    age?: number | string;
    appearance?: string;
    personality?: string;
    catchphrase?: string;
    abilities?: string[];
    goals?: string;
    motivation?: string;
    secrets?: string[];
    relations?: string[];
  }>;
  world?: {
    setting_summary?: string;
    factions?: Array<{ name: string; alignment: string; role: string }>;
    rules?: string[];
    geography?: string[];
  };
  outline?: {
    volume_1?: ExportVolume;
    volumes?: ExportVolume[];
  };
  first_chapter_beats?: Array<{ beat: number; scene: string; purpose: string }>;
  story_state?: {
    characters?: Array<{
      name: string;
      current_location?: string;
      current_goal?: string;
      emotional_state?: string;
      known_secrets?: string[];
      relationship_notes?: string[];
    }>;
    timeline?: Array<{ chapter_index: number; event: string; impact?: string }>;
    plot_threads?: Array<{
      id: string;
      title: string;
      status: string;
      introduced_in?: number;
      resolved_in?: number;
      notes?: string;
    }>;
  };
}

interface ExportVolume {
  name: string;
  theme: string;
  chapter_count_estimate: number;
  chapters: Array<{ index: number; title: string; summary: string }>;
}

export interface ExportChapterRange {
  raw: string;
  indices: Set<number>;
}

export type ExportRangeParseResult =
  | { ok: true; range: ExportChapterRange | null }
  | { ok: false; error: string };

export function parseExportRange(value: string | null): ExportRangeParseResult {
  const raw = value?.trim();
  if (!raw) return { ok: true, range: null };

  const indices = new Set<number>();
  for (const part of raw.split(",")) {
    const token = part.trim();
    if (!token) return { ok: false, error: "range must use chapter numbers like 1, 1-10, or 1,3,5-8" };

    const single = /^(\d+)$/.exec(token);
    if (single) {
      const index = Number(single[1]);
      if (!Number.isSafeInteger(index) || index < 1) {
        return { ok: false, error: "range chapter numbers must be positive integers" };
      }
      indices.add(index);
      continue;
    }

    const span = /^(\d+)-(\d+)$/.exec(token);
    if (!span) {
      return { ok: false, error: "range must use chapter numbers like 1, 1-10, or 1,3,5-8" };
    }
    const start = Number(span[1]);
    const end = Number(span[2]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < 1) {
      return { ok: false, error: "range chapter numbers must be positive integers" };
    }
    if (start > end) {
      return { ok: false, error: "range start must be less than or equal to range end" };
    }
    for (let index = start; index <= end; index += 1) {
      indices.add(index);
    }
  }

  return { ok: true, range: { raw, indices } };
}

export function parseIncludeBibleParam(value: string | null): boolean | null {
  if (value === null || value.trim() === "") return false;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return null;
}

export function applyExportRange(
  chapters: ExportChapter[],
  range: ExportChapterRange | null,
): ExportChapter[] {
  if (!range) return chapters;
  return chapters.filter((chapter) => range.indices.has(chapter.chapter_index));
}

function joinParts(parts: string[]): string {
  return parts.filter((part) => part.trim().length > 0).join("\n");
}

function formatExportBibleAsMarkdown(bible: ExportBible): string {
  const parts: string[] = ["## 作品设定 Bible", ""];

  if (bible.meta?.suggested_title) {
    parts.push(`- 推荐书名：${bible.meta.suggested_title}`);
  }
  if (bible.meta?.alternative_titles?.length) {
    parts.push(`- 备选书名：${bible.meta.alternative_titles.join("、")}`);
  }

  if (bible.characters?.length) {
    parts.push("", "### 角色", "");
    for (const character of bible.characters) {
      parts.push(`- ${character.name}（${character.role}）：${joinParts([
        character.personality ?? "",
        character.goals ? `目标：${character.goals}` : "",
        character.motivation ? `动机：${character.motivation}` : "",
      ]) || "未补充"}`);
      if (character.abilities?.length) parts.push(`  - 能力：${character.abilities.join("、")}`);
      if (character.relations?.length) parts.push(`  - 关系：${character.relations.join("；")}`);
    }
  }

  if (bible.world) {
    parts.push("", "### 世界", "");
    if (bible.world.setting_summary) parts.push(bible.world.setting_summary);
    if (bible.world.factions?.length) {
      parts.push("", "#### 势力");
      for (const faction of bible.world.factions) {
        parts.push(`- ${faction.name}：${faction.alignment}，${faction.role}`);
      }
    }
    if (bible.world.rules?.length) {
      parts.push("", "#### 规则");
      for (const rule of bible.world.rules) parts.push(`- ${rule}`);
    }
    if (bible.world.geography?.length) {
      parts.push("", `#### 地点\n${bible.world.geography.map((place) => `- ${place}`).join("\n")}`);
    }
  }

  const volumes = [
    ...(bible.outline?.volume_1 ? [bible.outline.volume_1] : []),
    ...(bible.outline?.volumes ?? []),
  ];
  if (volumes.length) {
    parts.push("", "### 大纲", "");
    for (const volume of volumes) {
      parts.push(`#### ${volume.name}`);
      parts.push(`主题：${volume.theme}`);
      for (const chapter of volume.chapters) {
        parts.push(`- 第 ${chapter.index} 章《${chapter.title}》：${chapter.summary}`);
      }
      parts.push("");
    }
  }

  if (bible.first_chapter_beats?.length) {
    parts.push("### 第一章节拍", "");
    for (const beat of bible.first_chapter_beats) {
      parts.push(`- ${beat.beat}. ${beat.scene}（${beat.purpose}）`);
    }
  }

  if (bible.story_state?.timeline?.length || bible.story_state?.plot_threads?.length) {
    parts.push("", "### 当前故事状态", "");
    for (const event of bible.story_state.timeline ?? []) {
      parts.push(`- 第 ${event.chapter_index} 章：${event.event}${event.impact ? `（${event.impact}）` : ""}`);
    }
    for (const thread of bible.story_state.plot_threads ?? []) {
      parts.push(`- ${thread.title}：${thread.status}${thread.notes ? `，${thread.notes}` : ""}`);
    }
  }

  return parts.join("\n").trim();
}

function formatExportBibleAsTxt(bible: ExportBible): string {
  return formatExportBibleAsMarkdown(bible)
    .replace(/^## /gm, "")
    .replace(/^### /gm, "")
    .replace(/^#### /gm, "")
    .replace(/\*\*/g, "");
}

export function formatAsMarkdown(novel: ExportNovel): string {
  const parts: string[] = [];

  parts.push(`# ${novel.title}`);
  parts.push("");

  for (const ch of novel.chapters) {
    parts.push(`## ${ch.title}`);
    parts.push("");
    if (ch.content.trim()) {
      parts.push(ch.content.trim());
      parts.push("");
    } else {
      parts.push("*(本章暂无内容)*");
      parts.push("");
    }
  }

  if (novel.bible) {
    parts.push("---");
    parts.push("");
    parts.push(formatExportBibleAsMarkdown(novel.bible));
    parts.push("");
  }

  return parts.join("\n");
}

export function formatAsTxt(novel: ExportNovel): string {
  const parts: string[] = [];

  parts.push(novel.title);
  parts.push("=".repeat(novel.title.length));
  parts.push("");

  for (const ch of novel.chapters) {
    parts.push(ch.title);
    parts.push("-".repeat(ch.title.length));
    parts.push("");
    if (ch.content.trim()) {
      parts.push(ch.content.trim());
      parts.push("");
    } else {
      parts.push("(本章暂无内容)");
      parts.push("");
    }
    parts.push("");
  }

  if (novel.bible) {
    parts.push("=".repeat(12));
    parts.push("");
    parts.push(formatExportBibleAsTxt(novel.bible));
    parts.push("");
  }

  return parts.join("\n");
}

export function formatAsJson(novel: ExportNovel): string {
  return `${JSON.stringify(novel, null, 2)}\n`;
}

/**
 * Builds a .docx archive in memory using the `docx` package. Each chapter is
 * a HEADING_1 followed by one Paragraph per non-empty source line so that line
 * breaks the user typed are preserved (Word treats every Paragraph as a
 * visible newline). Empty chapters render an italic placeholder line so the
 * heading isn't followed by nothing.
 */
export async function formatAsDocx(novel: ExportNovel): Promise<ArrayBuffer> {
  const children: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(novel.title)] }),
  ];

  for (const ch of novel.chapters) {
    children.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(ch.title)] }),
    );
    const trimmed = ch.content.trim();
    if (!trimmed) {
      children.push(new Paragraph({ children: [new TextRun({ text: "(本章暂无内容)", italics: true })] }));
      continue;
    }
    for (const line of trimmed.split(/\r?\n/)) {
      children.push(new Paragraph({ children: [new TextRun(line)] }));
    }
  }

  if (novel.bible) {
    children.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("作品设定 Bible")] }),
    );
    for (const line of formatExportBibleAsTxt(novel.bible).split(/\r?\n/)) {
      children.push(new Paragraph({ children: [new TextRun(line)] }));
    }
  }

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function chapterContentToHtml(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return "<p><em>(本章暂无内容)</em></p>";
  return trimmed
    .split(/\r?\n/)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("\n");
}

function textToHtml(content: string): string {
  return content
    .trim()
    .split(/\r?\n/)
    .map((line) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : "<p>&nbsp;</p>"))
    .join("\n");
}

/**
 * Packages the novel as a single-file EPUB using `epub-gen-memory`. Each
 * chapter becomes one EPUB chapter section with HTML-escaped paragraphs.
 * The header inside each section uses the chapter title; the package's table
 * of contents is built automatically from the same titles.
 */
export async function formatAsEpub(novel: ExportNovel): Promise<ArrayBuffer> {
  const chapters = novel.chapters.map((ch) => ({
    title: ch.title,
    content: chapterContentToHtml(ch.content),
  }));
  if (novel.bible) {
    chapters.push({
      title: "作品设定 Bible",
      content: textToHtml(formatExportBibleAsTxt(novel.bible)),
    });
  }

  const buffer = await epub(
    {
      title: novel.title,
      author: novel.author?.trim() || "佚名",
    },
    chapters,
  );
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

export function formatAsZip(novel: ExportNovel): ArrayBuffer {
  const files = [
    {
      path: "project.json",
      content: formatAsJson(novel),
    },
    {
      path: "README.txt",
      content: [
        "AI Novel 完整项目导出",
        `作品：${novel.title}`,
        `导出时间：${novel.exported_at ?? "未知"}`,
        "",
        "project.json 包含作品设定、章节、摘要和记忆元数据。",
        "chapters/ 目录提供按章节拆分的 Markdown 正文，便于人工检查和恢复。",
      ].join("\n"),
    },
    ...novel.chapters.map((chapter) => ({
      path: `chapters/${String(chapter.chapter_index).padStart(4, "0")}-${sanitizeFilename(chapter.title) || "chapter"}.md`,
      content: [`# ${chapter.title}`, "", chapter.content.trim() || "(本章暂无内容)", ""].join("\n"),
    })),
  ];

  return createStoredZip(files);
}

export async function formatNovel(
  novel: ExportNovel,
  format: ExportFormat,
): Promise<string | ArrayBuffer> {
  if (format === "markdown") return formatAsMarkdown(novel);
  if (format === "txt") return formatAsTxt(novel);
  if (format === "docx") return formatAsDocx(novel);
  if (format === "epub") return formatAsEpub(novel);
  if (format === "json") return formatAsJson(novel);
  if (format === "zip") return formatAsZip(novel);
  throw new Error(`Unsupported export format: ${format satisfies never}`);
}

export function contentTypeFor(format: ExportFormat): string {
  if (format === "markdown") return "text/markdown; charset=utf-8";
  if (format === "txt") return "text/plain; charset=utf-8";
  if (format === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (format === "epub") return "application/epub+zip";
  if (format === "json") return "application/json; charset=utf-8";
  if (format === "zip") return "application/zip";
  return "application/octet-stream";
}

export function fileExtensionFor(format: ExportFormat): string {
  if (format === "markdown") return ".md";
  if (format === "txt") return ".txt";
  if (format === "docx") return ".docx";
  if (format === "epub") return ".epub";
  if (format === "json") return ".json";
  if (format === "zip") return ".zip";
  return "";
}

export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 100);
}

interface ZipInputFile {
  path: string;
  content: string;
}

function createStoredZip(files: ZipInputFile[]): ArrayBuffer {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.path);
    const data = encoder.encode(file.content);
    const crc = crc32(data);

    const localHeader = new Uint8Array(30 + name.byteLength);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0x0021, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.byteLength, true);
    localView.setUint32(22, data.byteLength, true);
    localView.setUint16(26, name.byteLength, true);
    localView.setUint16(28, 0, true);
    localHeader.set(name, 30);

    localParts.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + name.byteLength);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0x0021, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.byteLength, true);
    centralView.setUint32(24, data.byteLength, true);
    centralView.setUint16(28, name.byteLength, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(name, 46);
    centralParts.push(centralHeader);

    offset += localHeader.byteLength + data.byteLength;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.byteLength, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  const bytes = concatBytes([...localParts, ...centralParts, end]);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

const CRC32_TABLE = makeCrc32Table();

function makeCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < table.length; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
