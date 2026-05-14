"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { PageHeader } from "@/components/ui/PageHeader";
import type { ChapterFreshness } from "@/lib/agent/chapterStatus";
import {
  formatMemoryIndexFailureLocation,
  parseMemoryIndexFailure,
} from "@/lib/agent/indexFailure";

interface ChapterRow {
  chapter_index: number;
  title: string;
  outline_summary: string;
  status: string;
  target_words: number | null;
  word_count: number;
  updated_at?: string;
  summary_state?: ChapterFreshness;
  index_state?: ChapterFreshness;
  last_job_status?: string;
  last_job_type?: string;
  last_job_error?: string;
  chapter_id?: string;
}

interface VolumeBlock {
  name: string;
  theme: string;
  rows: ChapterRow[];
  volumeIndex: number;
}

type Filter = "all" | "draft" | "done" | "needsRefresh" | "failed" | "missing";

interface ChaptersClientProps {
  novelId: string;
  bibleTitle: string;
  volumes: VolumeBlock[];
  initialFilter: string;
  breadcrumb: { label: string; href?: string }[];
}

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "missing", label: "未起草" },
  { key: "draft", label: "草稿" },
  { key: "done", label: "已完成" },
  { key: "needsRefresh", label: "待刷新" },
  { key: "failed", label: "失败" },
];

