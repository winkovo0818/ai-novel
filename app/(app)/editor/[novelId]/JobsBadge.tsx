"use client";

import { useEffect, useState } from "react";

interface JobsSummary {
  pending: number;
  running: number;
  failed: number;
}

interface JobsBadgeProps {
  novelId: string;
  /** Polling interval in ms; defaults to 5s. Pass 0 to disable polling. */
  intervalMs?: number;
}

/**
 * Lightweight badge that polls /api/novels/[id]/jobs and shows the state
 * of background memory work — chapter summarize, RAG indexing, tiered
 * summary refresh. Stays invisible when the queue is idle.
 */
export function JobsBadge({ novelId, intervalMs = 5000 }: JobsBadgeProps) {
  const [summary, setSummary] = useState<JobsSummary | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function fetchSummary() {
      try {
        const res = await fetch(`/api/novels/${novelId}/jobs`);
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.ok && json.data?.summary) {
          setSummary(json.data.summary as JobsSummary);
        }
      } catch {
        // Silent — badge is best-effort UI.
      }
    }

    function schedule() {
      if (intervalMs <= 0) return;
      timer = setTimeout(async () => {
        await fetchSummary();
        if (!cancelled) schedule();
      }, intervalMs);
    }

    void fetchSummary();
    schedule();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [novelId, intervalMs]);

  if (!summary) return null;
  const active = summary.pending + summary.running;
  if (active === 0 && summary.failed === 0) return null;

  async function handleRetry() {
    if (retrying) return;
    setRetrying(true);
    try {
      // Re-enqueueing a refresh kicks the inline drain again, which will
      // flip any failed rows back to running on next attempt.
      await fetch(`/api/novels/${novelId}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobs: [{ type: "refresh_summaries", payload: { novel_id: novelId } }],
        }),
      });
    } catch {
      // Silent.
    } finally {
      setRetrying(false);
    }
  }

  if (active > 0) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-text-muted bg-secondary/40 border border-border-strong/50 rounded-full px-2.5 py-1"
        title={`${summary.pending} 待处理 · ${summary.running} 进行中`}
      >
        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        记忆刷新中
      </span>
    );
  }

  return (
    <button
      onClick={handleRetry}
      disabled={retrying}
      className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1 hover:bg-amber-100 transition-colors disabled:opacity-60"
      title={`${summary.failed} 个记忆任务失败，点击重试`}
    >
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.74-3L13.74 4a2 2 0 00-3.48 0L3.34 16a2 2 0 001.73 3z" />
      </svg>
      {retrying ? "重试中…" : "刷新失败 · 重试"}
    </button>
  );
}
