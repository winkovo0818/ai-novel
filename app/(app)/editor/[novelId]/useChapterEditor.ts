"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { readSse } from "@/lib/stream/readSse";
import { getAllChapters } from "@/lib/validation/schemas";
import type { BibleDraft, StateDiff } from "@/lib/validation/schemas";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import type { ChapterDraftView } from "./EditorClient";
import type {
  CandidateCriticResult,
  CandidateMode,
} from "./CandidatePanel";

interface UseChapterEditorOptions {
  novelId: string;
  bible: BibleDraft;
  initialChapters: ChapterDraftView[];
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

export function useChapterEditor({ novelId, bible, initialChapters }: UseChapterEditorOptions) {
  const confirm = useConfirm();
  const allOutlineChapters = getAllChapters(bible);
  const firstChapter = allOutlineChapters[0];
  const firstDraft = initialChapters.find((chapter) => chapter.chapter_index === 1);
  const [chapters, setChapters] = useState(initialChapters);
  const [selectedIndex, setSelectedIndex] = useState(1);
  const selectedDraft = chapters.find((chapter) => chapter.chapter_index === selectedIndex);
  const selectedOutline = allOutlineChapters.find((chapter) => chapter.index === selectedIndex) ?? firstChapter;
  const [chapterId, setChapterId] = useState(firstDraft?.id);
  const [chapterTitle, setChapterTitle] = useState(firstDraft?.title ?? firstChapter?.title ?? "第一章");
  const [content, setContent] = useState(firstDraft?.content ?? "");
  const [chapterStatus, setChapterStatus] = useState<"draft" | "done">(firstDraft?.status === "done" ? "done" : "draft");
  const [savedTitle, setSavedTitle] = useState(firstDraft?.title ?? firstChapter?.title ?? "第一章");
  const [savedContent, setSavedContent] = useState(firstDraft?.content ?? "");
  const [savedStatus, setSavedStatus] = useState<"draft" | "done">(firstDraft?.status === "done" ? "done" : "draft");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "drafting" | "error">("idle");
  const [message, setMessage] = useState<string>();
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
      ...(chapterId ? { source } : { chapter_index: selectedIndex }),
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

    if (!json.ok) {
      throw new Error(json.error?.message ?? "保存失败");
    }

    setChapterId(json.data.id);
    setSavedTitle(nextTitle);
    setSavedContent(nextContent);
    setSavedStatus(nextStatus);
    setChapters((current) => {
      const nextChapter = json.data as ChapterDraftView;
      const exists = current.some((chapter) => chapter.id === nextChapter.id);
      if (exists) return current.map((chapter) => chapter.id === nextChapter.id ? nextChapter : chapter);
      return [...current, nextChapter].sort((a, b) => a.chapter_index - b.chapter_index);
    });

    // F1: When a chapter is marked done with substantive content, refresh its
    // summary and index it for RAG. Both run as background jobs so failures
    // surface in the editor instead of disappearing into server logs.
    if (nextStatus === "done" && nextContent.trim().length >= 100) {
      const targetId = json.data.id as string;
      void fetch(`/api/novels/${novelId}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobs: [
            { type: "summarize_chapter", payload: { chapter_id: targetId } },
            { type: "index_chapter", payload: { novel_id: novelId, chapter_id: targetId } },
          ],
        }),
      }).catch(() => {
        // Network error reaching our own API — the queue stays empty
        // and the user can retry by re-marking the chapter done.
      });
    }

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

    // L-03: Cascade refresh when editing an already-done chapter
    if (savedStatus === "done" && nextContent !== savedContent) {
      void fetch(`/api/novels/${novelId}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobs: [
            { type: "summarize_chapter", payload: { chapter_id: targetId } },
            { type: "index_chapter", payload: { novel_id: novelId, chapter_id: targetId } },
            { type: "refresh_summaries", payload: { novel_id: novelId } },
          ],
        }),
      }).catch(() => {});
    }

    return json.data as ChapterDraftView;
  }, [chapterId, chapterStatus, chapterTitle, novelId, selectedIndex, savedContent, savedStatus]);

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
    const nextTitle = draft?.title ?? outline?.title ?? `第 ${index} 章`;
    const nextContent = draft?.content ?? "";
    const nextStatus = draft?.status === "done" ? "done" : "draft";

    setSelectedIndex(index);
    setChapterId(draft?.id);
    setChapterTitle(nextTitle);
    setContent(nextContent);
    setChapterStatus(nextStatus);
    setSavedTitle(nextTitle);
    setSavedContent(nextContent);
    setSavedStatus(nextStatus);
    setStatus("idle");
    setMessage(undefined);
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

  async function draftChapter() {
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
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`章节起草失败：HTTP ${response.status}`);
      }

      await readSse(response.body, (event) => {
        if (event.event === "chapter_delta") {
          const data = event.data as { delta?: string };
          if (data.delta) {
            generated += data.delta;
            setCandidateContent(generated);
          }
          return;
        }

        if (event.event === "error") {
          const data = event.data as { message?: string };
          streamError = data.message ?? "章节起草失败";
          return;
        }

        if (event.event === "done") {
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
      return;
    }

    if (!candidateContent) return;

    let nextContent = content;
    if (mode === "replace") {
      nextContent = candidateContent;
    } else if (mode === "append") {
      nextContent = content
        ? `${content.replace(/\s+$/, "")}\n\n${candidateContent}`
        : candidateContent;
    } else if (mode === "insert") {
      const pos = cursorPosRef.current ?? content.length;
      nextContent = `${content.slice(0, pos)}${candidateContent}${content.slice(pos)}`;
    }

    setStatus("saving");
    setMessage("保存候选稿…");
    try {
      // Snapshot current body as a manual version *first* if it's non-empty —
      // gives the user a one-click way back to the pre-AI state.
      if (content.trim() && chapterId) {
        await fetch(`/api/chapters/${chapterId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content,
            title: chapterTitle,
            status: chapterStatus,
            source: "manual",
          }),
        }).catch(() => {
          // Snapshot best-effort — proceed even if it fails so user doesn't
          // lose the candidate they just chose to apply.
        });
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
  };
}
