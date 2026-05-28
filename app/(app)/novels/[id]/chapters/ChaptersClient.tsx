"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { PageHeader } from "@/components/ui/PageHeader";
import { DiffView } from "@/components/ui/DiffView";
import type { ChapterFreshness } from "@/lib/agent/chapterStatus";
import type { SummaryDiffMetadata } from "@/lib/agent/summaryDiff";
import {
  formatMemoryIndexFailureLocation,
  parseMemoryIndexFailure,
} from "@/lib/agent/indexFailure";

interface ChapterRow {
  chapter_index: number;
  title: string;
  outline_summary: string;
  summary_text?: string;
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

interface SummaryPreview {
  chapterId: string;
  chapterIndex: number;
  title: string;
  previousSummary: string;
  summary: string;
  diff: SummaryDiffMetadata;
}

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
  const [summaryPreview, setSummaryPreview] = useState<SummaryPreview | null>(null);
  const [summaryPreviewError, setSummaryPreviewError] = useState<string>();
  const [applyingSummary, setApplyingSummary] = useState(false);
  const [pageError, setPageError] = useState<string>();

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

  const previewChapterSummary = async (row: ChapterRow) => {
    if (!row.chapter_id || refreshingId) return;
    setRefreshingId(row.chapter_id);
    setSummaryPreviewError(undefined);
    setSummaryPreview(null);
    try {
      const response = await fetch(`/api/chapters/${row.chapter_id}/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "preview" }),
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error?.message ?? "摘要刷新失败");
      setSummaryPreview({
        chapterId: row.chapter_id,
        chapterIndex: row.chapter_index,
        title: row.title,
        previousSummary: json.data.previousSummary ?? "",
        summary: json.data.summary ?? "",
        diff: json.data.diff,
      });
    } catch (err) {
      setPageError(err instanceof Error ? err.message : "摘要刷新失败");
    } finally {
      setRefreshingId(undefined);
    }
  };

  const applySummaryPreview = async () => {
    if (!summaryPreview || applyingSummary) return;
    setApplyingSummary(true);
    setSummaryPreviewError(undefined);
    try {
      const response = await fetch(`/api/chapters/${summaryPreview.chapterId}/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "apply", summary: summaryPreview.summary }),
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error?.message ?? "摘要保存失败");
      setSummaryPreview(null);
      router.refresh();
    } catch (err) {
      setSummaryPreviewError(err instanceof Error ? err.message : "摘要保存失败");
    } finally {
      setApplyingSummary(false);
    }
  };

  const refreshChapterIndex = async (chapterId: string) => {
    setRefreshingId(chapterId);
    try {
      await fetch(`/api/novels/${novelId}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobs: [
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
  // enqueues index jobs for each matching chapter. Summary refreshes stay
  // per-chapter so the user can inspect the diff before overwriting.
  const [batchRefreshing, setBatchRefreshing] = useState(false);
  const dirtyCount = volumes
    .flatMap((v) => v.rows)
    .filter((r) => r.summary_state === "stale" || r.index_state === "stale").length;
  const staleSummaryRows = volumes
    .flatMap((v) => v.rows)
    .filter((r) => r.chapter_id && r.summary_state !== "fresh");
  const dirtyIndexIds = volumes
    .flatMap((v) => v.rows)
    .filter((r) => r.chapter_id && r.index_state !== "fresh")
    .map((r) => r.chapter_id as string);

  const refreshAllDirty = async () => {
    if (batchRefreshing) return;
    if (staleSummaryRows.length > 0) {
      await previewChapterSummary(staleSummaryRows[0]);
      return;
    }
    if (dirtyIndexIds.length === 0) return;
    setBatchRefreshing(true);
    setPageError(undefined);
    try {
      const response = await fetch(`/api/novels/${novelId}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobs: dirtyIndexIds.slice(0, 10).map((chapterId) => ({
            type: "index_chapter",
            payload: { novel_id: novelId, chapter_id: chapterId },
          })),
        }),
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error?.message ?? "索引刷新失败");
      router.refresh();
    } catch (err) {
      setPageError(err instanceof Error ? err.message : "索引刷新失败");
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
                  title={
                    staleSummaryRows.length > 0
                      ? `${staleSummaryRows.length} 个章节摘要需要确认后刷新`
                      : `${dirtyIndexIds.length} 个章节索引已过期`
                  }
                >
                  {batchRefreshing
                    ? "刷新中…"
                    : staleSummaryRows.length > 0
                      ? `确认摘要 (${staleSummaryRows.length})`
                      : `刷新索引 (${dirtyIndexIds.length})`}
                </button>
              )}
              <Link href={`/novels/${novelId}/memories`} className="btn-secondary gap-2">
                <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6c0-1.657 3.582-3 8-3s8 1.343 8 3-3.582 3-8 3-8-1.343-8-3zm0 0v6c0 1.657 3.582 3 8 3s8-1.343 8-3V6m-16 6v6c0 1.657 3.582 3 8 3s8-1.343 8-3v-6" />
                </svg>
                记忆库
              </Link>
              <Link href={`/editor/${novelId}`} className="btn-primary gap-2">
                <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                进入写作
              </Link>
            </div>
          }
        />

        {pageError && (
          <div className="mt-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {pageError}
          </div>
        )}

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
                      onRefreshSummary={() => previewChapterSummary(row)}
                      onRefreshIndex={() => row.chapter_id && refreshChapterIndex(row.chapter_id)}
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
      {summaryPreview && (
        <SummaryPreviewDialog
          preview={summaryPreview}
          error={summaryPreviewError}
          applying={applyingSummary}
          onClose={() => {
            if (!applyingSummary) setSummaryPreview(null);
          }}
          onApply={applySummaryPreview}
        />
      )}
    </div>
  );
}

