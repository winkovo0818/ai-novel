import type { ChapterDraftView } from "@/app/(app)/editor/[novelId]/EditorClient";
import type { CandidateMode } from "@/app/(app)/editor/[novelId]/CandidatePanel";

export type ChapterStatus = "draft" | "done";

export interface ChapterEditorState {
  chapterId?: string;
  title: string;
  content: string;
  status: ChapterStatus;
  targetWords: number | null;
  lastSavedAt?: string;
  version: number;
}

/**
 * The user may deep-link a chapter via ?chapter=N in the URL. Fall back to
 * chapter 1 if the requested index doesn't exist in the bible outline.
 */
export function resolveStartIndex(
  outline: ReadonlyArray<{ index: number }>,
  requested: number | undefined,
): number {
  const want = requested ?? 1;
  return outline.some((c) => c.index === want) ? want : 1;
}

/**
 * Build the initial editor state for a chapter slot, whether or not a draft
 * has been persisted yet. Used both on hook mount and on selectChapter.
 */
export function deriveChapterStateFromDraft(
  draft: ChapterDraftView | undefined,
  outlineTitle: string | undefined,
  chapterIndex: number,
): ChapterEditorState {
  return {
    chapterId: draft?.id,
    title: draft?.title ?? outlineTitle ?? `第 ${chapterIndex} 章`,
    content: draft?.content ?? "",
    status: draft?.status === "done" ? "done" : "draft",
    targetWords: draft?.target_words ?? null,
    lastSavedAt: draft?.updated_at,
    version: draft?.version ?? 0,
  };
}

/**
 * Sort-aware upsert into the chapters list. When the chapter is brand new
 * we insert and re-sort by chapter_index so the sidebar stays ordered;
 * otherwise we patch in place.
 */
export function mergeChapterIntoList(
  current: ChapterDraftView[],
  next: ChapterDraftView,
): ChapterDraftView[] {
  const exists = current.some((c) => c.id === next.id);
  if (exists) return current.map((c) => (c.id === next.id ? next : c));
  return [...current, next].sort((a, b) => a.chapter_index - b.chapter_index);
}

/**
 * Compose the next chapter body when the user accepts an AI candidate.
 * `discard` is handled by the caller (no content change), so this helper
 * only deals with the three productive modes.
 */
export function applyAcceptMode(
  currentContent: string,
  candidateContent: string,
  mode: Exclude<CandidateMode, "discard">,
  cursorPos: number | null,
): string {
  if (mode === "replace") return candidateContent;
  if (mode === "append") {
    return currentContent
      ? `${currentContent.replace(/\s+$/, "")}\n\n${candidateContent}`
      : candidateContent;
  }
  // insert at cursor — clamp to [0, currentContent.length].
  const max = currentContent.length;
  const raw = cursorPos ?? max;
  const pos = Math.max(0, Math.min(raw, max));
  return `${currentContent.slice(0, pos)}${candidateContent}${currentContent.slice(pos)}`;
}
