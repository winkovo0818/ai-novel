"use client";

import { useEffect, useState } from "react";

import { getAllChapters } from "@/lib/validation/schemas";
import type { BibleDraft } from "@/lib/validation/schemas";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
  deriveChapterStateFromDraft,
  hasUnsavedChapterChanges,
  resolveStartIndex,
} from "@/lib/editor/chapterUtils";
import type { ChapterDraftView } from "./EditorClient";
import { useChapterActions } from "./useChapterActions";
import { useChapterBeatSheet } from "./useChapterBeatSheet";
import { useChapterCoreState } from "./useChapterCoreState";
import { useChapterDrafting } from "./useChapterDrafting";
import { useChapterPersistence } from "./useChapterPersistence";
import { useChapterSelection } from "./useChapterSelection";
import { useChapterStateDiff } from "./useChapterStateDiff";
import { useChapterVersions } from "./useChapterVersions";

interface UseChapterEditorOptions {
  novelId: string;
  bible: BibleDraft;
  initialChapters: ChapterDraftView[];
  initialChapterIndex?: number;
}

/**
 * Central orchestrator for the chapter editor.  Composes eight sub-hooks
 * in a deliberate order and wires their interdependencies via explicit
 * hand-off:
 *
 *   CoreState -> Persistence -> Drafting -> Actions
 *                       |            |
 *                       v            v
 *                   Selection    BeatSheet
 *                   StateDiff
 *                   Versions
 *
 * Inter-hook bridging rule:
 *   Each sub-hook exports callbacks the orchestrator passes to the next.
 *   Hooks never import each other directly — that avoids circular deps
 *   and keeps each hook independently testable.  When adding a new hook
 *   that consumes another hook'''s output, wire it here, not inside the
 *   sub-hook.
 */
