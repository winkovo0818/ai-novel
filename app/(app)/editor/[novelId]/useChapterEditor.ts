"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { readSse } from "@/lib/stream/readSse";
import { getAllChapters } from "@/lib/validation/schemas";
import type { BibleDraft, StateDiff } from "@/lib/validation/schemas";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
  applyAcceptMode,
  deriveChapterStateFromDraft,
  mergeChapterIntoList,
  resolveStartIndex,
} from "@/lib/editor/chapterUtils";
import type { ChapterDraftView } from "./EditorClient";
import type {
  CandidateCriticResult,
  CandidateMode,
} from "./CandidatePanel";
import type { BeatItem } from "./BeatSheetPanel";

interface UseChapterEditorOptions {
  novelId: string;
  bible: BibleDraft;
  initialChapters: ChapterDraftView[];
  initialChapterIndex?: number;
}

export interface ConsistencyIssue {
  type: string;
  chapter: number;
  description: string;
}

export interface ConsistencyResult {
  consistent: boolean;
  issues?: ConsistencyIssue[];
}

export interface ChapterVersionView {
  id: string;
  chapter_id: string;
  title: string;
  content: string;
  status: string;
  source: string;
  created_at: string;
}

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
  const [chapterId, setChapterId] = useState(startState.chapterId);
  const [chapterTitle, setChapterTitle] = useState(startState.title);
  const [content, setContent] = useState(startState.content);
  const [chapterStatus, setChapterStatus] = useState<"draft" | "done">(startState.status);
  const [savedTitle, setSavedTitle] = useState(startState.title);
  const [savedContent, setSavedContent] = useState(startState.content);
  const [savedStatus, setSavedStatus] = useState<"draft" | "done">(startState.status);
  const [targetWords, setTargetWordsState] = useState<number | null>(startState.targetWords);
  const [lastSavedAt, setLastSavedAt] = useState<string | undefined>(startState.lastSavedAt);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "drafting" | "error">("idle");
  const [message, setMessage] = useState<string>();
  // M3.6 optimistic-lock state. Hydrated from the chapter row on selection
  // and updated from every successful PATCH/POST/restore response. When the
  // server responds 409 we stash the latest row in conflictChapter so the
  // editor can render a "load latest" banner.
  const [chapterVersion, setChapterVersion] = useState<number>(startState.version);
  const [conflictChapter, setConflictChapter] = useState<ChapterDraftView | null>(null);
  const hasUnsavedChanges = chapterTitle !== savedTitle || content !== savedContent || chapterStatus !== savedStatus;
  const characterCount = content.replace(/\s/g, "").length;

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const persistChapter = useCallback(async (nextContent: string, nextTitle = chapterTitle, nextStatus = chapterStatus, source: "autosave" | "manual" | "ai" = "autosave") => {
    const payload = {
      title: nextTitle,
      content: nextContent,
      status: nextStatus,
      ...(chapterId
        ? { source, expected_version: chapterVersion }
        : { chapter_index: selectedIndex }),
    };
    const response = await fetch(
      chapterId ? `/api/chapters/${chapterId}` : `/api/novels/${novelId}/chapters`,
      {
        method: chapterId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const json = await response.json();

    if (response.status === 409 && json.error?.code === "CHAPTER_VERSION_CONFLICT") {
      // Another tab / device wrote first. Stash the latest server row so the
      // editor can render a banner with "load latest" / diff actions; the
      // local body stays untouched in case the user wants to copy parts out.
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

    // M3.1: server-side PATCH flips summary_dirty / index_dirty on content
    // change. The chapter management page's "refresh dirty" batch button
    // owns when summarize/index actually run, so the editor no longer pushes
    // jobs on every save — long novels would otherwise pay LLM cost for
    // every keystroke autosave.

    // L-01: Auto-generate state diff when chapter is first marked done
    const targetId = json.data.id as string;
    if (savedStatus !== "done" && nextStatus === "done") {
      void (async () => {
        try {
          const res = await fetch(`/api/chapters/${targetId}/state-diff`, { method: "POST" });
          const stateDiffJson = await res.json();
          if (stateDiffJson.ok && stateDiffJson.data) {
            const diff = stateDiffJson.data as StateDiff;
            const hasChanges =
              diff.character_updates.length > 0 ||
              diff.timeline_events.length > 0 ||
              diff.plot_thread_updates.length > 0 ||
              diff.new_entities.length > 0;
            if (hasChanges) {
              setPendingStateDiff(diff);
              setPendingStateDiffChapterIndex(selectedIndex);
            }
          }
        } catch {
          // Silent fail for background auto-generation
        }
      })();
    }

    return json.data as ChapterDraftView;
  }, [chapterId, chapterStatus, chapterTitle, chapterVersion, novelId, selectedIndex, savedStatus]);

  useEffect(() => {
    if (!hasUnsavedChanges || status === "saving" || status === "drafting" || !chapterTitle.trim()) return;

    const timeout = window.setTimeout(async () => {
      setStatus("saving");
      setMessage("自动保存中...");
      try {
        await persistChapter(content, chapterTitle, chapterStatus, "autosave");
        setStatus("saved");
        setMessage("已自动保存");
      } catch (err) {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "自动保存失败");
      }
    }, 3_000);

    return () => window.clearTimeout(timeout);
  }, [chapterStatus, chapterTitle, content, hasUnsavedChanges, persistChapter, status]);

  async function selectChapter(index: number) {
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
    const outline = allOutlineChapters.find((chapter) => chapter.index === index);
    const next = deriveChapterStateFromDraft(draft, outline?.title, index);

    setSelectedIndex(index);
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
    setConflictChapter(null);
    setStatus("idle");
    setMessage(undefined);
  }

  async function setTargetWords(value: number | null) {
    if (value === targetWords) return;
    setTargetWordsState(value);
    if (!chapterId) return;
    try {
      const response = await fetch(`/api/chapters/${chapterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_words: value, source: "manual", expected_version: chapterVersion }),
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
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "目标字数保存失败");
    }
  }

  async function saveChapter() {
    setStatus("saving");
    setMessage(undefined);

    try {
      await persistChapter(content, chapterTitle, chapterStatus, "manual");
      setStatus("saved");
      setMessage("草稿已保存");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "保存失败");
    }
  }

  // ────────────────────────────────────────────────
  // M1.3: AI draft → candidate buffer (no longer overwrites editor body)
  // ────────────────────────────────────────────────
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
  // UX3: server-side draft session id, captured from the first SSE event so
  // a dropped connection (browser refresh, lost network) can still be resumed
  // via /api/novels/:id/chapters/draft/resume.
  const [draftSessionId, setDraftSessionId] = useState<string | null>(null);
  // A resumable draft surfaced on chapter load (buffer the server kept from
  // a previous interrupted run). Distinct from candidateContent because the
  // user hasn't accepted to re-open the candidate flow yet.
  const [resumableDraft, setResumableDraft] = useState<{
    sessionId: string;
    status: "streaming" | "completed" | "failed";
    buffer: string;
    errorMessage: string | null;
  } | null>(null);
  // Cursor tracking for "insert at cursor" mode. EditorClient updates this on
  // textarea selection/click events.
  const cursorPosRef = useRef<number | null>(null);
  const setCursorPos = useCallback((pos: number | null) => {
    cursorPosRef.current = pos;
  }, []);

  function clearCandidate() {
    setCandidateContent("");
    setCandidateOpen(false);
    setCandidateStreaming(false);
    setCandidateCriticLoading(false);
    setCandidateCriticResult(undefined);
    setCandidateCriticError(undefined);
  }

  // UX3: fetch any server-side buffered draft for the active chapter. Called
  // on chapter switch so the editor can surface "上次起草中断" banners.
  const checkResumableDraft = useCallback(
    async (chapterIndex: number) => {
      try {
        const res = await fetch(
          `/api/novels/${novelId}/chapters/draft/resume?chapter_index=${chapterIndex}`,
        );
        if (res.status === 404) {
          setResumableDraft(null);
          return;
        }
        const json = await res.json();
        if (!json.ok) {
          setResumableDraft(null);
          return;
        }
        // Don't surface drafts shorter than a few characters — that's usually
        // a near-instant abort the user doesn't care about resuming.
        const buffer: string = json.data.buffer ?? "";
        if (buffer.trim().length < 10) {
          setResumableDraft(null);
          return;
        }
        setResumableDraft({
          sessionId: json.data.id,
          status: json.data.status,
          buffer,
          errorMessage: json.data.error_message,
        });
      } catch {
        setResumableDraft(null);
      }
    },
    [novelId],
  );

  useEffect(() => {
    void checkResumableDraft(selectedIndex);
  }, [selectedIndex, checkResumableDraft]);

  async function dismissResumableDraftServer(chapterIndex: number) {
    try {
      await fetch(
        `/api/novels/${novelId}/chapters/draft/resume?chapter_index=${chapterIndex}`,
        { method: "DELETE" },
      );
    } catch {
      // dismissal is best-effort; the unique row will be replaced on next draft
    }
  }

  function dismissResumableDraft() {
    if (!resumableDraft) return;
    setResumableDraft(null);
    void dismissResumableDraftServer(selectedIndex);
  }

  function applyResumableDraft() {
    if (!resumableDraft) return;
    setCandidateContent(resumableDraft.buffer);
    setCandidateOpen(true);
    setCandidateStreaming(false);
    setDraftSessionId(resumableDraft.sessionId);
    setStatus("idle");
    setMessage(
      resumableDraft.status === "completed"
        ? "已加载上次未完成的候选稿"
        : "已加载上次中断的部分候选稿，可继续编辑或丢弃",
    );
    setResumableDraft(null);
    // Run critic against the recovered text so the panel state matches a
    // fresh draft.
    void runCandidateCritic(resumableDraft.buffer);
  }

  async function draftChapter(beats?: BeatItem[]) {
    // Defensive: if a candidate is still pending, ask the user first instead of
    // dropping the previous generation silently.
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

    let generated = "";
    let streamError: string | undefined;

    try {
      const response = await fetch(`/api/novels/${novelId}/chapters/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapter_index: selectedIndex,
          title: chapterTitle,
          existing_content: content,
          ...(beats && beats.length > 0 ? { beat_sheet: { beats } } : {}),
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`章节起草失败：HTTP ${response.status}`);
      }

      await readSse(response.body, (event) => {
        if (event.event === "session") {
          const data = event.data as { sessionId?: string };
          if (data.sessionId) setDraftSessionId(data.sessionId);
          return;
        }

        if (event.event === "chapter_delta") {
          const data = event.data as { delta?: string };
          if (data.delta) {
            generated += data.delta;
            setCandidateContent(generated);
          }
          return;
        }

        if (event.event === "retrieval") {
          const data = event.data as {
            status?: string;
            error?: string;
            memories?: Array<{ source: string; reason: string; score: number; text: string }>;
          };
          if (data.status) setLastRetrievalStatus(data.status);
          if (data.error) setLastRetrievalError(data.error);
          if (Array.isArray(data.memories)) setLastRetrievedMemories(data.memories);
          return;
        }

        if (event.event === "error") {
          const data = event.data as { message?: string };
          streamError = data.message ?? "章节起草失败";
          return;
        }

        if (event.event === "done") {
          const data = event.data as { retrieval_status?: string };
          if (data.retrieval_status) {
            setLastRetrievalStatus(data.retrieval_status);
          }
          setMessage("候选稿生成完成，正在审校…");
        }
      });

      if (streamError) throw new Error(streamError);
      if (!generated.trim()) throw new Error("AI 未返回章节正文");

      setCandidateStreaming(false);
      setStatus("idle");
      setMessage("候选稿就绪，请选择处理方式");

      // Run critic against the candidate (non-blocking — its result decorates
      // the panel, never auto-applies content).
      void runCandidateCritic(generated);
    } catch (err) {
      setCandidateStreaming(false);
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "AI 起草失败");
    }
  }

  async function runCandidateCritic(draftContent: string) {
    setCandidateCriticLoading(true);
    setCandidateCriticError(undefined);
    setCandidateCriticResult(undefined);
    try {
      const response = await fetch(`/api/novels/${novelId}/chapters/critic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapter_index: selectedIndex,
          content: draftContent,
        }),
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
  }

  async function acceptCandidate(mode: CandidateMode) {
    if (mode === "discard") {
      clearCandidate();
      setStatus("idle");
      setMessage("候选稿已丢弃，正文未改动");
      // UX3: drop the server-side session too so the user isn't re-prompted
      // to resume something they explicitly discarded.
      void dismissResumableDraftServer(selectedIndex);
      setDraftSessionId(null);
      return;
    }

    if (!candidateContent) return;

    const nextContent = applyAcceptMode(content, candidateContent, mode, cursorPosRef.current);

    setStatus("saving");
    setMessage("保存候选稿…");
    try {
      // Snapshot current body as a manual version *first* if it's non-empty —
      // gives the user a one-click way back to the pre-AI state. Routed
      // through persistChapter so the version row is created AND the local
      // chapterVersion bumps before the next "ai" save (otherwise the second
      // PATCH would 409 against itself).
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
      setMessage(
        mode === "replace"
          ? "候选稿已替换正文"
          : mode === "append"
          ? "候选稿已追加到末尾"
          : "候选稿已插入光标处",
      );
      clearCandidate();
      // UX3: candidate was successfully applied — clear the resumable
      // session so the next chapter visit doesn't re-offer it.
      void dismissResumableDraftServer(selectedIndex);
      setDraftSessionId(null);
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "保存失败");
    }
  }

  async function deleteChapter() {
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
      const response = await fetch(`/api/chapters/${chapterId}`, { method: "DELETE" });
      const json = await response.json();

      if (!json.ok) {
        throw new Error(json.error?.message ?? "删除失败");
      }

      setChapters((current) => current.filter((c) => c.id !== chapterId));
      setChapterId(undefined);
      setContent("");
      setChapterTitle(selectedOutline?.title ?? `第 ${selectedIndex} 章`);
      setChapterStatus("draft");
      setSavedTitle(selectedOutline?.title ?? `第 ${selectedIndex} 章`);
      setSavedContent("");
      setSavedStatus("draft");
      setStatus("idle");
      setMessage("章节已删除");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "删除失败");
    }
  }

  // ────────────────────────────────────────────────
  // F2: full-novel consistency check
  // ────────────────────────────────────────────────
  const [consistencyRunning, setConsistencyRunning] = useState(false);
  const [consistencyResult, setConsistencyResult] = useState<ConsistencyResult>();
  const [consistencyError, setConsistencyError] = useState<string>();

  async function runConsistency() {
    setConsistencyRunning(true);
    setConsistencyError(undefined);
    setConsistencyResult(undefined);
    try {
      const response = await fetch(`/api/novels/${novelId}/consistency`, { method: "POST" });
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
  }

  // ────────────────────────────────────────────────
  // F3: chapter version history
  // ────────────────────────────────────────────────
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versions, setVersions] = useState<ChapterVersionView[]>([]);
  const [versionsError, setVersionsError] = useState<string>();

  async function openVersions() {
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
      const response = await fetch(`/api/chapters/${chapterId}/versions`);
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
  }

  function closeVersions() {
    setVersionsOpen(false);
  }

  /**
   * M3.2: After a successful version restore, the API returns the freshly
   * updated ChapterDraft. Sync that back into the editor so the user sees
   * the restored body immediately and the unsaved-changes indicator
   * reflects the new baseline. Also patch the chapters list so the outline
   * sidebar / status badges stay consistent.
   */
  function applyRestoredChapter(restored: ChapterDraftView) {
    if (restored.id !== chapterId) return;
    const nextStatus = restored.status === "done" ? "done" : "draft";
    setChapterTitle(restored.title);
    setContent(restored.content);
    setChapterStatus(nextStatus);
    setSavedTitle(restored.title);
    setSavedContent(restored.content);
    setSavedStatus(nextStatus);
    if (typeof restored.version === "number") setChapterVersion(restored.version);
    if (restored.updated_at) setLastSavedAt(restored.updated_at);
    setChapters((current) =>
      current.map((chapter) => (chapter.id === restored.id ? { ...chapter, ...restored } : chapter)),
    );
    setConflictChapter(null);
    setStatus("saved");
    setMessage("已恢复历史版本");
  }

  /**
   * M3.6: when a 409 conflict has been recorded, replace local editor state
   * with the latest server row and clear the conflict banner. The user's
   * unsaved local body is discarded — the conflict banner warns about this
   * and offers a diff view first.
   */
  function loadLatestChapter() {
    if (!conflictChapter) return;
    applyRestoredChapter(conflictChapter);
    setMessage("已加载最新版本");
  }

  function dismissConflict() {
    setConflictChapter(null);
  }

  // ────────────────────────────────────────────────
  // B2: state diff (chapter completion tracking)
  // ────────────────────────────────────────────────
  const [stateDiffOpen, setStateDiffOpen] = useState(false);
  const [stateDiffLoading, setStateDiffLoading] = useState(false);
  const [stateDiff, setStateDiff] = useState<StateDiff>();
  const [stateDiffError, setStateDiffError] = useState<string>();

  // L-01: pending state diff from auto-generation after marking done
  const [pendingStateDiff, setPendingStateDiff] = useState<StateDiff | null>(null);
  const [pendingStateDiffChapterIndex, setPendingStateDiffChapterIndex] = useState(0);

  function openPendingStateDiff() {
    if (!pendingStateDiff) return;
    setStateDiff(pendingStateDiff);
    setStateDiffOpen(true);
    setPendingStateDiff(null);
  }

  async function generateStateDiff() {
    if (!chapterId) {
      setStateDiffError("章节尚未保存，无法分析状态变更");
      setStateDiffOpen(true);
      return;
    }
    setStateDiffOpen(true);
    setStateDiffLoading(true);
    setStateDiffError(undefined);
    setStateDiff(undefined);
    try {
      const response = await fetch(`/api/chapters/${chapterId}/state-diff`, { method: "POST" });
      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error?.message ?? "状态分析失败");
      }
      setStateDiff(json.data as StateDiff);
    } catch (err) {
      setStateDiffError(err instanceof Error ? err.message : "状态分析失败");
    } finally {
      setStateDiffLoading(false);
    }
  }

  function closeStateDiff() {
    setStateDiffOpen(false);
  }

  // ────────────────────────────────────────────────
  // M2.2: Beat Sheet (chapter ≥ 2). Generated beats are editable, then
  // handed back to draftChapter() so writer prompt consumes them.
  // ────────────────────────────────────────────────
  const [beats, setBeatsState] = useState<BeatItem[]>([]);
  const [beatsLoading, setBeatsLoading] = useState(false);
  const [beatsError, setBeatsError] = useState<string>();

  // Reset beats when switching chapters — they're chapter-specific.
  useEffect(() => {
    setBeatsState([]);
    setBeatsError(undefined);
  }, [selectedIndex]);

  async function generateBeatSheet(chapterGoal?: string) {
    if (selectedIndex < 2) {
      setBeatsError("第 1 章节拍由 Bible 提供，无需另行生成");
      return;
    }
    setBeatsLoading(true);
    setBeatsError(undefined);
    try {
      const response = await fetch(`/api/novels/${novelId}/chapters/outline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapter_index: selectedIndex,
          chapter_title: chapterTitle,
          ...(chapterGoal ? { chapter_goal: chapterGoal } : {}),
        }),
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error?.message ?? "节拍生成失败");
      setBeatsState(json.data.beats as BeatItem[]);
    } catch (err) {
      setBeatsError(err instanceof Error ? err.message : "节拍生成失败");
    } finally {
      setBeatsLoading(false);
    }
  }

  function setBeats(next: BeatItem[]) {
    setBeatsState(next);
  }

  function clearBeats() {
    setBeatsState([]);
    setBeatsError(undefined);
  }

  async function draftWithBeats() {
    await draftChapter(beats);
  }

  return {
    chapters,
    selectedIndex,
    selectedDraft,
    selectedOutline,
    chapterTitle,
    setChapterTitle,
    content,
    setContent,
    chapterStatus,
    setChapterStatus,
    status,
    setStatus,
    message,
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
    chapterId,
    stateDiffOpen,
    stateDiffLoading,
    stateDiff,
    stateDiffError,
    generateStateDiff,
    closeStateDiff,
    pendingStateDiff,
    pendingStateDiffChapterIndex,
    openPendingStateDiff,
    // M1.3 candidate flow
    candidateOpen,
    candidateContent,
    candidateStreaming,
    candidateCriticLoading,
    candidateCriticResult,
    candidateCriticError,
    setCursorPos,
    acceptCandidate,
    // M1.5 writing tools
    targetWords,
    setTargetWords,
    lastSavedAt,
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
    chapterVersion,
    conflictChapter,
    loadLatestChapter,
    dismissConflict,
    // UX3 resumable draft sessions
    draftSessionId,
    resumableDraft,
    applyResumableDraft,
    dismissResumableDraft,
  };
}
