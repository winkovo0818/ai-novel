import type { VolumeArc } from "./volumePlan";
import type { BibleDraft, StoryStateV1 } from "@/lib/validation/schemas";
import { getAllChapters } from "@/lib/validation/schemas";
import type { RetrievalStatus, BeatSheet } from "@/lib/agent/contracts";

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
  /** 前一章结尾原文（截取），让 writer 接得住上一章的具体落点，防章际承接断裂。 */
  endingExcerpt?: string;
}

export interface ChapterContext {
  bible: BibleDraft;
  storyState?: StoryStateV1;
  outline: {
    chapterIndex: number;
    title: string;
    summary?: string;
  };
  volumeArc?: VolumeArc;
  novelSummary?: string;
  volumeSummary?: string;
  /** 已完成的各卷摘要（排除当前卷），让长篇写作能看到前序卷的核心推进，防远端失锚。 */
  priorVolumeSummaries?: string;
  previousSummaries: PreviousChapterContext[];
  retrievedMemories: Array<{
    source: string;
    text: string;
    reason: string;
  }>;
  retrievalStatus: RetrievalStatus;
  beatSheet?: BeatSheet;
}

export interface BuildChapterContextOptions {
  volumeArc?: VolumeArc;
  novelSummary?: string;
  volumeSummary?: string;
  priorVolumeSummaries?: string;
  retrievedMemories?: Array<{ source: string; text: string; reason: string }>;
  retrievalStatus?: RetrievalStatus;
  beatSheet?: BeatSheet;
}

function formatPreviousChapter(index: number, title: string, content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= 900) {
    return `第 ${index} 章《${title}》：${normalized}`;
  }
  // 超长则取「开头 + 结尾」拼接——承接最关心上一章的「结果」（结尾）而非「开场」，
  // 故结尾占比更大；旧的「只取前 900 字」会丢掉章末的关键转折，导致连续性断裂。
  const head = normalized.slice(0, 300);
  const tail = normalized.slice(-600);
  return `第 ${index} 章《${title}》：${head}……（中略）……${tail}`;
}

/** 取上一章结尾原文（按段落边界，~350 字），供 writer 接住上一章的具体落点。 */
function extractEndingExcerpt(content: string): string {
  const paragraphs = content.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) return "";
  const excerpt: string[] = [];
  let charCount = 0;
  // 从末段往前收，凑到 ~350 字为止——结尾段落承载上一章的落点/悬念
  for (let i = paragraphs.length - 1; i >= 0 && charCount < 350; i -= 1) {
    excerpt.unshift(paragraphs[i]);
    charCount += paragraphs[i].length;
  }
  return excerpt.join("\n");
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

  // 直接前章（上一章）的结尾原文——章际承接的关键。摘要把"她拦出租车去找人"
  // 压成抽象概括，writer 接不住具体落点，导致下一章开头跳过衔接或另起。
  // 只给最近一章填结尾，避免给每章都加造成 token 膨胀。
  const directPrevChapter = relevantChapters.at(-1);
  const prevEndingExcerpt = directPrevChapter?.content.trim()
    ? extractEndingExcerpt(directPrevChapter.content)
    : undefined;

  const previousSummaries = recentChapters.map((chapter) => {
    const endingExcerpt = chapter.chapter_index === directPrevChapter?.chapter_index
      ? prevEndingExcerpt
      : undefined;
    if (chapter.summary) {
      return {
        chapterIndex: chapter.chapter_index,
        title: chapter.title,
        summary: `第 ${chapter.chapter_index} 章《${chapter.title}》：${chapter.summary.summary}`,
        endingExcerpt,
      };
    }
    return {
      chapterIndex: chapter.chapter_index,
      title: chapter.title,
      summary: formatPreviousChapter(chapter.chapter_index, chapter.title, chapter.content),
      endingExcerpt,
    };
  });

  return {
    bible,
    storyState: bible.story_state,
    volumeArc: opts?.volumeArc,
    outline: {
      chapterIndex,
      title: outlineChapter?.title ?? `第 ${chapterIndex} 章`,
      summary: outlineChapter?.summary,
    },
    novelSummary: opts?.novelSummary,
    volumeSummary: opts?.volumeSummary,
    priorVolumeSummaries: opts?.priorVolumeSummaries,
    previousSummaries,
    retrievedMemories: opts?.retrievedMemories ?? [],
    retrievalStatus: opts?.retrievalStatus ?? "empty",
    beatSheet: opts?.beatSheet,
  };
}
