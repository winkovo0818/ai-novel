"use client";

import { useState } from "react";

export interface BeatItem {
  index: number;
  description: string;
}

interface BeatSheetPanelProps {
  chapterIndex: number;
  chapterTitle: string;
  /** Whether outline beats are available for this chapter (false on chapter 1 — bible has its own first_chapter_beats). */
  available: boolean;
  beats: BeatItem[];
  loading: boolean;
  error?: string;
  onGenerate(chapterGoal?: string): void;
  onUpdateBeats(beats: BeatItem[]): void;
  onClear(): void;
  onDraft(): void;
}

/**
 * Beat Sheet panel — renders inside AIPanel above the action grid. Two
 * states: empty (offer "生成节拍" with optional goal hint) and populated
 * (editable list of beats + "基于节拍起草" CTA that hands the beats to
 * the existing draftChapter flow).
 */
export function BeatSheetPanel({
  chapterIndex,
  chapterTitle,
  available,
  beats,
  loading,
  error,
  onGenerate,
  onUpdateBeats,
  onClear,
  onDraft,
}: BeatSheetPanelProps) {
  const [goal, setGoal] = useState("");

  if (!available) {
    return (
      <section className="border border-border-subtle rounded-lg bg-secondary/20 p-4 text-[11px] text-text-muted">
        节拍生成仅在第 2 章及以后可用。第 1 章使用 Bible 中的 first_chapter_beats。
      </section>
    );
  }

  if (beats.length === 0 && !loading) {
    return (
      <section className="border border-border-subtle rounded-lg bg-white p-4 space-y-3">
        <div>
          <h4 className="text-sm font-bold text-text-primary mb-1">章节节拍</h4>
          <p className="text-[11px] text-text-muted">
            为第 {chapterIndex} 章「{chapterTitle}」生成 5-8 个写作节拍。生成后可逐条编辑，再用节拍引导 AI 起草。
          </p>
        </div>
        <input
          type="text"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="（可选）本章节目标，例：让主角与师傅决裂"
          className="w-full text-[12px] bg-white border border-border-subtle rounded-md px-3 py-2 focus:border-primary focus:outline-none"
        />
        {error && <p className="text-[11px] text-red-600">{error}</p>}
        <button
          onClick={() => onGenerate(goal.trim() || undefined)}
          className="w-full btn-primary text-xs font-bold py-2"
        >
          生成节拍
        </button>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="border border-border-subtle rounded-lg bg-white p-4 text-center text-sm text-text-muted">
        <svg className="w-5 h-5 animate-spin text-primary mx-auto mb-2" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        正在生成节拍…
      </section>
    );
  }

  return (
    <section className="border border-border-subtle rounded-lg bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-text-primary">章节节拍（{beats.length}）</h4>
        <button
          onClick={onClear}
          className="text-[11px] text-text-muted hover:text-text-primary"
          title="清空当前节拍并重新生成"
        >
          重置
        </button>
      </div>
      <ol className="space-y-2 list-decimal list-inside">
        {beats.map((beat, i) => (
          <li key={beat.index} className="flex items-start gap-2">
            <span className="text-[10px] font-bold text-text-muted mt-2 w-4">{beat.index}.</span>
            <textarea
              value={beat.description}
              onChange={(e) => {
                const next = [...beats];
                next[i] = { ...beat, description: e.target.value };
                onUpdateBeats(next);
              }}
              rows={2}
              className="flex-1 text-[12px] bg-white border border-border-subtle rounded-md px-2 py-1.5 leading-relaxed focus:border-primary focus:outline-none resize-none"
            />
          </li>
        ))}
      </ol>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
      <button
        onClick={onDraft}
        className="w-full btn-primary text-xs font-bold py-2 gap-2"
      >
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
        </svg>
        基于节拍起草本章
      </button>
    </section>
  );
}
