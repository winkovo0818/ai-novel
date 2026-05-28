"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
  applyAcceptMode,
  applyDraftSseEvent,
  buildCandidateCriticRequest,
  buildCandidateRevisionRequest,
  buildDraftChapterRequest,
  buildLocalRevisionRequest,
  buildResumableDraftRequest,
  candidateAcceptedMessage,
  normalizeResumableDraftPayload,
  resolveSettledChapterStatus,
  resumableDraftLoadedMessage,
  type ChapterEditorStatus,
  type DraftCandidate,
  type EditorSelection,
  type DraftSseState,
  type RetrievalExplanationPreview,
  type RetrievedMemoryPreview,
} from "@/lib/editor/chapterUtils";
import { readSse } from "@/lib/stream/readSse";
import type { ChapterRevisionOperation } from "@/lib/validation/schemas";
import type { BeatItem } from "./BeatSheetPanel";
import type {
  CandidateCriticResult,
  CandidateMode,
} from "./CandidatePanel";
import type { ChapterDraftView } from "./EditorClient";

type ChapterStatus = "draft" | "done";
type SaveSource = "autosave" | "manual" | "ai";
type DraftMemory = RetrievedMemoryPreview;
const LOCAL_REVISION_CONTEXT_CHARS = 4_000;
type PersistChapter = (
  nextContent: string,
  nextTitle?: string,
  nextStatus?: ChapterStatus,
  source?: SaveSource,
  expectedVersion?: number,
) => Promise<ChapterDraftView>;

interface UseChapterDraftingOptions {
  novelId: string;
  selectedIndex: number;
  chapterId?: string;
  chapterTitle: string;
  content: string;
  chapterStatus: ChapterStatus;
  hasUnsavedChanges: boolean;
  persistChapter: PersistChapter;
  setContent(value: string): void;
  setStatus(value: ChapterEditorStatus): void;
  setMessage(value: string | undefined): void;
}