export function useChapterEditor({ novelId, bible, initialChapters, initialChapterIndex }: UseChapterEditorOptions) {
  const confirm = useConfirm();
  const allOutlineChapters = getAllChapters(bible);
  const startIndex = resolveStartIndex(
    allOutlineChapters.map((c) => ({ index: c.index })),
    initialChapterIndex,
  );
  const startOutline = allOutlineChapters.find((c) => c.index === startIndex) ?? allOutlineChapters[0];
  const startDraft = initialChapters.find((chapter) => chapter.chapter_index === startIndex);
  const startState = deriveChapterStateFromDraft(startDraft, startOutline?.title, startIndex);
  const [chapters, setChapters] = useState(initialChapters);
  const [selectedIndex, setSelectedIndex] = useState(startIndex);
  const selectedDraft = chapters.find((chapter) => chapter.chapter_index === selectedIndex);
  const selectedOutline = allOutlineChapters.find((chapter) => chapter.index === selectedIndex) ?? startOutline;
  const core = useChapterCoreState(startState);
  // M3.6 optimistic-lock state. Hydrated from the chapter row on selection
  // and updated from every successful PATCH/POST/restore response. When the
  // server responds 409 we stash the latest row in conflictChapter so the
  // editor can render a "load latest" banner.
  const [conflictChapter, setConflictChapter] = useState<ChapterDraftView | null>(null);
  const hasUnsavedChanges = hasUnsavedChapterChanges(
    { title: core.chapterTitle, content: core.content, status: core.chapterStatus },
    { title: core.savedTitle, content: core.savedContent, status: core.savedStatus },
  );
  const characterCount = core.content.replace(/\s/g, "").length;

  const {
    stateDiffOpen,
    stateDiffLoading,
    stateDiff,
    stateDiffError,
    generateStateDiff,
    closeStateDiff,
    pendingStateDiff,
    pendingStateDiffChapterIndex,
    setPendingStateDiff,
    setPendingStateDiffChapterIndex,
    openPendingStateDiff,
    autoStateDiffError,
    setAutoStateDiffError,
    dismissAutoStateDiffError,
  } = useChapterStateDiff({ chapterId: core.chapterId });

  const { persistChapter, saveChapter, setTargetWords } = useChapterPersistence({
    state: {
      chapterId: core.chapterId,
      novelId,
      selectedIndex,
      chapterTitle: core.chapterTitle,
      content: core.content,
      chapterStatus: core.chapterStatus,
      savedStatus: core.savedStatus,
      chapterVersion: core.chapterVersion,
      targetWords: core.targetWords,
      hasUnsavedChanges,
      status: core.status,
    },
    setters: {
      setChapterId: core.setChapterId,
      setSavedTitle: core.setSavedTitle,
      setSavedContent: core.setSavedContent,
      setSavedStatus: core.setSavedStatus,
      setTargetWordsState: core.setTargetWordsState,
      setLastSavedAt: core.setLastSavedAt,
      setStatus: core.setStatus,
      setMessage: core.setMessage,
      setChapterVersion: core.setChapterVersion,
      setConflictChapter,
      setChapters,
      setPendingStateDiff,
      setPendingStateDiffChapterIndex,
      setAutoStateDiffError,
    },
  });

  const {
    candidateOpen,
    candidateContent,
    candidateStreaming,
    candidateCriticLoading,
    candidateCriticResult,
    candidateCriticError,
    candidateRevisionLoading,
    clearCandidate,
    draftChapter,
    reviseCandidate,
    feedbackRevise,
    setCursorPos,
    acceptCandidate,
    lastRetrievalStatus,
    lastRetrievedMemories,
    lastRetrievalError,
    draftSessionId,
    resumableDraft,
    applyResumableDraft,
    dismissResumableDraft,
    criticFailure,
    criticRetrying,
    retryLastCritic,
    dismissCriticFailure,
  } = useChapterDrafting({
    novelId,
    selectedIndex,
    chapterId: core.chapterId,
    chapterTitle: core.chapterTitle,
    content: core.content,
    chapterStatus: core.chapterStatus,
    persistChapter,
    setContent: core.setContent,
    setStatus: core.setStatus,
    setMessage: core.setMessage,
  });

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const { selectChapter } = useChapterSelection({
    chapters,
    outlineChapters: allOutlineChapters,
    selectedIndex,
    hasUnsavedChanges,
    candidateContent,
    confirm,
    clearCandidate,
    resetEditorState: core.resetEditorState,
    setSelectedIndex,
    setConflictChapter,
    setStatus: core.setStatus,
    setMessage: core.setMessage,
  });

  const {
    deleteChapter,
    consistencyRunning,
    consistencyResult,
    consistencyError,
    runConsistency,
  } = useChapterActions({
    novelId,
    selectedIndex,
    chapterId: core.chapterId,
    chapterTitle: core.chapterTitle,
    selectedOutlineTitle: selectedOutline?.title,
    confirm,
    resetEditorState: core.resetEditorState,
    setChapters,
    setStatus: core.setStatus,
    setMessage: core.setMessage,
  });

  const {
    versionsOpen,
    versionsLoading,
    versions,
    versionsError,
    openVersions,
    closeVersions,
    applyRestoredChapter,
    loadLatestChapter,
    dismissConflict,
  } = useChapterVersions({
    chapterId: core.chapterId,
    conflictChapter,
    resetEditorState: core.resetEditorState,
    setChapters,
    setConflictChapter,
    setStatus: core.setStatus,
    setMessage: core.setMessage,
    setChapterVersion: core.setChapterVersion,
  });

  const {
    beats,
    beatsLoading,
    beatsError,
    generateBeatSheet,
    setBeats,
    clearBeats,
    draftWithBeats,
  } = useChapterBeatSheet({
    novelId,
    selectedIndex,
    chapterTitle: core.chapterTitle,
    draftChapter,
  });

  return {
    chapters,
    selectedIndex,
    selectedDraft,
    selectedOutline,
    chapterTitle: core.chapterTitle,
    setChapterTitle: core.setChapterTitle,
    content: core.content,
    setContent: core.setContent,
    chapterStatus: core.chapterStatus,
    setChapterStatus: core.setChapterStatus,
    status: core.status,
    setStatus: core.setStatus,
    message: core.message,
    hasUnsavedChanges,
    characterCount,
    selectChapter,
    saveChapter,
    draftChapter,
    deleteChapter,
    consistencyRunning,
    consistencyResult,
    consistencyError,
    runConsistency,
    versionsOpen,
    versionsLoading,
    versions,
    versionsError,
    openVersions,
    closeVersions,
    applyRestoredChapter,
    chapterId: core.chapterId,
    stateDiffOpen,
    stateDiffLoading,
    stateDiff,
    stateDiffError,
    generateStateDiff,
    closeStateDiff,
    pendingStateDiff,
    pendingStateDiffChapterIndex,
    openPendingStateDiff,
    autoStateDiffError,
    dismissAutoStateDiffError,
    // M1.3 candidate flow
    candidateOpen,
    candidateContent,
    candidateStreaming,
    candidateCriticLoading,
    candidateCriticResult,
    candidateCriticError,
    candidateRevisionLoading,
    reviseCandidate,
    feedbackRevise,
    setCursorPos,
    acceptCandidate,
    // M1.5 writing tools
    targetWords: core.targetWords,
    setTargetWords,
    lastSavedAt: core.lastSavedAt,
    // M2.2 beat sheet
    beats,
    beatsLoading,
    beatsError,
    generateBeatSheet,
    setBeats,
    clearBeats,
    draftWithBeats,
    // M2.5 retrieval visibility
    lastRetrievalStatus,
    // M3.4 retrieval transparency: actual chunks fed into the LLM
    lastRetrievedMemories,
    lastRetrievalError,
    // M3.6 optimistic-lock conflict handling
    chapterVersion: core.chapterVersion,
    conflictChapter,
    loadLatestChapter,
    dismissConflict,
    // UX3 resumable draft sessions
    draftSessionId,
    resumableDraft,
    applyResumableDraft,
    dismissResumableDraft,
    // P1-6 persistent critic failure
    criticFailure,
    criticRetrying,
    retryLastCritic,
    dismissCriticFailure,
  };
}