function ChapterRowItem({
  novelId,
  row,
  refreshing,
  onRefreshSummary,
  onRefreshIndex,
}: {
  novelId: string;
  row: ChapterRow;
  refreshing: boolean;
  onRefreshSummary(): void;
  onRefreshIndex(): void;
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
        <p className="mt-0.5 text-[11px] text-text-muted line-clamp-1">{row.summary_text || row.outline_summary}</p>
        {row.summary_text && (
          <p className="mt-0.5 text-[10px] text-text-dim italic line-clamp-1">AI 摘要：{row.summary_text}</p>
        )}
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
            {row.chapter_id && row.summary_state !== "fresh" && (
              <button
                onClick={onRefreshSummary}
                disabled={refreshing}
                className="text-[10px] font-bold text-primary hover:underline disabled:opacity-50"
                title="生成摘要预览，确认后覆盖旧摘要"
              >
                {refreshing ? "生成中…" : "刷新摘要"}
              </button>
            )}
            {row.chapter_id && row.index_state !== "fresh" && (
              <button
                onClick={onRefreshIndex}
                disabled={refreshing}
                className="text-[10px] font-bold text-primary hover:underline disabled:opacity-50"
                title="重建本章 RAG 索引"
              >
                {refreshing ? "刷新中…" : "刷新索引"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SummaryPreviewDialog({
  preview,
  error,
  applying,
  onClose,
  onApply,
}: {
  preview: SummaryPreview;
  error?: string;
  applying: boolean;
  onClose(): void;
  onApply(): void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="summary-preview-title"
      >
        <div className="flex items-center justify-between p-6 border-b border-border-subtle">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted opacity-70">
              Chapter {String(preview.chapterIndex).padStart(2, "0")} / Summary Diff
            </p>
            <h3 id="summary-preview-title" className="text-lg font-serif font-bold text-text-primary">
              覆盖摘要前确认
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={applying}
            className="p-2 hover:bg-secondary rounded-lg text-text-muted transition-colors disabled:opacity-50"
            aria-label="关闭"
          >
            <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="px-6 py-4 border-b border-border-subtle bg-secondary/20">
            <h4 className="text-sm font-bold text-text-primary truncate">{preview.title}</h4>
            <p className="mt-1 text-[11px] text-text-muted">
              {preview.diff.changed
                ? `新增 ${preview.diff.addedCharacters} 字 · 删除 ${preview.diff.removedCharacters} 字`
                : "新旧摘要一致"}
            </p>
          </div>

          {error && (
            <div className="m-6 mb-0 p-3 rounded-md bg-red-50 border border-red-100 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="p-4">
            <DiffView before={preview.previousSummary} after={preview.summary} />
          </div>
        </div>

        <div className="p-6 border-t border-border-subtle bg-secondary/10 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            onClick={onClose}
            disabled={applying}
            className="btn-secondary text-xs font-bold py-3 px-6 disabled:opacity-50"
          >
            保留旧摘要
          </button>
          <button
            onClick={onApply}
            disabled={applying}
            className="btn-primary text-xs font-bold py-3 px-6 disabled:opacity-50"
          >
            {applying ? "保存中…" : "确认覆盖摘要"}
          </button>
        </div>
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
