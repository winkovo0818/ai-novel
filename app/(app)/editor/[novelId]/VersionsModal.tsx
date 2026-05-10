"use client";

import { useState } from "react";

import type { ChapterVersionView } from "./useChapterEditor";
import type { ChapterDraftView } from "./EditorClient";
import { DiffView } from "@/components/ui/DiffView";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { LoadingState, EmptyState } from "@/components/ui/StatusStates";

interface VersionsModalProps {
  open: boolean;
  selectedIndex: number;
  versions: ChapterVersionView[];
  loading: boolean;
  error?: string;
  /** Current draft body for diff comparison and as the "before" baseline. */
  currentContent: string;
  currentTitle: string;
  chapterId?: string;
  onClose(): void;
  /** Receives the freshly restored ChapterDraft so the editor can sync state without a full reload. */
  onRestored(chapter: ChapterDraftView): void;
}

type ViewMode = "list" | "diff";

export function VersionsModal({
  open,
  selectedIndex,
  versions,
  loading,
  error,
  currentContent,
  currentTitle,
  chapterId,
  onClose,
  onRestored,
}: VersionsModalProps) {
  const confirm = useConfirm();
  const [view, setView] = useState<ViewMode>("list");
  const [activeVersion, setActiveVersion] = useState<ChapterVersionView>();
  const [restoring, setRestoring] = useState(false);
  const [actionError, setActionError] = useState<string>();

  if (!open) return null;

  const closeAll = () => {
    setView("list");
    setActiveVersion(undefined);
    setActionError(undefined);
    onClose();
  };

  const openDiff = (version: ChapterVersionView) => {
    setActiveVersion(version);
    setView("diff");
    setActionError(undefined);
  };

  const handleRestore = async (version: ChapterVersionView) => {
    if (!chapterId) {
      setActionError("章节尚未保存，无法恢复");
      return;
    }
    const ok = await confirm({
      title: `恢复到此版本？`,
      message: `当前正文将先被存为新版本，再用 ${new Date(version.created_at).toLocaleString("zh-CN")} 的版本覆盖。可以再次回滚。`,
      confirmLabel: "恢复",
      danger: true,
    });
    if (!ok) return;

    setRestoring(true);
    setActionError(undefined);
    try {
      const res = await fetch(`/api/chapters/${chapterId}/versions/${version.id}/restore`, {
        method: "POST",
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "恢复失败");
      onRestored(json.data as ChapterDraftView);
      closeAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "恢复失败");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={closeAll}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            {view === "diff" && (
              <button
                onClick={() => {
                  setView("list");
                  setActiveVersion(undefined);
                }}
                className="p-2 hover:bg-secondary rounded-lg text-text-muted transition-colors"
                title="返回版本列表"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted opacity-70">
                Chapter {String(selectedIndex).padStart(2, "0")}
              </p>
              <h3 className="text-lg font-serif font-bold text-text-primary">
                {view === "diff" && activeVersion
                  ? `对比 · ${new Date(activeVersion.created_at).toLocaleString("zh-CN")}`
                  : "历史版本"}
              </h3>
            </div>
          </div>
          <button
            onClick={closeAll}
            className="p-2 hover:bg-secondary rounded-lg text-text-muted transition-colors"
            aria-label="关闭"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {actionError && (
            <div className="m-6 mb-0 p-3 rounded-md bg-red-50 border border-red-100 text-sm text-red-600">
              {actionError}
            </div>
          )}

          {view === "list" && (
            <div className="p-6 space-y-3">
              {loading && <LoadingState message="正在加载历史版本" />}
              {!loading && error && (
                <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600">
                  {error}
                </div>
              )}
              {!loading && !error && versions.length === 0 && (
                <EmptyState
                  title="暂无历史版本"
                  description="保存或 AI 起草后会在这里出现快照，可随时对比 / 恢复。"
                />
              )}
              {!loading &&
                versions.map((version) => (
                  <article
                    key={version.id}
                    className="border border-border-subtle rounded-xl p-5 hover:border-border-strong transition-colors"
                  >
                    <header className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-bold text-text-primary truncate">{version.title}</span>
                        <span className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border bg-secondary text-text-secondary border-border-strong shrink-0">
                          {version.source}
                        </span>
                        {version.status === "done" && (
                          <span className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                            done
                          </span>
                        )}
                      </div>
                      <time className="text-[11px] text-text-muted shrink-0 ml-2">
                        {new Date(version.created_at).toLocaleString("zh-CN")}
                      </time>
                    </header>
                    <p className="text-[13px] text-text-secondary leading-relaxed line-clamp-3 whitespace-pre-wrap mb-3">
                      {version.content || "（空）"}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openDiff(version)}
                        className="text-[11px] font-bold text-primary hover:underline"
                      >
                        与当前对比
                      </button>
                      <span className="text-text-dim">·</span>
                      <button
                        onClick={() => handleRestore(version)}
                        disabled={restoring}
                        className="text-[11px] font-bold text-text-secondary hover:text-red-600 disabled:opacity-50"
                      >
                        {restoring ? "恢复中…" : "恢复此版本"}
                      </button>
                    </div>
                  </article>
                ))}
            </div>
          )}

          {view === "diff" && activeVersion && (
            <div className="p-0">
              <div className="px-6 py-3 bg-secondary/30 border-b border-border-subtle flex items-center justify-between">
                <p className="text-[11px] text-text-muted">
                  <span className="text-red-600 font-bold">−</span> 历史版本
                  <span className="text-emerald-600 font-bold">+</span> 当前正文
                  {activeVersion.title !== currentTitle && (
                    <span className="ml-3 text-amber-700">标题也有变化</span>
                  )}
                </p>
                <button
                  onClick={() => handleRestore(activeVersion)}
                  disabled={restoring}
                  className="text-[11px] font-bold text-red-600 hover:underline disabled:opacity-50"
                >
                  {restoring ? "恢复中…" : "恢复到此版本"}
                </button>
              </div>
              <div className="p-4">
                <DiffView before={activeVersion.content} after={currentContent} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
