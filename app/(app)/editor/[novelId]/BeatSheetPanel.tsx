"use client";

import { useState, useRef, useEffect } from "react";

export interface BeatItem {
  index: number;
  description: string;
}

function AutoTextArea({ 
  value, 
  onChange, 
  placeholder 
}: { 
  value: string; 
  onChange: (val: string) => void; 
  placeholder?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="flex-1 text-[12px] text-text-secondary bg-secondary/20 border border-transparent rounded-xl px-3 py-2 leading-relaxed focus:bg-white focus:border-primary/20 focus:outline-none focus:ring-4 focus:ring-primary/5 transition shadow-inner hover:bg-secondary/40 resize-none overflow-hidden min-h-[40px]"
    />
  );
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
      <section className="border border-border-subtle rounded-2xl bg-secondary/20 p-5 text-[12px] text-text-muted leading-relaxed italic">
        节拍生成仅在第 2 章及以后可用。第 1 章使用 Bible 中的内置起始节拍。
      </section>
    );
  }

  if (beats.length === 0 && !loading) {
    return (
      <section className="border border-border-subtle rounded-2xl bg-white p-5 space-y-4 shadow-sm">
        <div>
          <h4 className="text-[13px] font-bold text-text-primary mb-1">章节节拍生成</h4>
          <p className="text-[11px] text-text-dim leading-relaxed">
            为第 {chapterIndex} 章「{chapterTitle}」生成 5-8 个关键场景，便于逐段起草。
          </p>
        </div>
        <div className="relative group">
          <input
            type="text"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="本章节核心目标（可选）"
            className="w-full text-[12px] bg-secondary/30 border border-transparent rounded-xl px-4 py-2.5 focus:border-primary/30 focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary/5 transition shadow-inner"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-text-dim opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            SCENE GOAL
          </div>
        </div>
        {error && <p className="text-[11px] text-red-600 font-bold animate-shake">{error}</p>}
        <button
          onClick={() => onGenerate(goal.trim() || undefined)}
          className="w-full btn-primary text-xs font-bold py-3 rounded-xl shadow-lg shadow-primary/10 flex items-center justify-center gap-2 group active:scale-95 transition"
        >
          <svg aria-hidden="true" className="w-4 h-4 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.628.283a2 2 0 01-1.186.128l-2.094-.31a2 2 0 00-1.226.226l-1.314.876a2 2 0 01-.813.294l-1.606.16a2 2 0 00-1.225.565l-1.141.913a2 2 0 01-1.127.38H2" />
          </svg>
          生成章节节拍
        </button>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="border border-border-subtle rounded-2xl bg-white p-8 text-center shadow-sm">
        <div className="relative w-10 h-10 mx-auto mb-4">
          <div className="absolute inset-0 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
          <div className="absolute inset-2 rounded-full border-2 border-primary/10 border-b-primary animate-spin-slow" />
        </div>
        <p className="text-[12px] font-bold text-text-dim uppercase tracking-widest">
          正在生成章节节拍...
        </p>
      </section>
    );
  }

  return (
    <section className="border border-border-subtle rounded-2xl bg-white p-5 space-y-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
           <div className="w-1 h-3 bg-primary rounded-full" />
           <h4 className="text-[13px] font-bold text-text-primary tracking-tight">章节节拍 / BEATS</h4>
        </div>
        <button
          onClick={onClear}
          className="text-[10px] font-bold text-text-dim hover:text-red-500 uppercase tracking-wider transition-colors px-2 py-1 hover:bg-red-50 rounded-lg"
          title="清空当前节拍并重新生成"
        >
          RESET
        </button>
      </div>
      <div className="space-y-3">
        {beats.map((beat, i) => (
          <div key={beat.index} className="flex items-start gap-3 group/beat">
            <span className="text-[11px] font-bold text-primary bg-primary/5 w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-1 shadow-sm border border-primary/10">
              {beat.index}
            </span>
            <AutoTextArea
              value={beat.description}
              onChange={(val) => {
                const next = [...beats];
                next[i] = { ...beat, description: val };
                onUpdateBeats(next);
              }}
              placeholder="场景描述..."
            />
          </div>
        ))}
      </div>
      {error && <p className="text-[11px] text-red-600 font-bold bg-red-50 p-3 rounded-xl border border-red-100">{error}</p>}
      <button
        onClick={onDraft}
        className="w-full btn-primary text-xs font-bold py-3.5 rounded-xl shadow-xl shadow-primary/20 flex items-center justify-center gap-2 group active:scale-[0.98] transition"
      >
        <svg aria-hidden="true" className="w-4 h-4 group-hover:animate-bounce" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
        </svg>
        基于节拍起草本章
      </button>
    </section>
  );
}