export function ChaptersClient({
  novelId,
  volumes,
  initialFilter,
  breadcrumb,
}: ChaptersClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [filter, setFilter] = useState<Filter>(
    (FILTERS.some((f) => f.key === initialFilter) ? initialFilter : "all") as Filter,
  );
  const [refreshingId, setRefreshingId] = useState<string>();

  const setFilterAndUrl = (next: Filter) => {
    setFilter(next);
    const url = next === "all" ? `/novels/${novelId}/chapters` : `/novels/${novelId}/chapters?filter=${next}`;
    startTransition(() => router.replace(url));
  };

  const matchesFilter = (row: ChapterRow): boolean => {
    if (filter === "all") return true;
    if (filter === "missing") return row.status === "missing";
    if (filter === "draft") return row.status === "draft";
    if (filter === "done") return row.status === "done";
    if (filter === "needsRefresh") {
      return row.summary_state === "stale" || row.index_state === "stale";
    }
    if (filter === "failed") {
      return row.summary_state === "failed" || row.index_state === "failed" || row.last_job_status === "failed";
    }
    return true;
  };

  const refreshChapter = async (chapterId: string) => {
    setRefreshingId(chapterId);
    try {
      await fetch(`/api/novels/${novelId}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobs: [
            { type: "summarize_chapter", payload: { chapter_id: chapterId } },
            { type: "index_chapter", payload: { novel_id: novelId, chapter_id: chapterId } },
          ],
        }),
      });
      // Reload to pull new statuses (server component does the heavy lifting).
      router.refresh();
    } finally {
      setRefreshingId(undefined);
    }
  };

  // M3.1 batch flush. Single round-trip; the server scans dirty flags and
  // enqueues summarize / index for each match, plus one refresh_summaries
  // if any chapter resummarize was queued.
  const [batchRefreshing, setBatchRefreshing] = useState(false);
  const dirtyCount = volumes
    .flatMap((v) => v.rows)
    .filter((r) => r.summary_state === "stale" || r.index_state === "stale").length;

  const refreshAllDirty = async () => {
    if (batchRefreshing) return;
    setBatchRefreshing(true);
    try {
      await fetch(`/api/novels/${novelId}/jobs/refresh-dirty`, { method: "POST" });
      router.refresh();
    } finally {
      setBatchRefreshing(false);
    }
  };

  const totalDrafted = volumes.flatMap((v) => v.rows).filter((r) => r.status !== "missing").length;
  const totalDone = volumes.flatMap((v) => v.rows).filter((r) => r.status === "done").length;
  const total = volumes.reduce((sum, v) => sum + v.rows.length, 0);

  return (
    <div className="flex-1 overflow-y-auto bg-secondary/20 custom-scrollbar">
      <div className="p-8 md:p-12 lg:p-16 max-w-6xl mx-auto min-h-full">
        <PageHeader
          title="章节"
          description={`共 ${total} 章 · 已起草 ${totalDrafted} · 已完成 ${totalDone}`}
          breadcrumb={breadcrumb}
          actions={
            <div className="flex items-center gap-2">
              {dirtyCount > 0 && (
                <button
                  onClick={refreshAllDirty}
                  disabled={batchRefreshing}
                  className="btn-secondary gap-1 text-[12px] disabled:opacity-50"
                  title={`${dirtyCount} 个章节的摘要或索引已过期`}
                >
                  {batchRefreshing ? "刷新中…" : `刷新所有 dirty (${dirtyCount})`}
                </button>
              )}
              <Link href={`/editor/${novelId}`} className="btn-primary gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                进入写作
              </Link>
            </div>
          }
        />

        {/* Filter tabs */}
        <div className="mt-10 flex flex-wrap gap-1.5 border-b border-border-strong/30 pb-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilterAndUrl(f.key)}
              className={`px-4 py-2 text-[12px] font-bold rounded-lg transition-colors ${
                filter === f.key
                  ? "bg-text-primary text-white"
                  : "text-text-secondary hover:bg-secondary"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Volume blocks */}
        <div className="mt-8 space-y-12 pb-12">
          {volumes.map((volume) => {
            const visibleRows = volume.rows.filter(matchesFilter);
            if (visibleRows.length === 0) return null;
            return (
              <section key={volume.volumeIndex}>
                {volumes.length > 1 && (
                  <header className="mb-3 flex items-baseline justify-between">
                    <h2 className="text-base font-serif font-bold text-text-primary">
                      第 {volume.volumeIndex + 1} 卷 · {volume.name}
                    </h2>
                    <span className="text-[11px] text-text-muted">{volume.theme}</span>
                  </header>
                )}
                <div className="card bg-white p-0 overflow-hidden divide-y divide-border-subtle">
                  {visibleRows.map((row) => (
                    <ChapterRowItem
                      key={row.chapter_index}
                      novelId={novelId}
                      row={row}
                      refreshing={row.chapter_id === refreshingId}
                      onRefresh={() => row.chapter_id && refreshChapter(row.chapter_id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {volumes.flatMap((v) => v.rows).filter(matchesFilter).length === 0 && (
            <div className="card bg-white text-center py-16 text-sm text-text-muted">
              当前筛选下没有章节。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChapterRowItem({
  novelId,
  row,
  refreshing,
  onRefresh,
}: {
  novelId: string;
  row: ChapterRow;
  refreshing: boolean;
  onRefresh(): void;
}) {
  const isMissing = row.status === "missing";
  const indexFailure = row.index_state === "failed"
    ? parseMemoryIndexFailure(row.last_job_error)
    : null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-[80px_1fr_240px] gap-3 px-5 py-4 hover:bg-secondary/40 transition-colors items-center">
      <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
        Unit {String(row.chapter_index).padStart(2, "0")}
      </span>
      <div className="min-w-0">
        <Link
          href={`/editor/${novelId}?chapter=${row.chapter_index}`}
          className="block text-sm font-bold text-text-primary hover:text-primary truncate"
        >
          {row.title}
        </Link>
        <p className="mt-0.5 text-[11px] text-text-muted line-clamp-1">{row.outline_summary}</p>
        {indexFailure && (
          <p
            className="mt-1 text-[11px] text-red-600 line-clamp-2"
            title={`${formatMemoryIndexFailureLocation(indexFailure)}：${indexFailure.preview}`}
          >
            {formatMemoryIndexFailureLocation(indexFailure)}
            {indexFailure.preview ? ` · ${indexFailure.preview}` : ""}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 justify-start md:justify-end">
        <StatusBadge status={row.status} />
        {!isMissing && (
          <>
            {row.summary_state && <FreshnessBadge label="摘要" state={row.summary_state} />}
            {row.index_state && <FreshnessBadge label="索引" state={row.index_state} />}
            <span className="text-[10px] text-text-muted">
              {row.target_words
                ? `${row.word_count}/${row.target_words} 字`
                : `${row.word_count} 字`}
            </span>
            {row.chapter_id && (row.summary_state !== "fresh" || row.index_state !== "fresh") && (
              <button
                onClick={onRefresh}
                disabled={refreshing}
                className="text-[10px] font-bold text-primary hover:underline disabled:opacity-50"
                title="重新生成摘要并重建索引"
              >
                {refreshing ? "刷新中…" : "重新刷新"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    missing: "bg-secondary text-text-muted border-border-subtle",
    draft: "bg-amber-50 text-amber-700 border-amber-100",
    done: "bg-emerald-50 text-emerald-700 border-emerald-100",
  };
  const labels: Record<string, string> = {
    missing: "未起草",
    draft: "草稿",
    done: "已完成",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${styles[status] ?? styles.missing}`}>
      {labels[status] ?? status}
    </span>
  );
}

function FreshnessBadge({ label, state }: { label: string; state: ChapterFreshness }) {
  const styles: Record<ChapterFreshness, string> = {
    fresh: "bg-emerald-50 text-emerald-700 border-emerald-100",
    stale: "bg-amber-50 text-amber-700 border-amber-100",
    missing: "bg-secondary text-text-muted border-border-subtle",
    running: "bg-primary/10 text-primary border-primary/20",
    failed: "bg-red-50 text-red-700 border-red-100",
  };
  const symbols: Record<ChapterFreshness, string> = {
    fresh: "✓",
    stale: "⏳",
    missing: "—",
    running: "↻",
    failed: "✗",
  };
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider border ${styles[state]}`}
      title={`${label}：${state}`}
    >
      {symbols[state]} {label}
    </span>
  );
}
