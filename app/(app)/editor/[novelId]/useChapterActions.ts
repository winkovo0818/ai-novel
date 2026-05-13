"use client";

import { useCallback, useState } from "react";

import {
  buildConsistencyRequest,
  buildDeleteChapterRequest,
  deriveChapterStateFromDraft,
} from "@/lib/editor/chapterUtils";
import type { ChapterDraftView } from "./EditorClient";

type EditorStatus = "idle" | "saving" | "saved" | "drafting" | "error";
type ChapterEditorState = ReturnType<typeof deriveChapterStateFromDraft>;

export interface ConsistencyIssue {
  type: string;
  chapter: number;
  description: string;
}

export interface ConsistencyResult {
  consistent: boolean;
  issues?: ConsistencyIssue[];
}

interface UseChapterActionsOptions {
  novelId: string;
  selectedIndex: number;
  chapterId?: string;
  chapterTitle: string;
  selectedOutlineTitle?: string;
  confirm(input: {
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
  }): Promise<boolean>;
  resetEditorState(next: ChapterEditorState): void;
  setChapters(updater: (current: ChapterDraftView[]) => ChapterDraftView[]): void;
  setStatus(value: EditorStatus): void;
  setMessage(value: string | undefined): void;
}

export function useChapterActions({
  novelId,
  selectedIndex,
  chapterId,
  chapterTitle,
  selectedOutlineTitle,
  confirm,
  resetEditorState,
  setChapters,
  setStatus,
  setMessage,
}: UseChapterActionsOptions) {
  const [consistencyRunning, setConsistencyRunning] = useState(false);
  const [consistencyResult, setConsistencyResult] = useState<ConsistencyResult>();
  const [consistencyError, setConsistencyError] = useState<string>();

  const deleteChapter = useCallback(async () => {
    if (!chapterId) return;
    if (
      !(await confirm({
        title: `删除第 ${selectedIndex} 章「${chapterTitle}」？`,
        message: "此操作不可撤销，章节正文与历史版本一并清空。",
        confirmLabel: "删除",
        danger: true,
      }))
    ) {
      return;
    }

    try {
      const request = buildDeleteChapterRequest(chapterId);
      const response = await fetch(request.url, { method: request.method });
      const json = await response.json();

      if (!json.ok) {
        throw new Error(json.error?.message ?? "删除失败");
      }

      setChapters((current) => current.filter((chapter) => chapter.id !== chapterId));
      resetEditorState(deriveChapterStateFromDraft(undefined, selectedOutlineTitle, selectedIndex));
      setStatus("idle");
      setMessage("章节已删除");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "删除失败");
    }
  }, [
    chapterId,
    chapterTitle,
    confirm,
    resetEditorState,
    selectedIndex,
    selectedOutlineTitle,
    setChapters,
    setMessage,
    setStatus,
  ]);

  const runConsistency = useCallback(async () => {
    setConsistencyRunning(true);
    setConsistencyError(undefined);
    setConsistencyResult(undefined);
    try {
      const request = buildConsistencyRequest(novelId);
      const response = await fetch(request.url, { method: request.method });
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error?.message ?? "一致性检查失败");
      }
      setConsistencyResult(json.data as ConsistencyResult);
    } catch (err) {
      setConsistencyError(err instanceof Error ? err.message : "一致性检查失败");
    } finally {
      setConsistencyRunning(false);
    }
  }, [novelId]);

  return {
    deleteChapter,
    consistencyRunning,
    consistencyResult,
    consistencyError,
    runConsistency,
  };
}
