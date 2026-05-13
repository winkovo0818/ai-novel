"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
  applyAcceptMode,
  applyDraftSseEvent,
  buildCandidateCriticRequest,
  buildDraftChapterRequest,
  buildResumableDraftRequest,
  candidateAcceptedMessage,
  normalizeResumableDraftPayload,
  resumableDraftLoadedMessage,
  type DraftSseState,
} from "@/lib/editor/chapterUtils";
import { readSse } from "@/lib/stream/readSse";
import type { BeatItem } from "./BeatSheetPanel";
import type {
  CandidateCriticResult,
  CandidateMode,
} from "./CandidatePanel";
import type { ChapterDraftView } from "./EditorClient";

type ChapterStatus = "draft" | "done";
type EditorStatus = "idle" | "saving" | "saved" | "drafting" | "error";
type SaveSource = "autosave" | "manual" | "ai";
type PersistChapter = (
  nextContent: string,
  nextTitle?: string,
  nextStatus?: ChapterStatus,
  source?: SaveSource,
) => Promise<ChapterDraftView>;

interface UseChapterDraftingOptions {
  novelId: string;
  selectedIndex: number;
  chapterId?: string;
  chapterTitle: string;
  content: string;
  chapterStatus: ChapterStatus;
  persistChapter: PersistChapter;
  setContent(value: string): void;
  setStatus(value: EditorStatus): void;
  setMessage(value: string | undefined): void;
}

export function useChapterDrafting({
  novelId,
  selectedIndex,
  chapterId,
  chapterTitle,
  content,
  chapterStatus,
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
  const [lastRetrievalStatus, setLastRetrievalStatus] = useState<string>();
  const [lastRetrievedMemories, setLastRetrievedMemories] = useState<
    Array<{ source: string; reason: string; score: number; text: string }>
  >([]);
  const [lastRetrievalError, setLastRetrievalError] = useState<string>();
  const [draftSessionId, setDraftSessionId] = useState<string | null>(null);
  const [resumableDraft, setResumableDraft] = useState<{
    sessionId: string;
    status: "streaming" | "completed" | "failed";
    buffer: string;
    errorMessage: string | null;
  } | null>(null);

  const cursorPosRef = useRef<number | null>(null);
  const setCursorPos = useCallback((pos: number | null) => {
    cursorPosRef.current = pos;
  }, []);

  const clearCandidate = useCallback(() => {
    setCandidateContent("");
    setCandidateOpen(false);
    setCandidateStreaming(false);
    setCandidateCriticLoading(false);
    setCandidateCriticResult(undefined);
    setCandidateCriticError(undefined);
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
    async (draftContent: string) => {
      setCandidateCriticLoading(true);
      setCandidateCriticError(undefined);
      setCandidateCriticResult(undefined);
      try {
        const request = buildCandidateCriticRequest({
          novelId,
          selectedIndex,
          content: draftContent,
        });
        const response = await fetch(request.url, {
          method: request.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request.payload),
        });
        const json = await response.json();
        if (!json.ok) throw new Error(json.error?.message ?? "审校失败");
        setCandidateCriticResult(json.data as CandidateCriticResult);
      } catch (err) {
        // Critic failure is non-blocking. Display warning, don't gate the user.
        setCandidateCriticError(err instanceof Error ? err.message : "审校失败");
      } finally {
        setCandidateCriticLoading(false);
      }
    },
    [novelId, selectedIndex],
  );

  const checkResumableDraft = useCallback(
    async (chapterIndex: number) => {
      try {
        const request = buildResumableDraftRequest(novelId, chapterIndex);
        const res = await fetch(request.url);
        if (res.status === 404) {
          setResumableDraft(null);
          return;
        }
        const json = await res.json();
        if (!json.ok) {
          setResumableDraft(null);
          return;
        }
        setResumableDraft(normalizeResumableDraftPayload(json));
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
    setStatus("idle");
    setMessage(resumableDraftLoadedMessage(resumableDraft.status));
    setResumableDraft(null);
    void runCandidateCritic(resumableDraft.buffer);
  }, [resumableDraft, runCandidateCritic, setMessage, setStatus]);

  const draftChapter = useCallback(
    async (beats?: BeatItem[]) => {
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
      setLastRetrievedMemories([]);
      setLastRetrievalError(undefined);
      setStatus("drafting");
      setMessage("AI 正在起草候选稿…");

      let draftState: DraftSseState = { generated: "", done: false };

      try {
        const request = buildDraftChapterRequest({
          novelId,
          selectedIndex,
          title: chapterTitle,
          existingContent: content,
          beats,
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
          if (draftState.retrievalError) setLastRetrievalError(draftState.retrievalError);
          if (draftState.retrievedMemories) setLastRetrievedMemories(draftState.retrievedMemories);
          if (draftState.done) {
            setMessage("候选稿生成完成，正在审校…");
          }
        });

        if (draftState.streamError) throw new Error(draftState.streamError);
        if (!draftState.generated.trim()) throw new Error("AI 未返回章节正文");

        setCandidateStreaming(false);
        setStatus("idle");
        setMessage("候选稿就绪，请选择处理方式");
        void runCandidateCritic(draftState.generated);
      } catch (err) {
        setCandidateStreaming(false);
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "AI 起草失败");
      }
    },
    [
      candidateContent,
      candidateStreaming,
      chapterTitle,
      confirm,
      content,
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
        setStatus("idle");
        setMessage("候选稿已丢弃，正文未改动");
        void dismissResumableDraftServer(selectedIndex);
        setDraftSessionId(null);
        return;
      }

      if (!candidateContent) return;

      const nextContent = applyAcceptMode(content, candidateContent, mode, cursorPosRef.current);

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
      persistChapter,
      selectedIndex,
      setContent,
      setMessage,
      setStatus,
    ],
  );

  return {
    candidateOpen,
    candidateContent,
    candidateStreaming,
    candidateCriticLoading,
    candidateCriticResult,
    candidateCriticError,
    clearCandidate,
    draftChapter,
    setCursorPos,
    acceptCandidate,
    lastRetrievalStatus,
    lastRetrievedMemories,
    lastRetrievalError,
    draftSessionId,
    resumableDraft,
    applyResumableDraft,
    dismissResumableDraft,
  };
}
