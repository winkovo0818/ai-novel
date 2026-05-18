import React, { useEffect, useState } from "react";

interface EditorToolbarProps {
  novelId: string;
  chapterIndex: number;
  summary?: string;
  chapterTitle: string;
  chapterStatus: "draft" | "done";
  isSaved: boolean;
  characterCount: number;
  status: "idle" | "saving" | "saved" | "drafting" | "error";
  message?: string;
  hasUnsavedChanges: boolean;
  targetWords?: number | null;
  lastSavedAt?: string;
  onTitleChange(title: string): void;
  onDraftChapter(): void;
  onToggleStatus(): void;
  onSave(): void;
  onDeleteChapter(): void;
  onOpenVersions(): void;
  onSetTargetWords(value: number | null): void;
}

export function EditorToolbar({
  novelId,
  chapterIndex,
  chapterTitle,
  chapterStatus,
  status,
  isSaved,
  characterCount,
  targetWords,
  lastSavedAt,
  onTitleChange,
  onToggleStatus,
  onSave,
  onDeleteChapter,
  onOpenVersions,
  onSetTargetWords,
}: EditorToolbarProps) {
  const isBusy = status === "drafting" || status === "saving";
  const lastSavedRelative = useRelativeTime(lastSavedAt);
  const chapterCost = useChapterCost(novelId, chapterIndex);

  return (
    <div className="flex flex-col gap-8 mb-10 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
        <div className="flex-1 max-w-2xl">
          <input
            className="w-full bg-transparent border-none text-4xl font-serif font-bold text-text-primary placeholder:text-text-dim/20 focus:outline-none focus:ring-0 p-0 leading-tight transition"
            value={chapterTitle}
            spellCheck={false}
            placeholder="请输入章节标题…"
            onChange={(e) => onTitleChange(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onToggleStatus}
            title={chapterStatus === "done" ? "恢复为草稿" : "标记为已完成"}
            aria-label={chapterStatus === "done" ? "恢复为草稿" : "标记为已完成"}
            className={`p-2.5 rounded-xl border transition duration-200 focus-visible:ring-2 focus-visible:ring-emerald-500 ${
              chapterStatus === "done"
                ? "bg-emerald-50 border-emerald-200 text-emerald-600 shadow-sm"
                : "bg-white border-border-strong text-text-dim hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50/30"
            }`}
            disabled={isBusy}
          >
            <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>

          <button
            onClick={onSave}
            disabled={isBusy || !chapterTitle.trim()}
            aria-label={status === "saving" ? "正在保存…" : "保存草稿"}
            className={`btn-primary gap-2 min-w-[110px] px-5 py-2.5 rounded-xl shadow-premium focus-visible:ring-offset-2 ${status === "saving" ? "btn-loading" : ""}`}
          >
            <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            <span>保存草稿</span>
          </button>

          <div className="h-6 w-px bg-border-strong mx-1" />

          <button
            onClick={onOpenVersions}
            disabled={!isSaved}
            aria-label="查看历史版本"
            className="p-2.5 text-text-dim hover:text-primary hover:bg-primary/5 rounded-xl transition border border-transparent hover:border-primary/20 disabled:opacity-30 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-primary"
            title={isSaved ? "查看历史版本" : "保存后查看历史"}
          >
            <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>

          <button
            onClick={onDeleteChapter}
            aria-label="移除章节"
            className="p-2.5 text-text-dim hover:text-red-500 hover:bg-red-50 rounded-xl transition border border-transparent hover:border-red-100 focus-visible:ring-2 focus-visible:ring-red-500"
            title="移除章节"
          >
            <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Writing meta row: word target + cost + last saved */}
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-text-dim font-bold uppercase tracking-wider">
        <WordTarget characterCount={characterCount} target={targetWords} onSetTarget={onSetTargetWords} disabled={!isSaved} />
        {chapterCost !== null && (
          <>
            <span className="h-3 w-px bg-border-strong" />
            <span className="flex items-center gap-1" title="本项目累计 AI 调用成本">
              <svg aria-hidden="true" className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              ¥{chapterCost.cost.toFixed(4)} · {chapterCost.calls} 次调用
            </span>
          </>
        )}
        <span className="h-3 w-px bg-border-strong" />
        <span className="font-bold flex items-center gap-1.5">
          <svg aria-hidden="true" className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {lastSavedRelative ? `已于 ${lastSavedRelative} 保存` : "尚未保存到云端"}
        </span>
      </div>

      <div className="h-px bg-gradient-to-r from-border-strong/40 via-border-strong/40 to-transparent w-full" />
    </div>
  );
}

