import React from "react";

interface EditorToolbarProps {
  selectedIndex: number;
  summary?: string;
  chapterTitle: string;
  chapterStatus: "draft" | "done";
  isSaved: boolean;
  characterCount: number;
  status: "idle" | "saving" | "saved" | "drafting" | "error";
  message?: string;
  hasUnsavedChanges: boolean;
  onTitleChange(title: string): void;
  onDraftChapter(): void;
  onToggleStatus(): void;
  onSave(): void;
  onDeleteChapter(): void;
  onOpenVersions(): void;
}

export function EditorToolbar({
  selectedIndex,
  chapterTitle,
  chapterStatus,
  status,
  isSaved,
  onTitleChange,
  onToggleStatus,
  onSave,
  onDeleteChapter,
  onOpenVersions,
}: EditorToolbarProps) {
  const isBusy = status === "drafting" || status === "saving";

  return (
    <div className="flex flex-col gap-10 mb-12">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
        <div className="flex-1 max-w-2xl">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-[10px] font-bold text-primary px-2 py-0.5 bg-primary/5 rounded-full border border-primary/10 uppercase tracking-[0.15em]">
              Unit {String(selectedIndex).padStart(2, "0")}
            </span>
            <div className="h-px w-8 bg-border-strong" />
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-[0.1em]">Manuscript Draft</span>
          </div>
          <input
            className="w-full bg-transparent border-none text-4xl font-serif font-bold text-text-primary placeholder:text-text-dim/30 focus:outline-none focus:ring-0 p-0 leading-tight"
            value={chapterTitle}
            spellCheck={false}
            placeholder="在此处镌刻章节标题..."
            onChange={(e) => onTitleChange(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2.5 pb-1">
          <button
            onClick={onToggleStatus}
            title={chapterStatus === "done" ? "恢复为草稿" : "标记为已完成"}
            className={`p-2.5 rounded-lg border transition-all duration-300 ${
              chapterStatus === "done" 
                ? "bg-emerald-50 border-emerald-200 text-emerald-600 shadow-inner" 
                : "bg-white border-border-strong text-text-secondary hover:border-emerald-300 hover:text-emerald-600"
            }`}
            disabled={isBusy}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          
          <button
            onClick={onSave}
            disabled={isBusy || !chapterTitle.trim()}
            className="btn-primary gap-2 min-w-[120px] shadow-lg shadow-text-primary/10"
          >
            {status === "saving" ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
            )}
            <span>保存原稿</span>
          </button>

          <button
            onClick={onOpenVersions}
            disabled={!isSaved}
            className="p-2.5 text-text-secondary hover:text-primary hover:bg-primary/5 rounded-lg transition-all border border-transparent hover:border-primary/20 disabled:opacity-40 disabled:cursor-not-allowed"
            title={isSaved ? "查看历史版本" : "保存后才有历史版本"}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>

          <button
            onClick={onDeleteChapter}
            className="p-2.5 text-text-dim hover:text-red-500 hover:bg-red-50 rounded-lg transition-all border border-transparent hover:border-red-100"
            title="废弃此章节"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
      
      <div className="h-px bg-gradient-to-r from-border-strong/50 via-border-strong to-transparent w-full" />
    </div>
  );
}
