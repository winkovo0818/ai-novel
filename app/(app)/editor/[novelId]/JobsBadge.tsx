"use client";

import { useEffect, useState } from "react";

interface JobsSummary {
  pending: number;
  running: number;
  failed: number;
}

interface JobRow {
  id: string;
  type: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  finished_at: string | null;
}

interface JobsBadgeProps {
  novelId: string;
  /** Polling interval in ms; defaults to 5s. Pass 0 to disable polling. */
  intervalMs?: number;
}

const TYPE_LABELS: Record<string, string> = {
  summarize_chapter: "章节摘要",
  index_chapter: "章节索引",
  refresh_summaries: "卷/全书摘要",
};

/**
 * Badge that polls /api/novels/[id]/jobs and surfaces the state of
 * background memory work — chapter summarize, RAG indexing, tiered
 * summary refresh. Click to expand a panel showing recent jobs with
 * a per-job retry action that hits POST /jobs/:jobId/retry.
 */
export function JobsBadge({ novelId, intervalMs = 5000 }: JobsBadgeProps) {
  const [summary, setSummary] = useState<JobsSummary | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [open, setOpen] = useState(false);
  const [retryingId, setRetryingId] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function fetchJobs() {
      try {
        const res = await fetch(`/api/novels/${novelId}/jobs`);
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.ok && json.data) {
          if (json.data.summary) setSummary(json.data.summary as JobsSummary);
          if (Array.isArray(json.data.jobs)) setJobs(json.data.jobs as JobRow[]);
        }
      } catch {
        // Silent — badge is best-effort UI.
      }
    }

    function schedule() {
      if (intervalMs <= 0) return;
      timer = setTimeout(async () => {
        await fetchJobs();
        if (!cancelled) schedule();
      }, intervalMs);
    }

    void fetchJobs();
    schedule();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [novelId, intervalMs]);

  async function retryJob(jobId: string) {
    setRetryingId(jobId);
    try {
      const res = await fetch(`/api/novels/${novelId}/jobs/${jobId}/retry`, {
        method: "POST",
      });
      if (res.ok) {
        // Optimistically refresh the panel.
        const summaryRes = await fetch(`/api/novels/${novelId}/jobs`);
        const summaryJson = await summaryRes.json();
        if (summaryJson.ok && summaryJson.data) {
          if (summaryJson.data.summary) setSummary(summaryJson.data.summary);
          if (Array.isArray(summaryJson.data.jobs)) setJobs(summaryJson.data.jobs);
        }
      }
    } finally {
      setRetryingId(undefined);
    }
  }

  if (!summary) return null;
  const active = summary.pending + summary.running;
  const visible = active > 0 || summary.failed > 0;
  if (!visible) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 text-[11px] font-medium rounded-full px-2.5 py-1 border transition-colors ${
          summary.failed > 0
            ? "text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100"
            : "text-text-muted bg-secondary/40 border-border-strong/50 hover:bg-secondary"
        }`}
        title={
          summary.failed > 0
            ? `${summary.failed} 个记忆任务失败，点击查看`
            : `${summary.pending} 待处理 · ${summary.running} 进行中，点击查看`
        }
      >
        {active > 0 ? (
          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.74-3L13.74 4a2 2 0 00-3.48 0L3.34 16a2 2 0 001.73 3z" />
          </svg>
        )}
        {summary.failed > 0
          ? `${summary.failed} 失败`
          : `记忆刷新 ${active}`}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-[360px] max-h-[400px] overflow-y-auto z-30 bg-white border border-border-strong rounded-xl shadow-2xl text-[12px]"
        >
          <header className="px-4 py-3 border-b border-border-subtle bg-secondary/30 flex items-center justify-between">
            <strong className="text-text-primary">最近 20 个记忆任务</strong>
            <button onClick={() => setOpen(false)} className="text-text-muted hover:text-text-primary text-base">×</button>
          </header>
          {jobs.length === 0 ? (
            <p className="px-4 py-6 text-center text-text-muted">没有任务</p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {jobs.map((job) => (
                <li key={job.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-text-primary">
                        {TYPE_LABELS[job.type] ?? job.type}
                      </p>
                      <p className="text-[10px] text-text-muted mt-0.5">
                        {new Date(job.created_at).toLocaleTimeString("zh-CN")}
                        {" · "}尝试 {job.attempts}
                      </p>
                      {job.last_error && (
                        <p className="text-[11px] text-red-600 mt-1 line-clamp-2">
                          {job.last_error}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusPill status={job.status} />
                      {job.status === "failed" && (
                        <button
                          onClick={() => retryJob(job.id)}
                          disabled={retryingId === job.id}
                          className="text-[10px] font-bold text-primary hover:underline disabled:opacity-50"
                        >
                          {retryingId === job.id ? "重试中…" : "重试"}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-secondary text-text-muted border-border-subtle",
    running: "bg-primary/10 text-primary border-primary/20",
    done: "bg-emerald-50 text-emerald-700 border-emerald-100",
    failed: "bg-red-50 text-red-700 border-red-100",
  };
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider border ${styles[status] ?? styles.pending}`}>
      {status}
    </span>
  );
}
