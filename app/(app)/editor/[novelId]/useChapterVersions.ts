"use client";

import { useCallback, useState } from "react";

import {
  buildChapterVersionsRequest,
  deriveChapterStateFromDraft,
  patchChapterInList,
} from "@/lib/editor/chapterUtils";
import type { ChapterDraftView } from "./EditorClient";

type EditorStatus = "idle" | "saving" | "saved" | "drafting" | "error";
type ChapterEditorState = ReturnType<typeof deriveChapterStateFromDraft>;

export interface ChapterVersionView {
  id: string;
  chapter_id: string;
  title: string;
  content: string;
  status: string;
  source: string;
  created_at: string;
}

interface UseChapterVersionsOptions {
  chapterId?: string;
  conflictChapter: ChapterDraftView | null;
  resetEditorState(next: ChapterEditorState): void;
  setChapters(updater: (current: ChapterDraftView[]) => ChapterDraftView[]): void;
  setConflictChapter(value: ChapterDraftView | null): void;
  setStatus(value: EditorStatus): void;
  setMessage(value: string | undefined): void;
  setChapterVersion(value: number): void;
}

export function useChapterVersions({
  chapterId,
  conflictChapter,
  resetEditorState,
  setChapters,
  setConflictChapter,
  setStatus,
  setMessage,
  setChapterVersion,
}: UseChapterVersionsOptions) {
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versions, setVersions] = useState<ChapterVersionView[]>([]);
  const [versionsError, setVersionsError] = useState<string>();

  const openVersions = useCallback(async () => {
    if (!chapterId) {
      setVersionsError("章节尚未保存，暂无历史版本");
      setVersionsOpen(true);
      setVersions([]);
      return;
    }
    setVersionsOpen(true);
    setVersionsLoading(true);
    setVersionsError(undefined);
    try {
      const request = buildChapterVersionsRequest(chapterId);
      const response = await fetch(request.url);
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error?.message ?? "加载历史失败");
      }
      setVersions(json.data as ChapterVersionView[]);
    } catch (err) {
      setVersionsError(err instanceof Error ? err.message : "加载历史失败");
    } finally {
      setVersionsLoading(false);
    }
  }, [chapterId]);

  const closeVersions = useCallback(() => {
    setVersionsOpen(false);
  }, []);

  const applyRestoredChapter = useCallback(
    (restored: ChapterDraftView) => {
      if (restored.id !== chapterId) return;
      resetEditorState(deriveChapterStateFromDraft(restored, restored.title, restored.chapter_index));
      setChapters((current) => patchChapterInList(current, restored));
      setConflictChapter(null);
      setStatus("saved");
      setMessage("已恢复历史版本");
    },
    [
      chapterId,
      resetEditorState,
      setChapters,
      setConflictChapter,
      setMessage,
      setStatus,
    ],
  );

  const loadLatestChapter = useCallback(() => {
    if (!conflictChapter) return;
    applyRestoredChapter(conflictChapter);
    setMessage("已加载最新版本");
  }, [applyRestoredChapter, conflictChapter, setMessage]);

  const dismissConflict = useCallback(() => {
    if (conflictChapter && typeof conflictChapter.version === "number") {
      setChapterVersion(conflictChapter.version);
    }
    setConflictChapter(null);
  }, [conflictChapter, setChapterVersion, setConflictChapter]);

  return {
    versionsOpen,
    versionsLoading,
    versions,
    versionsError,
    openVersions,
    closeVersions,
    applyRestoredChapter,
    loadLatestChapter,
    dismissConflict,
  };
}
