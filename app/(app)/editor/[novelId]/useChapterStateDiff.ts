"use client";

import { useState } from "react";

import { buildStateDiffRequest } from "@/lib/editor/chapterUtils";
import type { StateDiff } from "@/lib/validation/schemas";

interface UseChapterStateDiffOptions {
  chapterId?: string;
}

export function useChapterStateDiff({ chapterId }: UseChapterStateDiffOptions) {
  const [stateDiffOpen, setStateDiffOpen] = useState(false);
  const [stateDiffLoading, setStateDiffLoading] = useState(false);
  const [stateDiff, setStateDiff] = useState<StateDiff>();
  const [stateDiffError, setStateDiffError] = useState<string>();
  const [pendingStateDiff, setPendingStateDiff] = useState<StateDiff | null>(null);
  const [pendingStateDiffChapterIndex, setPendingStateDiffChapterIndex] = useState(0);
  const [autoStateDiffError, setAutoStateDiffError] = useState<{
    message: string;
    chapterIndex: number;
  } | null>(null);

  function dismissAutoStateDiffError() {
    setAutoStateDiffError(null);
  }

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
      const request = buildStateDiffRequest(chapterId);
      const response = await fetch(request.url, { method: request.method });
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
  };
}
