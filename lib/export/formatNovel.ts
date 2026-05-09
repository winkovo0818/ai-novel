export type ExportFormat = "markdown" | "txt";

export interface ExportChapter {
  chapter_index: number;
  title: string;
  content: string;
  status: string;
}

export interface ExportNovel {
  title: string;
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

export function formatNovel(novel: ExportNovel, format: ExportFormat): string {
  if (format === "markdown") return formatAsMarkdown(novel);
  return formatAsTxt(novel);
}

export function contentTypeFor(format: ExportFormat): string {
  if (format === "markdown") return "text/markdown; charset=utf-8";
  return "text/plain; charset=utf-8";
}

export function fileExtensionFor(format: ExportFormat): string {
  if (format === "markdown") return ".md";
  return ".txt";
}

export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 100);
}