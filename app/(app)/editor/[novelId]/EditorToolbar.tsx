import React, { useEffect, useState } from "react";
import type { ChapterEditorStatus } from "@/lib/editor/chapterUtils";
import { useChapterQuality } from "./useChapterQuality";

interface EditorToolbarProps {
  novelId: string;
  chapterIndex: number;
  summary?: string;
  chapterTitle: string;
  chapterStatus: "draft" | "done";
  isSaved: boolean;
  characterCount: number;
  status: ChapterEditorStatus;
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


/* ------------------------------------------------------------------ */
/*  ChapterQualityBadge                                                */
/* ------------------------------------------------------------------ */

function ChapterQualityBadge({ quality }: { quality: ReturnType<typeof useChapterQuality> }) {
  const [open, setOpen] = useState(false);
  const { result, loading, error, fetchQuality } = quality;

  return (
    <div className="relative">
      <button
        onClick={() => { fetchQuality(); setOpen(!open); }}
        disabled={loading}
        className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition ${
          result && !result.coldStart
            ? result.scorePct! >= 85
              ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
              : result.scorePct! >= 70
              ? "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
              : "bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
            : "bg-white border-border-strong text-text-dim hover:border-primary/30 hover:text-primary"
        }`}
        title="评估本章写作质量"
      >
        {loading ? (
          <svg aria-hidden="true" className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg aria-hidden="true" className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        )}
        <span>
          {loading ? "评估中" : error ? "评估失败" : result?.coldStart ? `${result.chapterCount}/3 章` : result?.scorePct != null ? `${result.scorePct}%` : "评估"}
        </span>
        <svg aria-hidden="true" className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && result && !result.coldStart && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-white border border-border-strong rounded-2xl shadow-premium p-5 z-50 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-dim">
              第 {result.window?.[0] ?? "-"}-{result.window?.[2] ?? "-"} 章滑窗
            </p>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              result.scorePct! >= 85 ? "bg-emerald-50 text-emerald-700" :
              result.scorePct! >= 70 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"
            }`}>
              {result.scorePct}%
            </span>
          </div>

          <div className="space-y-3">
            {(result.dimensions ?? []).map((dim) => (
              <div key={dim.key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-text-secondary">{dim.label}</span>
                  <span className="text-[11px] font-bold tabular-nums text-text-primary">
                    {dim.score}/{dim.max}
                  </span>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      dim.score / dim.max >= 0.8 ? "bg-emerald-500" :
                      dim.score / dim.max >= 0.6 ? "bg-amber-500" : "bg-red-500"
                    }`}
                    style={{ width: `${(dim.score / dim.max) * 100}%` }}
                  />
                </div>
                {dim.warnings.length > 0 && (
                  <p className="mt-1 text-[10px] text-amber-600">{dim.warnings[0]}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {open && result?.coldStart && (
        <div className="absolute top-full right-0 mt-2 w-56 bg-white border border-border-strong rounded-2xl shadow-premium p-4 z-50 animate-fade-in">
          <p className="text-xs text-text-secondary leading-relaxed">{result.message}</p>
        </div>
      )}

      {open && error && (
        <div className="absolute top-full right-0 mt-2 w-56 bg-red-50 border border-red-100 rounded-2xl p-4 z-50 animate-fade-in">
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}
    </div>
  );
}

export function EditorToolbar({
  novelId,
  chapterIndex,
  summary,
  chapterTitle,
  chapterStatus,
  status,
  message,
  hasUnsavedChanges,
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
  const quality = useChapterQuality({ novelId, chapterIndex });
  const saveDisplay = getEditorSaveDisplay(status, hasUnsavedChanges, lastSavedRelative, message);

  return (
    <div className="editor-manuscript-header mb-8 flex animate-fade-in flex-col gap-5">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <p className="mb-3 text-[10px] font-black uppercase tracking-[0.24em] text-accent">
            Chapter {String(chapterIndex).padStart(2, "0")}
          </p>
          <input
            className="w-full border-none bg-transparent p-0 font-serif text-4xl font-normal leading-[1.04] tracking-normal text-text-primary transition placeholder:text-text-dim/20 focus:outline-none focus:ring-0 md:text-5xl"
            value={chapterTitle}
            spellCheck={false}
            placeholder="请输入章节标题…"
            onChange={(e) => onTitleChange(e.target.value)}
          />
          {summary && (
            <p className="mt-5 max-w-2xl border-l-2 border-accent/20 pl-4 text-[13px] leading-relaxed text-text-muted">
              {summary}
            </p>
          )}
        </div>

        <div className="editor-action-cluster flex shrink-0 flex-wrap items-center gap-1.5">
          <button
            onClick={onToggleStatus}
            title={chapterStatus === "done" ? "恢复为草稿" : "标记为已完成"}
            aria-label={chapterStatus === "done" ? "恢复为草稿" : "标记为已完成"}
            className={`editor-toolbar-icon transition duration-200 focus-visible:ring-2 focus-visible:ring-emerald-500 ${
              chapterStatus === "done"
                ? "border-emerald-200 bg-emerald-50 text-emerald-600 shadow-sm"
                : "border-transparent text-text-dim hover:border-emerald-200 hover:bg-emerald-50/50 hover:text-emerald-600"
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
            className={`editor-save-button min-w-[112px] gap-2 focus-visible:ring-offset-2 ${status === "saving" ? "btn-loading" : ""}`}
          >
            <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            <span>保存草稿</span>
          </button>

          <div className="mx-1 hidden h-5 w-px bg-border-strong/80 lg:block" />

          <button
            onClick={onOpenVersions}
            disabled={!isSaved}
            aria-label="查看历史版本"
            className="editor-toolbar-icon border-transparent text-text-dim transition hover:border-primary/20 hover:bg-primary/5 hover:text-primary disabled:cursor-not-allowed disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-primary"
            title={isSaved ? "查看历史版本" : "保存后查看历史"}
          >
            <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>

          <button
            onClick={onDeleteChapter}
            aria-label="移除章节"
            className="editor-toolbar-icon border-transparent text-text-dim transition hover:border-red-100 hover:bg-red-50 hover:text-red-500 focus-visible:ring-2 focus-visible:ring-red-500"
            title="移除章节"
          >
            <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      <div className="editor-meta-strip flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-text-dim">
        <span
          className={`inline-flex min-h-9 min-w-[156px] items-center gap-2 rounded-full border px-3 normal-case tracking-normal ${saveDisplay.className}`}
          title={saveDisplay.detail}
        >
          <span className={`h-2 w-2 rounded-full ${saveDisplay.dotClass} ${saveDisplay.pulse ? "animate-pulse" : ""}`} />
          <span className="truncate">{saveDisplay.label}</span>
        </span>
        <WordTarget characterCount={characterCount} target={targetWords} onSetTarget={onSetTargetWords} disabled={!isSaved} />
        {chapterCost !== null && (
          <>
            <span className="hidden h-3 w-px bg-border-strong sm:block" />
            <span className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border-subtle bg-white px-3 normal-case tracking-normal text-text-secondary" title="本项目累计 AI 调用成本">
              <svg aria-hidden="true" className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              ¥{chapterCost.cost.toFixed(4)} · {chapterCost.calls} 次
            </span>
          </>
        )}
        <span className="hidden h-3 w-px bg-border-strong sm:block" />
        <ChapterQualityBadge quality={quality} />
      </div>

      <div className="h-px w-full bg-gradient-to-r from-transparent via-border-strong/60 to-transparent" />
    </div>
  );
}

interface EditorSaveDisplay {
  label: string;
  detail: string;
  className: string;
  dotClass: string;
  pulse?: boolean;
}

export function getEditorSaveDisplay(
  status: ChapterEditorStatus,
  hasUnsavedChanges: boolean,
  lastSavedRelative?: string,
  message?: string,
): EditorSaveDisplay {
  const lastSavedText = lastSavedRelative ? `上次保存：${lastSavedRelative}` : "尚未保存到云端";
  const cleanLabel = lastSavedRelative ? `已保存 · ${lastSavedRelative}` : "已同步";

  if (status === "drafting") {
    return {
      label: "AI 生成中",
      detail: message ?? lastSavedText,
      className: "border-primary/20 bg-primary/5 text-primary",
      dotClass: "bg-primary",
      pulse: true,
    };
  }

  if (status === "saving") {
    return {
      label: "正在保存",
      detail: message ?? lastSavedText,
      className: "border-blue-200 bg-blue-50 text-blue-700",
      dotClass: "bg-blue-500",
      pulse: true,
    };
  }

  if (status === "conflict") {
    return {
      label: "版本冲突",
      detail: message ?? "云端版本较新，请先处理冲突",
      className: "border-amber-200 bg-amber-50 text-amber-800",
      dotClass: "bg-amber-500",
    };
  }

  if (status === "offline") {
    return {
      label: "离线未同步",
      detail: message ?? "网络恢复后再同步到云端",
      className: "border-red-200 bg-red-50 text-red-700",
      dotClass: "bg-red-500",
    };
  }

  if (status === "error") {
    return {
      label: "保存失败",
      detail: message ?? lastSavedText,
      className: "border-red-200 bg-red-50 text-red-700",
      dotClass: "bg-red-500",
    };
  }

  if (status === "dirty" || hasUnsavedChanges) {
    return {
      label: "有未保存修改",
      detail: lastSavedText,
      className: "border-amber-200 bg-amber-50 text-amber-700",
      dotClass: "bg-amber-500",
    };
  }

  if (status === "saved") {
    return {
      label: cleanLabel,
      detail: message ?? lastSavedText,
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      dotClass: "bg-emerald-500",
    };
  }

  return {
    label: cleanLabel,
    detail: lastSavedText,
    className: "border-border-subtle bg-secondary/60 text-text-secondary",
    dotClass: "bg-text-dim",
  };
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
    const overTarget = characterCount > target;
    const radius = 16;
    const circumference = 2 * Math.PI * radius;
    const fill = circumference * (1 - Math.min(characterCount / target, 1));
    // Color: red < 30% -> amber 30-70% -> green 70-100% -> orange >120%
    const strokeColor = overTarget && pct > 120
      ? "#f59e0b"  // amber-orange for overflow
      : pct >= 100
        ? "#10b981"  // emerald green for done
        : pct >= 70
          ? "#10b981"
          : pct >= 30
            ? "#f59e0b"
            : "#ef4444";
    return (
      <button
        type="button"
        onClick={() => !disabled && setEditing(true)}
        disabled={disabled}
        className="group inline-flex min-h-9 items-center gap-2.5 rounded-full border border-border-subtle bg-white px-3 normal-case tracking-normal transition-colors hover:border-primary/20 hover:text-text-secondary disabled:cursor-not-allowed disabled:opacity-60"
        title={disabled ? "保存章节后才能设置目标字数" : `${characterCount.toLocaleString()} / ${target.toLocaleString()} 字 (${pct}%)`}
      >
        <svg className="h-7 w-7 shrink-0 -rotate-90" viewBox="0 0 40 40" aria-label="章节目标进度">
          <circle cx="20" cy="20" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="3" />
          <circle
            cx="20" cy="20" r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={fill}
            className="transition-[stroke-dashoffset] duration-700 ease-out"
          />
        </svg>
        <span className="text-[12px] font-bold text-text-secondary">
          {characterCount.toLocaleString()} / {target.toLocaleString()} 字
        </span>
      </button>
    );
  }

  if (editing) {
    return (
      <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-border-subtle bg-white px-3 normal-case tracking-normal">
        <span className="font-bold text-text-secondary">目标字数</span>
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
          className="w-20 rounded-lg border border-border-strong bg-white px-2 py-1 text-[11px] shadow-sm focus:border-primary focus:outline-none"
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
      className="group inline-flex min-h-9 items-center gap-2 rounded-full border border-border-subtle bg-white px-3 normal-case tracking-normal transition-colors hover:border-primary/20 hover:text-text-secondary disabled:cursor-not-allowed disabled:opacity-60"
      title={disabled ? "保存章节后才能设置目标字数" : "设置目标字数"}
    >
      <span className="font-bold text-text-secondary">{characterCount.toLocaleString()} 字</span>
      <span className="rounded bg-secondary px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-text-dim transition-colors group-hover:bg-primary/10 group-hover:text-primary">+ 目标</span>
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

function useChapterCost(novelId: string, chapterIndex: number): { cost: number; calls: number } | null {
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
  }, [chapterIndex, novelId]);

  return cost;
}
