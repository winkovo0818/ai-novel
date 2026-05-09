import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import epub from "epub-gen-memory";

export type ExportFormat = "markdown" | "txt" | "docx" | "epub";

export interface ExportChapter {
  chapter_index: number;
  title: string;
  content: string;
  status: string;
}

export interface ExportNovel {
  title: string;
  /** Optional author / byline shown in EPUB metadata. Falls back to "佚名". */
  author?: string;
  chapters: ExportChapter[];
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

  return parts.join("\n");
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

/**
 * Packages the novel as a single-file EPUB using `epub-gen-memory`. Each
 * chapter becomes one EPUB chapter section with HTML-escaped paragraphs.
 * The header inside each section uses the chapter title; the package's table
 * of contents is built automatically from the same titles.
 */
export async function formatAsEpub(novel: ExportNovel): Promise<ArrayBuffer> {
  const buffer = await epub(
    {
      title: novel.title,
      author: novel.author?.trim() || "佚名",
    },
    novel.chapters.map((ch) => ({
      title: ch.title,
      content: chapterContentToHtml(ch.content),
    })),
  );
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

export async function formatNovel(
  novel: ExportNovel,
  format: ExportFormat,
): Promise<string | ArrayBuffer> {
  if (format === "markdown") return formatAsMarkdown(novel);
  if (format === "txt") return formatAsTxt(novel);
  if (format === "docx") return formatAsDocx(novel);
  if (format === "epub") return formatAsEpub(novel);
  throw new Error(`Unsupported export format: ${format satisfies never}`);
}

export function contentTypeFor(format: ExportFormat): string {
  if (format === "markdown") return "text/markdown; charset=utf-8";
  if (format === "txt") return "text/plain; charset=utf-8";
  if (format === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (format === "epub") return "application/epub+zip";
  return "application/octet-stream";
}

export function fileExtensionFor(format: ExportFormat): string {
  if (format === "markdown") return ".md";
  if (format === "txt") return ".txt";
  if (format === "docx") return ".docx";
  if (format === "epub") return ".epub";
  return "";
}

export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 100);
}
