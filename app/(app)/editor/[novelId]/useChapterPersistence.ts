"use client";

import { useCallback, useEffect } from "react";

import {
  buildOfflineChapterDraft,
  buildOfflineChapterDraftKey,
  buildPersistChapterRequest,
  buildStateDiffRequest,
  buildTargetWordsRequest,
  getChapterContentLimitState,
  getAutosaveDelayMs,
  hasStateDiffChanges,
  mergeChapterIntoList,
  shouldAutoSaveChapter,
} from "@/lib/editor/chapterUtils";
import type { ChapterEditorStatus } from "@/lib/editor/chapterUtils";
import type { StateDiff } from "@/lib/validation/schemas";
import type { ChapterDraftView } from "./EditorClient";

type ChapterStatus = "draft" | "done";
type SaveSource = "autosave" | "manual" | "ai";

interface ChapterPersistenceState {
  chapterId?: string;
  novelId: string;
  selectedIndex: number;
  chapterTitle: string;
  content: string;
  chapterStatus: ChapterStatus;
  savedStatus: ChapterStatus;
  chapterVersion: number;
  targetWords: number | null;
  hasUnsavedChanges: boolean;
  status: ChapterEditorStatus;
  online: boolean;
}

interface ChapterPersistenceSetters {
  setChapterId(value: string | undefined): void;
  setSavedTitle(value: string): void;
  setSavedContent(value: string): void;
  setSavedStatus(value: ChapterStatus): void;
  setTargetWordsState(value: number | null): void;
  setLastSavedAt(value: string | undefined): void;
  setStatus(value: ChapterEditorStatus): void;
  setMessage(value: string | undefined): void;
  setChapterVersion(value: number): void;
  setConflictChapter(value: ChapterDraftView | null): void;
  setChapters(updater: (current: ChapterDraftView[]) => ChapterDraftView[]): void;
  setPendingStateDiff(value: StateDiff | null): void;
  setPendingStateDiffChapterIndex(value: number): void;
  setAutoStateDiffError(value: { message: string; chapterIndex: number } | null): void;
}

interface UseChapterPersistenceOptions {
  state: ChapterPersistenceState;
  setters: ChapterPersistenceSetters;
}