function WordTarget({
  characterCount,
  target,
  onSetTarget,
  disabled,
}: {
  characterCount: number;
  target: number | null | undefined;
  onSetTarget(value: number | null): void;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(String(target ?? ""));

  useEffect(() => {
    setDraftValue(String(target ?? ""));
  }, [target]);

  const commit = () => {
    setEditing(false);
    const trimmed = draftValue.trim();
    if (!trimmed) {
      if (target !== null) onSetTarget(null);
      return;
    }
    const num = Number(trimmed);
    if (!Number.isFinite(num) || num < 100 || num > 50_000) return;
    onSetTarget(Math.round(num));
  };

  if (target && !editing) {
    const pct = Math.min(100, Math.round((characterCount / target) * 100));
    return (
      <button
        type="button"
        onClick={() => !disabled && setEditing(true)}
        disabled={disabled}
        className="flex items-center gap-3 hover:text-text-secondary transition-colors disabled:cursor-not-allowed group"
        title={disabled ? "保存章节后才能设置目标字数" : "点击修改目标字数"}
      >
        <span className="font-bold">
          {characterCount.toLocaleString()} / {target.toLocaleString()} 字 · {pct}%
        </span>
        <progress
          className={`progress-bar h-1 w-16 ${pct >= 100 ? "progress-bar-complete" : ""}`}
          max={100}
          value={pct}
          aria-label="章节目标进度"
        />
      </button>
    );
  }

  if (editing) {
    return (
      <span className="flex items-center gap-2">
        <span className="font-bold">设定目标字数</span>
        <input
          type="number"
          min={100}
          max={50_000}
          autoFocus
          value={draftValue}
          onChange={(e) => setDraftValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setEditing(false);
              setDraftValue(String(target ?? ""));
            }
          }}
          placeholder="留空清除"
          className="w-20 px-2 py-1 bg-white border border-border-strong rounded-lg text-[11px] focus:border-primary focus:outline-none shadow-sm"
        />
        <button onClick={commit} className="text-primary text-[10px] font-bold uppercase tracking-widest hover:underline">
          确认
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => !disabled && setEditing(true)}
      disabled={disabled}
      className="flex items-center gap-2 hover:text-text-secondary transition-colors disabled:cursor-not-allowed group"
      title={disabled ? "保存章节后才能设置目标字数" : "设置目标字数"}
    >
      <span className="font-bold">{characterCount.toLocaleString()} 字</span>
      <span className="text-[9px] uppercase tracking-widest bg-secondary px-1.5 py-0.5 rounded text-text-dim group-hover:bg-primary/10 group-hover:text-primary transition-colors">+ 设定目标</span>
    </button>
  );
}

function useRelativeTime(timestamp?: string): string | undefined {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!timestamp) return;
    const id = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, [timestamp]);

  if (!timestamp) return undefined;
  const then = new Date(timestamp).getTime();
  if (Number.isNaN(then)) return undefined;
  const diff = Date.now() - then;
  if (diff < 30_000) return "刚刚";
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 24 * 60 * 60_000) return `${Math.floor(diff / (60 * 60_000))} 小时前`;
  return new Date(timestamp).toLocaleString("zh-CN", { month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
}

function useChapterCost(novelId: string, _chapterIndex: number): { cost: number; calls: number } | null {
  const [cost, setCost] = useState<{ cost: number; calls: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/novels/${novelId}/generations?limit=200`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.ok && Array.isArray(json.data?.generations)) {
          const rows: Array<{ cost_cny: number }> = json.data.generations;
          const totalCost = rows.reduce((sum: number, r: { cost_cny: number }) => sum + (r.cost_cny ?? 0), 0);
          if (rows.length > 0) {
            setCost({ cost: totalCost, calls: rows.length });
          }
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [novelId]);

  return cost;
}
