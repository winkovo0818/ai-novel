import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/format/datetime";

interface NovelCardProps {
  id: string;
  title: string;
  description?: string;
  chapterCount: number;
  doneCount: number;
  updatedAt: string;
  hasBible: boolean;
  onDelete?: (id: string) => Promise<void>;
}

export function NovelCard({ id, title, description, chapterCount, doneCount, updatedAt, hasBible, onDelete }: NovelCardProps) {
  const progress = chapterCount > 0 ? Math.round((doneCount / chapterCount) * 100) : 0;
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onDelete) return;
    if (!confirming) {
      setConfirming(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setConfirming(false), 3000);
      return;
    }
    setDeleting(true);
    onDelete(id).finally(() => {
      setDeleting(false);
      setConfirming(false);
    });
  }, [onDelete, confirming, id]);

  return (
    <div className="group relative bg-white border border-border-subtle rounded-2xl overflow-hidden shadow-sm transition duration-300 hover:shadow-premium hover:border-primary/20 flex flex-col h-full focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2">
      {onDelete && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className={`absolute top-3 right-3 z-10 h-7 w-7 rounded-full flex items-center justify-center transition-all duration-200 ${
            confirming
              ? "bg-red-500 text-white shadow-md scale-100"
              : "bg-white/80 text-text-dim opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 shadow-sm border border-border-subtle"
          }`}
          aria-label={confirming ? "确认移入回收状态" : "删除作品"}
          title={confirming ? "再次点击确认移入回收状态" : "删除"}
        >
          {deleting ? (
            <span className="h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin" aria-hidden="true" />
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          )}
        </button>
      )}

      <Link
        href={`/novels/${id}`}
        className="flex flex-col flex-1 focus-visible:outline-none"
      >
        <div className={`h-1.5 transition-colors duration-500 ${hasBible ? 'bg-primary' : 'bg-amber-400'}`} />

        <div className="p-6 flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-bold text-text-dim uppercase tracking-wider font-mono">
              #{id.slice(0, 6).toUpperCase()}
            </span>
            {hasBible && (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-primary/5 rounded-full ring-1 ring-primary/20">
                <span className="text-[9px] font-bold text-primary uppercase tracking-tight">World Bible</span>
              </div>
            )}
          </div>

          <h3 className="text-lg font-serif font-bold text-text-primary group-hover:text-primary transition-colors leading-snug line-clamp-2 mb-3">
            {title}
          </h3>

          {description ? (
            <p className="text-[13px] leading-relaxed text-text-muted line-clamp-3 mb-6">
              {description}
            </p>
          ) : null}

          <div className="mt-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
                 创作进度
              </span>
              <span className="text-[11px] font-bold text-primary">
                {progress}%
              </span>
            </div>

            <progress
              className="progress-bar h-1.5 w-full"
              max={100}
              value={progress}
              aria-label="创作进度"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            />

            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs font-bold text-text-secondary">
                {doneCount} <span className="text-text-dim font-medium uppercase text-[10px]">已完结</span>
              </span>
              <span className="text-text-dim">/</span>
              <span className="text-xs font-bold text-text-secondary">
                {chapterCount} <span className="text-text-dim font-medium uppercase text-[10px]">总章节</span>
              </span>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-secondary/20 border-t border-border-subtle flex items-center justify-between">
          <span className="text-[10px] text-text-dim font-bold uppercase tracking-wider flex items-center gap-1.5">
            <svg aria-hidden="true" className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {formatDate(updatedAt)}
          </span>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-text-dim group-hover:text-primary transition-colors">
            打开项目
            <span className="h-7 w-7 rounded-full bg-white border border-border-strong flex items-center justify-center group-hover:border-primary transition">
              <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}
