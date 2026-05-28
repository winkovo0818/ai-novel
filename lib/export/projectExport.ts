import { BibleDraftSchema } from "@/lib/validation/schemas";
import type { ExportNovel } from "./formatNovel";

export const completeNovelExportInclude = {
  chapters: {
    orderBy: { chapter_index: "asc" as const },
    include: { summary: true },
  },
  bible: true,
  volume_summaries: { orderBy: { volume_index: "asc" as const } },
  novel_summary: true,
  memory_chunks: {
    orderBy: [{ updated_at: "desc" as const }, { created_at: "desc" as const }],
    select: {
      id: true,
      chapter_id: true,
      chunk_type: true,
      text: true,
      content_hash: true,
      importance: true,
      source_kind: true,
      last_used_at: true,
      metadata: true,
      created_at: true,
      updated_at: true,
    },
  },
};

export interface CompleteNovelExportSource {
  id: string;
  title: string;
  profile: unknown;
  created_at: Date | string;
  deleted_at?: Date | string | null;
  chapters: Array<{
    id: string;
    chapter_index: number;
    title: string;
    content: string;
    status: string;
    target_words: number | null;
    version: number;
    summary_dirty: boolean;
    index_dirty: boolean;
    created_at: Date | string;
    updated_at: Date | string;
    summary: {
      id: string;
      summary: string;
      created_at: Date | string;
      updated_at: Date | string;
    } | null;
  }>;
  bible: {
    id: string;
    content: unknown;
    created_at: Date | string;
    updated_at: Date | string;
  } | null;
  volume_summaries: Array<{
    id: string;
    volume_index: number;
    summary: string;
    covered_chapters: string[];
    created_at: Date | string;
    updated_at: Date | string;
  }>;
  novel_summary: {
    id: string;
    summary: string;
    created_at: Date | string;
    updated_at: Date | string;
  } | null;
  memory_chunks: Array<{
    id: string;
    chapter_id: string | null;
    chunk_type: string;
    text: string;
    content_hash: string | null;
    importance: number;
    source_kind: string;
    last_used_at: Date | string | null;
    metadata: unknown;
    created_at: Date | string;
    updated_at: Date | string;
  }>;
}

export function buildCompleteNovelExport(
  novel: CompleteNovelExportSource,
  exportedAt = new Date(),
): ExportNovel {
  const parsedBible = novel.bible ? BibleDraftSchema.safeParse(novel.bible.content) : null;
  const chapterById = new Map(novel.chapters.map((chapter) => [chapter.id, chapter]));
  const storyState = parsedBible?.success
    ? parsedBible.data.story_state ?? null
    : extractStoryState(novel.bible?.content);

  return {
    export_schema_version: 1,
    exported_at: toIso(exportedAt),
    id: novel.id,
    title: novel.title,
    profile: novel.profile,
    created_at: toIso(novel.created_at),
    chapters: novel.chapters.map((chapter) => ({
      id: chapter.id,
      chapter_index: chapter.chapter_index,
      title: chapter.title,
      content: chapter.content,
      status: chapter.status,
      target_words: chapter.target_words,
      version: chapter.version,
      summary_dirty: chapter.summary_dirty,
      index_dirty: chapter.index_dirty,
      created_at: toIso(chapter.created_at),
      updated_at: toIso(chapter.updated_at),
      summary: chapter.summary
        ? {
            id: chapter.summary.id,
            summary: chapter.summary.summary,
            created_at: toIso(chapter.summary.created_at),
            updated_at: toIso(chapter.summary.updated_at),
          }
        : null,
    })),
    bible_draft: novel.bible
      ? {
          id: novel.bible.id,
          content: novel.bible.content,
          created_at: toIso(novel.bible.created_at),
          updated_at: toIso(novel.bible.updated_at),
        }
      : null,
    ...(parsedBible?.success ? { bible: parsedBible.data } : {}),
    story_state: storyState,
    summaries: {
      chapters: novel.chapters
        .filter((chapter) => chapter.summary)
        .map((chapter) => ({
          id: chapter.summary!.id,
          chapter_id: chapter.id,
          chapter_index: chapter.chapter_index,
          title: chapter.title,
          summary: chapter.summary!.summary,
          created_at: toIso(chapter.summary!.created_at),
          updated_at: toIso(chapter.summary!.updated_at),
        })),
      volumes: novel.volume_summaries.map((summary) => ({
        id: summary.id,
        volume_index: summary.volume_index,
        summary: summary.summary,
        covered_chapters: summary.covered_chapters,
        created_at: toIso(summary.created_at),
        updated_at: toIso(summary.updated_at),
      })),
      novel: novel.novel_summary
        ? {
            id: novel.novel_summary.id,
            summary: novel.novel_summary.summary,
            created_at: toIso(novel.novel_summary.created_at),
            updated_at: toIso(novel.novel_summary.updated_at),
          }
        : null,
    },
    memory_chunks: novel.memory_chunks.map((chunk) => {
      const chapter = chunk.chapter_id ? chapterById.get(chunk.chapter_id) : undefined;
      return {
        id: chunk.id,
        chapter_id: chunk.chapter_id,
        chapter_index: chapter?.chapter_index,
        chapter_title: chapter?.title,
        chunk_type: chunk.chunk_type,
        source_kind: chunk.source_kind,
        importance: chunk.importance,
        last_used_at: chunk.last_used_at ? toIso(chunk.last_used_at) : null,
        text: chunk.text,
        metadata: chunk.metadata,
        content_hash: chunk.content_hash,
        created_at: toIso(chunk.created_at),
        updated_at: toIso(chunk.updated_at),
      };
    }),
  };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function extractStoryState(value: unknown): unknown {
  if (value && typeof value === "object" && "story_state" in value) {
    return (value as { story_state?: unknown }).story_state ?? null;
  }
  return null;
}
