import { getAllChapters, type BibleDraft } from "@/lib/validation/schemas";

export type StoryTimelineEventKind =
  | "outline"
  | "draft"
  | "story"
  | "plot_thread"
  | "foreshadowing"
  | "relationship";

export interface StoryTimelineDraft {
  chapter_index: number;
  title: string;
  content: string;
  status: string;
  updated_at: Date | string;
}

export interface StoryTimelineEvent {
  id: string;
  kind: StoryTimelineEventKind;
  label: string;
  title: string;
  description?: string;
  chapterIndex: number;
  status?: string;
}

export interface StoryTimelineChapter {
  chapterIndex: number;
  title: string;
  outlineSummary?: string;
  draftTitle?: string;
  draftStatus?: string;
  wordCount: number;
  updatedAt?: string;
  events: StoryTimelineEvent[];
}

export interface StoryTimelineReport {
  chapters: StoryTimelineChapter[];
  unplaced: StoryTimelineEvent[];
  summary: {
    plannedChapters: number;
    draftedChapters: number;
    storyEvents: number;
    openThreads: number;
    unresolvedForeshadowing: number;
  };
}

export function buildStoryTimeline(
  bible: BibleDraft,
  drafts: StoryTimelineDraft[],
): StoryTimelineReport {
  const plannedChapters = getAllChapters(bible);
  const chapters = new Map<number, StoryTimelineChapter>();

  for (const chapter of plannedChapters) {
    ensureChapter(chapters, chapter.index, chapter.title).outlineSummary = chapter.summary;
    addEvent(chapters, chapter.index, {
      id: `outline-${chapter.index}`,
      kind: "outline",
      label: "大纲",
      title: chapter.title,
      description: chapter.summary,
      chapterIndex: chapter.index,
    });
  }

  for (const draft of drafts) {
    const row = ensureChapter(chapters, draft.chapter_index, draft.title);
    row.draftTitle = draft.title;
    row.draftStatus = draft.status;
    row.wordCount = countTextChars(draft.content);
    row.updatedAt = toIso(draft.updated_at);
    addEvent(chapters, draft.chapter_index, {
      id: `draft-${draft.chapter_index}`,
      kind: "draft",
      label: draft.status === "done" ? "正文完成" : "正文草稿",
      title: draft.title,
      description: row.wordCount > 0 ? `${row.wordCount} 字` : "尚无正文",
      chapterIndex: draft.chapter_index,
      status: draft.status,
    });
  }

  const unplaced: StoryTimelineEvent[] = [];
  const state = bible.story_state;

  for (const [index, event] of (state?.timeline ?? []).entries()) {
    addEvent(chapters, event.chapter_index, {
      id: `story-${event.chapter_index}-${index}`,
      kind: "story",
      label: "事件",
      title: event.event,
      description: event.impact,
      chapterIndex: event.chapter_index,
    });
  }

  for (const thread of state?.plot_threads ?? []) {
    if (thread.introduced_in) {
      addEvent(chapters, thread.introduced_in, {
        id: `plot-introduced-${thread.id}`,
        kind: "plot_thread",
        label: "线索开启",
        title: thread.title,
        description: thread.notes,
        chapterIndex: thread.introduced_in,
        status: thread.status,
      });
    }
    if (thread.resolved_in) {
      addEvent(chapters, thread.resolved_in, {
        id: `plot-resolved-${thread.id}`,
        kind: "plot_thread",
        label: "线索回收",
        title: thread.title,
        description: thread.notes,
        chapterIndex: thread.resolved_in,
        status: thread.status,
      });
    }
    if (!thread.introduced_in && !thread.resolved_in) {
      unplaced.push({
        id: `plot-unplaced-${thread.id}`,
        kind: "plot_thread",
        label: "未定位线索",
        title: thread.title,
        description: thread.notes,
        chapterIndex: 0,
        status: thread.status,
      });
    }
  }

  for (const clue of state?.foreshadowing ?? []) {
    if (clue.introduced_in) {
      addEvent(chapters, clue.introduced_in, {
        id: `foreshadowing-introduced-${clue.id}`,
        kind: "foreshadowing",
        label: "伏笔埋设",
        title: clue.clue,
        description: clue.payoff_hint ?? clue.notes,
        chapterIndex: clue.introduced_in,
        status: clue.status,
      });
    }
    if (clue.resolved_in) {
      addEvent(chapters, clue.resolved_in, {
        id: `foreshadowing-resolved-${clue.id}`,
        kind: "foreshadowing",
        label: "伏笔回收",
        title: clue.clue,
        description: clue.notes,
        chapterIndex: clue.resolved_in,
        status: clue.status,
      });
    }
    if (!clue.introduced_in && !clue.resolved_in) {
      unplaced.push({
        id: `foreshadowing-unplaced-${clue.id}`,
        kind: "foreshadowing",
        label: "未定位伏笔",
        title: clue.clue,
        description: clue.payoff_hint ?? clue.notes,
        chapterIndex: 0,
        status: clue.status,
      });
    }
  }

  for (const [index, relationship] of (state?.relationships ?? []).entries()) {
    if (!relationship.updated_in) continue;
    addEvent(chapters, relationship.updated_in, {
      id: `relationship-${relationship.updated_in}-${index}`,
      kind: "relationship",
      label: "关系变化",
      title: `${relationship.from} / ${relationship.to}`,
      description: [relationship.status, relationship.notes].filter(Boolean).join(" · "),
      chapterIndex: relationship.updated_in,
      status: relationship.status,
    });
  }

  return {
    chapters: [...chapters.values()].sort((a, b) => a.chapterIndex - b.chapterIndex),
    unplaced,
    summary: {
      plannedChapters: plannedChapters.length,
      draftedChapters: drafts.length,
      storyEvents: state?.timeline?.length ?? 0,
      openThreads: (state?.plot_threads ?? []).filter((thread) => thread.status !== "resolved").length,
      unresolvedForeshadowing: (state?.foreshadowing ?? []).filter(
        (clue) => clue.status !== "resolved" && clue.status !== "revealed",
      ).length,
    },
  };
}

function ensureChapter(
  chapters: Map<number, StoryTimelineChapter>,
  chapterIndex: number,
  title: string,
): StoryTimelineChapter {
  const existing = chapters.get(chapterIndex);
  if (existing) return existing;
  const row: StoryTimelineChapter = {
    chapterIndex,
    title,
    wordCount: 0,
    events: [],
  };
  chapters.set(chapterIndex, row);
  return row;
}

function addEvent(
  chapters: Map<number, StoryTimelineChapter>,
  chapterIndex: number,
  event: StoryTimelineEvent,
) {
  ensureChapter(chapters, chapterIndex, `第 ${chapterIndex} 章`).events.push(event);
}

function countTextChars(text: string): number {
  return Array.from(text.replace(/\s/g, "")).length;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
