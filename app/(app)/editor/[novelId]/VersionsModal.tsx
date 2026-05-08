import React from "react";
import type { ChapterVersionView } from "./useChapterEditor";

interface VersionsModalProps {
  open: boolean;
  selectedIndex: number;
  versions: ChapterVersionView[];
  loading: boolean;
  error?: string;
  onClose(): void;
}

export function VersionsModal({ open, selectedIndex, versions, loading, error, onClose }: VersionsModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-border-subtle">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted opacity-70">
              Chapter {String(selectedIndex).padStart(2, "0")}
            </p>
            <h3 className="text-lg font-serif font-bold text-text-primary">历史版本</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary rounded-lg text-text-muted transition-colors"
            aria-label="关闭"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-3">
          {loading && (
            <div className="text-center py-12 text-sm text-text-muted">加载中...</div>
          )}
          {!loading && error && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600">
              {error}
            </div>
          )}
          {!loading && !error && versions.length === 0 && (
            <div className="text-center py-12 text-sm text-text-muted">暂无历史版本</div>
          )}
          {!loading && versions.map((version) => (
            <article key={version.id} className="border border-border-subtle rounded-xl p-5 hover:border-border-strong transition-colors">
              <header className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-text-primary">{version.title}</span>
                  <span className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border bg-secondary text-text-secondary border-border-strong">
                    {version.source}
                  </span>
                  {version.status === "done" && (
                    <span className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                      done
                    </span>
                  )}
                </div>
                <time className="text-[11px] text-text-muted">
                  {new Date(version.created_at).toLocaleString()}
                </time>
              </header>
              <p className="text-[13px] text-text-secondary leading-relaxed line-clamp-4 whitespace-pre-wrap">
                {version.content || "（空）"}
              </p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