export function useChapterDrafting({
  novelId,
  selectedIndex,
  chapterId,
  chapterTitle,
  content,
  chapterStatus,
  hasUnsavedChanges,
  persistChapter,
  setContent,
  setStatus,
  setMessage,
}: UseChapterDraftingOptions) {
  const confirm = useConfirm();
  const [candidateContent, setCandidateContent] = useState<string>("");
  const [candidateOpen, setCandidateOpen] = useState(false);
  const [candidateStreaming, setCandidateStreaming] = useState(false);
  const [candidateCriticLoading, setCandidateCriticLoading] = useState(false);
  const [candidateCriticResult, setCandidateCriticResult] = useState<CandidateCriticResult>();
  const [candidateCriticError, setCandidateCriticError] = useState<string>();
  const [candidateRevisionLoading, setCandidateRevisionLoading] = useState(false);
  const [localRevisionLoading, setLocalRevisionLoading] = useState(false);
  const [localRevisionError, setLocalRevisionError] = useState<string>();
  // P1-6: critic failure that persists after the candidate panel closes.
  // When critic fails, candidateCriticError is shown in-panel BUT the panel can
  // close (X / discard / accept) and the error would be gone. We mirror it into
  // criticFailure so the editor header can keep showing a "审校未完成 · 点击重试"
  // badge until the user retries or switches chapters.
  const [criticFailure, setCriticFailure] = useState<{
    message: string;
    chapterIndex: number;
  } | null>(null);
  const [criticRetrying, setCriticRetrying] = useState(false);
  const [lastRetrievalStatus, setLastRetrievalStatus] = useState<string>();
  const [lastRetrievalExplanation, setLastRetrievalExplanation] = useState<RetrievalExplanationPreview>();
  const [lastRetrievedMemories, setLastRetrievedMemories] = useState<
    RetrievedMemoryPreview[]
  >([]);
  const [candidates, setCandidates] = useState<DraftCandidate[]>();
  const [lastRetrievalError, setLastRetrievalError] = useState<string>();
  const [candidateStreamError, setCandidateStreamError] = useState<string>();
  const [candidateStreamErrorRetryable, setCandidateStreamErrorRetryable] = useState(false);
  const [draftSessionId, setDraftSessionId] = useState<string | null>(null);
  const [resumableDraft, setResumableDraft] = useState<{
    sessionId: string;
    status: "streaming" | "completed" | "failed";
    buffer: string;
    errorMessage: string | null;
  } | null>(null);

  const selectionRef = useRef<EditorSelection | null>(null);
  const setEditorSelection = useCallback((selection: EditorSelection | null) => {
    selectionRef.current = selection;
    if (selection?.selectedText.trim()) {
      setLocalRevisionError(undefined);
    }
  }, []);

  const clearCandidate = useCallback(() => {
    setCandidateContent("");
    setCandidateOpen(false);
    setCandidateStreaming(false);
    setCandidateCriticLoading(false);
    setCandidateCriticResult(undefined);
    setCandidateCriticError(undefined);
    setCandidateRevisionLoading(false);
    setLocalRevisionError(undefined);
  }, []);

  const dismissResumableDraftServer = useCallback(
    async (chapterIndex: number) => {
      try {
        const request = buildResumableDraftRequest(novelId, chapterIndex, "DELETE");
        await fetch(request.url, { method: request.method });
      } catch {
        // dismissal is best-effort; the unique row will be replaced on next draft
      }
    },
    [novelId],
  );

  const runCandidateCritic = useCallback(
    async (draftContent: string, isRevision?: boolean) => {
      setCandidateCriticLoading(true);
      setCandidateCriticError(undefined);
      setCandidateCriticResult(undefined);
      try {
        const request = buildCandidateCriticRequest({
          novelId,
          selectedIndex,
          content: draftContent,
          isRevision,
        });
        const response = await fetch(request.url, {
          method: request.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request.payload),
        });
        const json = await response.json();
        if (!json.ok) throw new Error(json.error?.message ?? "审校失败");
        setCandidateCriticResult(json.data as CandidateCriticResult);
        // Success — clear any persisted failure from a previous attempt.
        setCriticFailure(null);
      } catch (err) {
        // Critic failure is non-blocking. Display warning, don't gate the user.
        const message = err instanceof Error ? err.message : "审校失败";
        setCandidateCriticError(message);
        // P1-6: persist so the badge survives panel close.
        setCriticFailure({ message, chapterIndex: selectedIndex });
      } finally {
        setCandidateCriticLoading(false);
      }
    },
    [novelId, selectedIndex],
  );

  const reviseCandidate = useCallback(async () => {
    if (!candidateContent.trim() || !candidateCriticResult?.issues.length || candidateRevisionLoading) return;

    setCandidateRevisionLoading(true);
    setCandidateCriticError(undefined);
    setMessage("AI 正在按审校建议修订候选稿…");
    try {
      const request = buildCandidateRevisionRequest({
        novelId,
        selectedIndex,
        content: candidateContent,
        issues: candidateCriticResult.issues,
      });
      const response = await fetch(request.url, {
        method: request.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request.payload),
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error?.message ?? "修订失败");
      const revised = String(json.data?.content ?? "");
      if (!revised.trim()) throw new Error("AI 未返回修订正文");

      setCandidateContent(revised);
      setCandidateCriticResult(undefined);
      setMessage("候选稿已按建议修订，正在重新审校…");
      void runCandidateCritic(revised, true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "修订失败";
      setMessage(message);
      setCandidateCriticError(message);
    } finally {
      setCandidateRevisionLoading(false);
    }
  }, [
    candidateContent,
    candidateCriticResult,
    candidateRevisionLoading,
    novelId,
    runCandidateCritic,
    selectedIndex,
    setMessage,
  ]);

  const feedbackRevise = useCallback(async (instruction: string) => {
    if (!candidateContent.trim() || candidateRevisionLoading) return;

    setCandidateRevisionLoading(true);
    setCandidateCriticError(undefined);
    setMessage("AI 正在按反馈修订候选稿…");
    try {
      const request = buildCandidateRevisionRequest({
        novelId,
        selectedIndex,
        content: candidateContent,
        issues: [{ type: "tone" as const, severity: "minor" as const, description: instruction }],
      });
      const response = await fetch(request.url, {
        method: request.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request.payload),
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error?.message ?? "修订失败");
      const revised = String(json.data?.content ?? "");
      if (!revised.trim()) throw new Error("AI 未返回修订正文");

      setCandidateContent(revised);
      setCandidateCriticResult(undefined);
      setMessage("候选稿已按反馈修订，正在重新审校…");
      void runCandidateCritic(revised, true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "修订失败";
      setMessage(message);
      setCandidateCriticError(message);
    } finally {
      setCandidateRevisionLoading(false);
    }
  }, [
    candidateContent,
    candidateRevisionLoading,
    novelId,
    runCandidateCritic,
    selectedIndex,
    setMessage,
  ]);

  const reviseSelection = useCallback(async (operation: ChapterRevisionOperation) => {
    const selection = selectionRef.current;
    if (!selection?.selectedText.trim()) {
      const message = "请先在正文中选中需要改写的文本";
      setLocalRevisionError(message);
      setMessage(message);
      return;
    }
    if (localRevisionLoading) return;

    const beforeContext = content.slice(
      Math.max(0, selection.selectionStart - LOCAL_REVISION_CONTEXT_CHARS),
      selection.selectionStart,
    );
    const afterContext = content.slice(
      selection.selectionEnd,
      Math.min(content.length, selection.selectionEnd + LOCAL_REVISION_CONTEXT_CHARS),
    );

    setLocalRevisionLoading(true);
    setLocalRevisionError(undefined);
    setCandidateCriticError(undefined);
    setCandidateCriticResult(undefined);
    setCandidateRevisionLoading(false);
    setStatus("drafting");
    setMessage("AI 正在改写选中文本…");

    try {
      const request = buildLocalRevisionRequest({
        novelId,
        selectedIndex,
        title: chapterTitle,
        operation,
        selectedText: selection.selectedText,
        beforeContext,
        afterContext,
      });
      const response = await fetch(request.url, {
        method: request.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request.payload),
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error?.message ?? "局部改写失败");
      const revised = String(json.data?.content ?? "");
      if (!revised.trim()) throw new Error("AI 未返回改写正文");

      setCandidateContent(revised);
      setCandidateOpen(true);
      setCandidateStreaming(false);
      setCandidateCriticLoading(false);
      setStatus(resolveSettledChapterStatus({ hasUnsavedChanges, status: "clean" }));
      setMessage("局部改写候选稿就绪");
    } catch (err) {
      const message = err instanceof Error ? err.message : "局部改写失败";
      setLocalRevisionError(message);
      setStatus("error");
      setMessage(message);
    } finally {
      setLocalRevisionLoading(false);
    }
  }, [
    chapterTitle,
    content,
    hasUnsavedChanges,
    localRevisionLoading,
    novelId,
    selectedIndex,
    setMessage,
    setStatus,
  ]);

  // P1-6: retry the last failed critic against the currently selected
  // chapter's content. On success, clear the persistent failure badge and
  // surface the result via the status line. On failure, update the badge.
  const retryLastCritic = useCallback(async () => {
    if (!criticFailure || criticRetrying) return;
    setCriticRetrying(true);
    try {
      const request = buildCandidateCriticRequest({
        novelId,
        selectedIndex,
        content,
      });
      const response = await fetch(request.url, {
        method: request.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request.payload),
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error?.message ?? "审校失败");
      const result = json.data as CandidateCriticResult;
      setCriticFailure(null);
      if (result.consistent) {
        setMessage("审校通过");
      } else {
        const blocking = result.issues.filter(
          (i) => i.severity === "critical" || i.severity === "major",
        ).length;
        setMessage(
          blocking > 0
            ? `审校发现 ${result.issues.length} 条问题（critical/major: ${blocking}）`
            : `审校发现 ${result.issues.length} 条问题`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "审校失败";
      setCriticFailure({ message, chapterIndex: selectedIndex });
    } finally {
      setCriticRetrying(false);
    }
  }, [content, criticFailure, criticRetrying, novelId, selectedIndex, setMessage]);

  const dismissCriticFailure = useCallback(() => {
    setCriticFailure(null);
  }, []);

  const checkResumableDraft = useCallback(
    async (chapterIndex: number) => {
      try {
        const request = buildResumableDraftRequest(novelId, chapterIndex);
        const res = await fetch(request.url);
        if (!res.ok) {
          setResumableDraft(null);
          return;
        }
        setResumableDraft(normalizeResumableDraftPayload(await res.json()));
      } catch {
        setResumableDraft(null);
      }
    },
    [novelId],
  );

  useEffect(() => {
    void checkResumableDraft(selectedIndex);
  }, [selectedIndex, checkResumableDraft]);

  const dismissResumableDraft = useCallback(() => {
    if (!resumableDraft) return;
    setResumableDraft(null);
    void dismissResumableDraftServer(selectedIndex);
  }, [dismissResumableDraftServer, resumableDraft, selectedIndex]);

  const applyResumableDraft = useCallback(() => {
    if (!resumableDraft) return;
    setCandidateContent(resumableDraft.buffer);
    setCandidateOpen(true);
    setCandidateStreaming(false);
    setDraftSessionId(resumableDraft.sessionId);
    setStatus(resolveSettledChapterStatus({ hasUnsavedChanges, status: "clean" }));
    setMessage(resumableDraftLoadedMessage(resumableDraft.status));
    setResumableDraft(null);
    void runCandidateCritic(resumableDraft.buffer);
  }, [hasUnsavedChanges, resumableDraft, runCandidateCritic, setMessage, setStatus]);

  const draftChapter = useCallback(
    async (beatsOrOpts?: BeatItem[] | { retrieved_memories?: DraftMemory[] }) => {
      const beats = Array.isArray(beatsOrOpts) ? beatsOrOpts : undefined;
      const retrievedMemories = (!Array.isArray(beatsOrOpts) && beatsOrOpts?.retrieved_memories) ? beatsOrOpts.retrieved_memories : undefined;
      if (candidateContent && !candidateStreaming) {
        const ok = await confirm({
          title: "丢弃当前候选稿并重新生成？",
          message: "上一次 AI 起草的候选稿尚未处理，重新起草会覆盖它。",
          confirmLabel: "重新起草",
          danger: true,
        });
        if (!ok) return;
      }

      setCandidateOpen(true);
      setCandidateStreaming(true);
      setCandidateContent("");
      setCandidateCriticLoading(false);
      setCandidateCriticResult(undefined);
      setCandidateCriticError(undefined);
      setCandidateRevisionLoading(false);
      setLastRetrievedMemories([]);
      setLastRetrievalExplanation(undefined);
      setLastRetrievalError(undefined);
      setStatus("drafting");
      setCandidateStreamError(undefined);
      setCandidateStreamErrorRetryable(false);
      setMessage("AI 正在起草候选稿…");

      let draftState: DraftSseState = { generated: "", done: false };

      try {
        const request = buildDraftChapterRequest({
          novelId,
          selectedIndex,
          title: chapterTitle,
          existingContent: content,
          beats,
          ...(retrievedMemories ? { retrieved_memories: retrievedMemories } : {}),
        });
        const response = await fetch(request.url, {
          method: request.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request.payload),
        });

        if (!response.ok || !response.body) {
          throw new Error(`章节起草失败：HTTP ${response.status}`);
        }

        await readSse(response.body, (event) => {
          draftState = applyDraftSseEvent(draftState, event);
          if (draftState.sessionId) setDraftSessionId(draftState.sessionId);
          setCandidateContent(draftState.generated);
          if (draftState.retrievalStatus) setLastRetrievalStatus(draftState.retrievalStatus);
          if (draftState.retrievalExplanation) setLastRetrievalExplanation(draftState.retrievalExplanation);
          if (draftState.retrievalError) setLastRetrievalError(draftState.retrievalError);
          if (draftState.candidates) setCandidates(draftState.candidates);
          if (draftState.retrievedMemories) setLastRetrievedMemories(draftState.retrievedMemories);
          if (draftState.done) {
            setMessage("候选稿生成完成，正在审校…");
          }
        });

        if (draftState.streamError) throw new Error(draftState.streamError);
        if (!draftState.generated.trim()) throw new Error("AI 未返回章节正文");

        setCandidateStreaming(false);
        setStatus(resolveSettledChapterStatus({ hasUnsavedChanges, status: "clean" }));
        setMessage("候选稿就绪，请选择处理方式");
        void runCandidateCritic(draftState.generated);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "AI 起草失败";
        setCandidateStreaming(false);
        setStatus("error");
        setMessage(msg);
        setCandidateStreamError(msg);
        setCandidateStreamErrorRetryable(
          draftState.streamErrorRetryable ?? (!msg.includes("违规") && !msg.includes("MODERATION")),
        );
        if (draftState.sessionId) setDraftSessionId(draftState.sessionId);
      }
    },
    [
      candidateContent,
      candidateStreaming,
      chapterTitle,
      confirm,
      content,
      hasUnsavedChanges,
      novelId,
      runCandidateCritic,
      selectedIndex,
      setMessage,
      setStatus,
    ],
  );

  const acceptCandidate = useCallback(
    async (mode: CandidateMode) => {
      if (mode === "discard") {
        clearCandidate();
        setStatus(resolveSettledChapterStatus({ hasUnsavedChanges, status: "clean" }));
        setMessage("候选稿已丢弃，正文未改动");
        void dismissResumableDraftServer(selectedIndex);
        setDraftSessionId(null);
        // Discarding the candidate also obsoletes any pending critic failure —
        // the failure was about the discarded text, not the chapter body.
        setCriticFailure(null);
        return;
      }

      if (!candidateContent) return;

      const nextContent = applyAcceptMode(content, candidateContent, mode, selectionRef.current);

      setStatus("saving");
      setMessage("保存候选稿…");
      try {
        if (content.trim() && chapterId) {
          try {
            await persistChapter(content, chapterTitle, chapterStatus, "manual");
          } catch {
            // Snapshot best-effort — proceed even if it fails so user doesn't
            // lose the candidate they just chose to apply.
          }
        }

        setContent(nextContent);
        await persistChapter(nextContent, chapterTitle, chapterStatus, "ai");
        setStatus("saved");
        setMessage(candidateAcceptedMessage(mode));
        clearCandidate();
        void dismissResumableDraftServer(selectedIndex);
        setDraftSessionId(null);
      } catch (err) {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "保存失败");
      }
    },
    [
      candidateContent,
      chapterId,
      chapterStatus,
      chapterTitle,
      clearCandidate,
      content,
      dismissResumableDraftServer,
      hasUnsavedChanges,
      persistChapter,
      selectedIndex,
      setContent,
      setMessage,
      setStatus,
    ],
  );

  const draftChapterWithMemories = (memories: DraftMemory[]) => {
    void draftChapter({ retrieved_memories: memories });
  };

  return {
    candidateOpen,
    candidateContent,
    candidateStreaming,
    candidateCriticLoading,
    candidateCriticResult,
    candidateCriticError,
    candidateRevisionLoading,
    clearCandidate,
    draftChapter,
    draftChapterWithMemories,
    reviseCandidate,
    feedbackRevise,
    reviseSelection,
    setEditorSelection,
    acceptCandidate,
    localRevisionLoading,
    localRevisionError,
    candidates,
    lastRetrievalStatus,
    lastRetrievalExplanation,
    lastRetrievedMemories,
    lastRetrievalError,
    candidateStreamError,
    candidateStreamErrorRetryable,
    draftSessionId,
    resumableDraft,
    applyResumableDraft,
    dismissResumableDraft,
    // P1-6: persistent critic-failure surface for the editor header badge.
    criticFailure,
    criticRetrying,
    retryLastCritic,
    dismissCriticFailure,
  };
}
