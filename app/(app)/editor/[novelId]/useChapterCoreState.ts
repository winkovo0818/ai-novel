"use client";

import { useCallback, useState } from "react";

import { deriveChapterStateFromDraft } from "@/lib/editor/chapterUtils";

type ChapterStatus = "draft" | "done";
type EditorStatus = "idle" | "saving" | "saved" | "drafting" | "error";
type ChapterEditorState = ReturnType<typeof deriveChapterStateFromDraft>;

export function useChapterCoreState(initialState: ChapterEditorState) {
  const [chapterId, setChapterId] = useState(initialState.chapterId);
  const [chapterTitle, setChapterTitle] = useState(initialState.title);
  const [content, setContent] = useState(initialState.content);
  const [chapterStatus, setChapterStatus] = useState<ChapterStatus>(initialState.status);
  const [savedTitle, setSavedTitle] = useState(initialState.title);
  const [savedContent, setSavedContent] = useState(initialState.content);
  const [savedStatus, setSavedStatus] = useState<ChapterStatus>(initialState.status);
  const [targetWords, setTargetWordsState] = useState<number | null>(initialState.targetWords);
  const [lastSavedAt, setLastSavedAt] = useState<string | undefined>(initialState.lastSavedAt);
  const [status, setStatus] = useState<EditorStatus>("idle");
  const [message, setMessage] = useState<string>();
  const [chapterVersion, setChapterVersion] = useState<number>(initialState.version);

  const resetEditorState = useCallback((next: ChapterEditorState) => {
    setChapterId(next.chapterId);
    setChapterTitle(next.title);
    setContent(next.content);
    setChapterStatus(next.status);
    setSavedTitle(next.title);
    setSavedContent(next.content);
    setSavedStatus(next.status);
    setTargetWordsState(next.targetWords);
    setLastSavedAt(next.lastSavedAt);
    setChapterVersion(next.version);
  }, []);

  return {
    chapterId,
    setChapterId,
    chapterTitle,
    setChapterTitle,
    content,
    setContent,
    chapterStatus,
    setChapterStatus,
    savedTitle,
    setSavedTitle,
    savedContent,
    setSavedContent,
    savedStatus,
    setSavedStatus,
    targetWords,
    setTargetWordsState,
    lastSavedAt,
    setLastSavedAt,
    status,
    setStatus,
    message,
    setMessage,
    chapterVersion,
    setChapterVersion,
    resetEditorState,
  };
}
