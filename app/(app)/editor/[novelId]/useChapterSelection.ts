"use client";

import { useCallback } from "react";

import { deriveChapterStateFromDraft } from "@/lib/editor/chapterUtils";
import type { ChapterEditorStatus } from "@/lib/editor/chapterUtils";
import type { ChapterDraftView } from "./EditorClient";

type ChapterEditorState = ReturnType<typeof deriveChapterStateFromDraft>;

interface ChapterOutlineSlot {
  index: number;
  title?: string;
}

interface UseChapterSelectionOptions {
  chapters: ChapterDraftView[];
  outlineChapters: ChapterOutlineSlot[];
  selectedIndex: number;
  hasUnsavedChanges: boolean;
  candidateContent: string;
  confirm(input: {
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
  }): Promise<boolean>;
  clearCandidate(): void;
  resetEditorState(next: ChapterEditorState): void;
  setSelectedIndex(value: number): void;
  setConflictChapter(value: ChapterDraftView | null): void;
  setStatus(value: ChapterEditorStatus): void;
  setMessage(value: string | undefined): void;
}

export function useChapterSelection({
  chapters,
  outlineChapters,
  selectedIndex,
  hasUnsavedChanges,
  candidateContent,
  confirm,
  clearCandidate,
  resetEditorState,
  setSelectedIndex,
  setConflictChapter,
  setStatus,
  setMessage,
}: UseChapterSelectionOptions) {
  const selectChapter = useCallback(
    async (index: number) => {
      if (index === selectedIndex) return;
      if (
        hasUnsavedChanges &&
        !(await confirm({
          title: "切换章节？",
          message: "当前章节有未保存修改，切换后会丢失。",
          confirmLabel: "切换并丢弃",
          danger: true,
        }))
      ) {
        return;
      }
      if (
        candidateContent &&
        !(await confirm({
          title: "切换章节将丢弃 AI 候选稿？",
          message: "当前章节有未处理的 AI 候选稿，切换章节会丢弃它。",
          confirmLabel: "切换并丢弃",
          danger: true,
        }))
      ) {
        return;
      }
      clearCandidate();

      const draft = chapters.find((chapter) => chapter.chapter_index === index);
      const outline = outlineChapters.find((chapter) => chapter.index === index);
      const next = deriveChapterStateFromDraft(draft, outline?.title, index);

      setSelectedIndex(index);
      resetEditorState(next);
      setConflictChapter(null);
      setStatus("clean");
      setMessage(undefined);
    },
    [
      candidateContent,
      chapters,
      clearCandidate,
      confirm,
      hasUnsavedChanges,
      outlineChapters,
      resetEditorState,
      selectedIndex,
      setConflictChapter,
      setMessage,
      setSelectedIndex,
      setStatus,
    ],
  );

  return { selectChapter };
}
