import type { BibleDraft, StoryStateV1 } from "@/lib/validation/schemas";
import { getAllChapters } from "@/lib/validation/schemas";

export interface ChapterDraftView {
  id: string;
  chapter_index: number;
  title: string;
  content: string;
  status: string;
}

export interface PreviousChapterContext {
  chapterIndex: number;
  title: string;
  summary: string;
}

export interface ChapterContext {
  bible: BibleDraft;
  storyState?: StoryStateV1;
  outline: {
    chapterIndex: number;
    title: string;
    summary?: string;
  };
  novelSummary?: string;
  volumeSummary?: string;
  previousSummaries: PreviousChapterContext[];
  retrievedMemories: Array<{
    source: string;
    text: string;
    reason: string;
  }>;
}

export interface BuildChapterContextOptions {
  novelSummary?: string;
  volumeSummary?: string;
  retrievedMemories?: Array<{ source: string; text: string; reason: string }>;
}

function formatPreviousChapter(index: number, title: string, content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  const excerpt = normalized.length > 900 ? `${normalized.slice(0, 900)}...` : normalized;
  return `第 ${index} 章《${title}》：${excerpt}`;
}

/** Maximum recent chapter summaries to inject directly. Older context comes from volume/novel summaries. */
const MAX_RECENT_CHAPTER_SUMMARIES = 5;

/**
 * Build the context package consumed by the Writer Agent.
 *
 * Responsibilities:
 * - Load Bible and story state.
 * - Load current chapter outline.
 * - Load novel summary, volume summary, and recent chapter summaries.
 * - Placeholder for retrieval results (RAG v2).
 */
export function buildChapterContext(
  bible: BibleDraft,
  chapters: Array<ChapterDraftView & { summary?: { summary: string } | null }>,
  chapterIndex: number,
  opts?: BuildChapterContextOptions,
): ChapterContext {
  const allOutlineChapters = getAllChapters(bible);
  const outlineChapter = allOutlineChapters.find((c) => c.index === chapterIndex);

  const relevantChapters = chapters
    .filter((chapter) => chapter.chapter_index < chapterIndex && chapter.content.trim())
    .sort((a, b) => a.chapter_index - b.chapter_index);

  // Only keep the most recent N chapter summaries; older context is provided
  // by volume_summary / novel_summary.
  const recentChapters = relevantChapters.slice(-MAX_RECENT_CHAPTER_SUMMARIES);

  const previousSummaries = recentChapters.map((chapter) => {
    if (chapter.summary) {
      return {
        chapterIndex: chapter.chapter_index,
        title: chapter.title,
        summary: `第 ${chapter.chapter_index} 章《${chapter.title}》：${chapter.summary.summary}`,
      };
    }
    return {
      chapterIndex: chapter.chapter_index,
      title: chapter.title,
      summary: formatPreviousChapter(chapter.chapter_index, chapter.title, chapter.content),
    };
  });

  return {
    bible,
    storyState: bible.story_state,
    outline: {
      chapterIndex,
      title: outlineChapter?.title ?? `第 ${chapterIndex} 章`,
      summary: outlineChapter?.summary,
    },
    novelSummary: opts?.novelSummary,
    volumeSummary: opts?.volumeSummary,
    previousSummaries,
    retrievedMemories: opts?.retrievedMemories ?? [],
  };
}