export function useChapterPersistence({
  state,
  setters,
}: UseChapterPersistenceOptions) {
  const {
    chapterId,
    novelId,
    selectedIndex,
    chapterTitle,
    content,
    chapterStatus,
    savedStatus,
    chapterVersion,
    targetWords,
    hasUnsavedChanges,
    status,
    online,
  } = state;
  const {
    setChapterId,
    setSavedTitle,
    setSavedContent,
    setSavedStatus,
    setTargetWordsState,
    setLastSavedAt,
    setStatus,
    setMessage,
    setChapterVersion,
    setConflictChapter,
    setChapters,
    setPendingStateDiff,
    setPendingStateDiffChapterIndex,
    setAutoStateDiffError,
  } = setters;

  const persistChapter = useCallback(
    async (
      nextContent: string,
      nextTitle = chapterTitle,
      nextStatus = chapterStatus,
      source: SaveSource = "autosave",
      expectedVersion = chapterVersion,
    ) => {
      const limit = getChapterContentLimitState(nextContent);
      if (limit.level === "over") {
        throw new Error(limit.message ?? "章节正文超过 80,000 字上限");
      }

      const request = buildPersistChapterRequest({
        chapterId,
        novelId,
        selectedIndex,
        title: nextTitle,
        content: nextContent,
        status: nextStatus,
        source,
        expectedVersion,
      });
      const response = await fetch(request.url, {
        method: request.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request.payload),
      });
      const json = await response.json();

      if (response.status === 409 && json.error?.code === "CHAPTER_VERSION_CONFLICT") {
        if (json.data) setConflictChapter(json.data as ChapterDraftView);
        const conflictError = new Error(json.error.message ?? "章节已被另一处修改");
        conflictError.name = "ChapterVersionConflict";
        throw conflictError;
      }

      if (!json.ok) {
        throw new Error(json.error?.message ?? "保存失败");
      }

      setChapterId(json.data.id);
      setSavedTitle(nextTitle);
      setSavedContent(nextContent);
      setSavedStatus(nextStatus);
      if (typeof json.data.version === "number") setChapterVersion(json.data.version);
      if (json.data.updated_at) setLastSavedAt(json.data.updated_at);
      if (json.data.target_words !== undefined) {
        setTargetWordsState(json.data.target_words);
      }
      setChapters((current) => mergeChapterIntoList(current, json.data as ChapterDraftView));

      const targetId = json.data.id as string;
      if (savedStatus !== "done" && nextStatus === "done") {
        void generateAutoStateDiff({
          chapterId: targetId,
          chapterIndex: selectedIndex,
          setPendingStateDiff,
          setPendingStateDiffChapterIndex,
          setAutoStateDiffError,
        });
      }

      return json.data as ChapterDraftView;
    },
    [
      chapterId,
      chapterStatus,
      chapterTitle,
      chapterVersion,
      novelId,
      savedStatus,
      selectedIndex,
      setAutoStateDiffError,
      setChapterId,
      setChapterVersion,
      setChapters,
      setConflictChapter,
      setLastSavedAt,
      setPendingStateDiff,
      setPendingStateDiffChapterIndex,
      setSavedContent,
      setSavedStatus,
      setSavedTitle,
      setTargetWordsState,
    ],
  );

  useEffect(() => {
    if (!online) {
      if (hasUnsavedChanges && status !== "offline") {
        setStatus("offline");
        setMessage("网络已断开，恢复连接后再保存");
      }
      if (hasUnsavedChanges && typeof window !== "undefined") {
        const draft = buildOfflineChapterDraft({
          novelId,
          chapterIndex: selectedIndex,
          chapterId,
          title: chapterTitle,
          content,
          status: chapterStatus,
          version: chapterVersion,
        });
        window.localStorage.setItem(
          buildOfflineChapterDraftKey(novelId, selectedIndex),
          JSON.stringify(draft),
        );
      }
      return;
    }

    if (status === "offline") {
      setMessage(hasUnsavedChanges ? "网络已恢复，请处理本地草稿后同步" : undefined);
      return;
    }

    if (!shouldAutoSaveChapter({ hasUnsavedChanges, status, title: chapterTitle })) return;

    const timeout = window.setTimeout(async () => {
      setStatus("saving");
      setMessage("自动保存中...");
      try {
        await persistChapter(content, chapterTitle, chapterStatus, "autosave");
        setStatus("saved");
        setMessage("已自动保存");
      } catch (err) {
        setStatus(err instanceof Error && err.name === "ChapterVersionConflict" ? "conflict" : "error");
        setMessage(err instanceof Error ? err.message : "自动保存失败");
      }
    }, getAutosaveDelayMs(content.length));

    return () => window.clearTimeout(timeout);
  }, [
    chapterId,
    chapterStatus,
    chapterTitle,
    chapterVersion,
    content,
    hasUnsavedChanges,
    novelId,
    online,
    persistChapter,
    selectedIndex,
    setMessage,
    setStatus,
    status,
  ]);

  const setTargetWords = useCallback(
    async (value: number | null) => {
      if (value === targetWords) return;
      setTargetWordsState(value);
      if (!chapterId) return;
      try {
        const request = buildTargetWordsRequest(chapterId, value, chapterVersion);
        const response = await fetch(request.url, {
          method: request.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request.payload),
        });
        const json = await response.json();
        if (response.status === 409 && json.error?.code === "CHAPTER_VERSION_CONFLICT") {
          if (json.data) setConflictChapter(json.data as ChapterDraftView);
          throw new Error(json.error.message ?? "章节已被另一处修改");
        }
        if (!json.ok) throw new Error(json.error?.message ?? "目标字数保存失败");
        if (typeof json.data.version === "number") setChapterVersion(json.data.version);
        if (json.data.updated_at) setLastSavedAt(json.data.updated_at);
      } catch (err) {
        setStatus(err instanceof Error && err.message.includes("另一处修改") ? "conflict" : "error");
        setMessage(err instanceof Error ? err.message : "目标字数保存失败");
      }
    },
    [
      chapterId,
      chapterVersion,
      setChapterVersion,
      setConflictChapter,
      setLastSavedAt,
      setMessage,
      setStatus,
      setTargetWordsState,
      targetWords,
    ],
  );

  const saveChapter = useCallback(async () => {
    if (!online) {
      setStatus("offline");
      setMessage("网络已断开，恢复连接后再保存");
      return;
    }

    setStatus("saving");
    setMessage(undefined);

    try {
      await persistChapter(content, chapterTitle, chapterStatus, "manual");
      setStatus("saved");
      setMessage("草稿已保存");
    } catch (err) {
      setStatus(err instanceof Error && err.name === "ChapterVersionConflict" ? "conflict" : "error");
      setMessage(err instanceof Error ? err.message : "保存失败");
    }
  }, [chapterStatus, chapterTitle, content, online, persistChapter, setMessage, setStatus]);

  return {
    persistChapter,
    saveChapter,
    setTargetWords,
  };
}

async function generateAutoStateDiff(input: {
  chapterId: string;
  chapterIndex: number;
  setPendingStateDiff(value: StateDiff | null): void;
  setPendingStateDiffChapterIndex(value: number): void;
  setAutoStateDiffError(value: { message: string; chapterIndex: number } | null): void;
}) {
  try {
    const request = buildStateDiffRequest(input.chapterId);
    const res = await fetch(request.url, { method: request.method });
    const stateDiffJson = await res.json();
    if (!res.ok || !stateDiffJson.ok) {
      const message =
        stateDiffJson?.error?.message ?? "状态分析自动生成失败,请手动重试";
      input.setAutoStateDiffError({ message, chapterIndex: input.chapterIndex });
      return;
    }
    const diff = stateDiffJson.data as StateDiff;
    if (hasStateDiffChanges(diff)) {
      input.setPendingStateDiff(diff);
      input.setPendingStateDiffChapterIndex(input.chapterIndex);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "状态分析自动生成失败,请手动重试";
    input.setAutoStateDiffError({ message, chapterIndex: input.chapterIndex });
  }
}
